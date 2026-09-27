// A share's own company data, built the first time it is analysed.
//
// Earnings releases, quarterly/annual figures and earnings-day moves used to
// exist only for the handful of symbols ingest-fundamentals and
// ingest-historical-events iterated (a provider list plus holdings), so every
// other share - most of the ~10,000 a user can search - was analysed with no
// scorecard and no results history. This fetches them from SEC on demand, for
// one share, when an analysis needs them, and stores them exactly as the
// weekly job would (the row builders are shared: _shared/sec-companyfacts.ts
// secHistoryRows, _shared/earnings-reactions.ts earningsReactionRows). From
// then on the scheduled jobs keep it fresh, since they now cover every
// available share in symbol_directory.
//
// SEC fair access: a real User-Agent contact, and at most one request every
// SEC_MIN_INTERVAL_MS across the whole process (their ceiling is 10/s). The
// ticker-to-CIK map is fetched once a day. A share whose data was refreshed
// within FRESH_DAYS is not fetched again.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBars } from "@/lib/ai/factor-analysis";
import {
  latestSharesOutstanding,
  parseCompanyFacts,
  parseEarningsReleases,
  secHistoryRows,
  trailingPerShare,
  type CompanyFacts,
  type Submissions,
} from "../../../supabase/functions/_shared/sec-companyfacts";
import { earningsReactionRows } from "../../../supabase/functions/_shared/earnings-reactions";
import { SEC_USER_AGENT } from "../../../supabase/functions/_shared/sec-user-agent";

const FRESH_DAYS = 7;
const SEC_MIN_INTERVAL_MS = 150;
const TICKER_MAP_TTL_MS = 24 * 60 * 60 * 1000;

export interface CompanyDataReport {
  symbol: string;
  /** "fresh": stored within FRESH_DAYS, not fetched. "fetched": pulled from SEC now. */
  sec: "fresh" | "fetched" | "no_cik" | "failed";
  detail?: string;
  releases: number;
  quarters: number;
  /** Earnings-day moves written (new or refreshed). */
  reactions: number;
}

// ------------------------------------------------------------ throttled fetch

let secChain: Promise<unknown> = Promise.resolve();
let lastSecCall = 0;

/** One SEC request at a time, spaced SEC_MIN_INTERVAL_MS apart, process-wide. */
function secJson(url: string): Promise<unknown | null> {
  const run = secChain.then(async () => {
    const wait = lastSecCall + SEC_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastSecCall = Date.now();
    const res = await fetch(url, { headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`SEC ${res.status} for ${new URL(url).pathname}`);
    return res.json();
  });
  secChain = run.catch(() => undefined);
  return run;
}

let tickerMap: { at: number; map: Map<string, string> } | null = null;

async function cikFor(symbol: string): Promise<string | null> {
  if (!tickerMap || Date.now() - tickerMap.at > TICKER_MAP_TTL_MS) {
    const raw = (await secJson("https://www.sec.gov/files/company_tickers.json")) as Record<string, { cik_str: number; ticker: string }> | null;
    if (!raw) throw new Error("SEC ticker map unavailable");
    const map = new Map<string, string>();
    for (const e of Object.values(raw)) map.set(e.ticker.toUpperCase(), String(e.cik_str).padStart(10, "0"));
    tickerMap = { at: Date.now(), map };
  }
  // SEC writes share classes with a dash (BRK-B); Cairn stores them the same way.
  return tickerMap.map.get(symbol.toUpperCase()) ?? tickerMap.map.get(symbol.toUpperCase().replace(".", "-")) ?? null;
}

// ------------------------------------------------------------- the entry point

const inFlight = new Map<string, Promise<CompanyDataReport>>();

/**
 * Make sure a US share has its SEC earnings releases, company figures and
 * earnings-day moves on file. Never throws: a failure is reported, and the
 * analysis goes on with what it has (the base rate needs only prices).
 */
export function ensureCompanyData(symbol: string): Promise<CompanyDataReport> {
  const existing = inFlight.get(symbol);
  if (existing) return existing;
  const run = build(symbol)
    .catch((err): CompanyDataReport => ({ symbol, sec: "failed", detail: err instanceof Error ? err.message : String(err), releases: 0, quarters: 0, reactions: 0 }))
    .finally(() => inFlight.delete(symbol));
  inFlight.set(symbol, run);
  return run;
}

async function build(symbol: string): Promise<CompanyDataReport> {
  const db = createAdminClient();
  const since = new Date(Date.now() - FRESH_DAYS * 86_400_000).toISOString();
  const { data: recent, error: readError } = await db.from("earnings_releases").select("release_date, accn, timing, updated_at").eq("symbol", symbol).order("release_date", { ascending: false }).limit(200);
  if (readError) throw new Error(`Failed to read earnings releases for ${symbol}: ${readError.message}`);
  const fresh = (recent ?? []).some((r) => r.updated_at && String(r.updated_at) >= since);

  let sec: CompanyDataReport["sec"] = "fresh";
  let quarters = 0;
  let releases = (recent ?? []).map((r) => ({ release_date: String(r.release_date), accn: String(r.accn), timing: (r.timing as string | null) ?? null }));

  if (!fresh) {
    const cik = await cikFor(symbol);
    if (!cik) return { symbol, sec: "no_cik", detail: "not in SEC's ticker map (a non-US listing or a fund)", releases: releases.length, quarters: 0, reactions: 0 };
    const [submissions, facts] = await Promise.all([
      secJson(`https://data.sec.gov/submissions/CIK${cik}.json`) as Promise<Submissions | null>,
      secJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`) as Promise<CompanyFacts | null>,
    ]);
    const parsed = facts?.facts?.["us-gaap"] ? parseCompanyFacts(facts) : null;
    const parsedReleases = submissions ? parseEarningsReleases(submissions) : [];
    const now = new Date().toISOString();
    const rows = secHistoryRows(symbol, cik, parsed, parsedReleases, now);
    const writes = await Promise.all([
      rows.quarters.length ? db.from("company_financials_quarterly").upsert(rows.quarters as never, { onConflict: "symbol,fiscal_year,fiscal_quarter" }) : Promise.resolve({ error: null }),
      rows.annual.length ? db.from("company_financials_annual").upsert(rows.annual as never, { onConflict: "symbol,fiscal_year" }) : Promise.resolve({ error: null }),
      rows.releases.length ? db.from("earnings_releases").upsert(rows.releases as never, { onConflict: "symbol,release_date" }) : Promise.resolve({ error: null }),
    ]);
    const failed = writes.find((w) => w.error);
    if (failed?.error) throw new Error(`Failed to store SEC data for ${symbol}: ${failed.error.message}`);

    // The scorecard's inputs, as the weekly job stores them.
    const shares = latestSharesOutstanding(facts);
    const epsTtm = parsed ? trailingPerShare(parsed, "eps_diluted") : null;
    const divTtm = parsed ? trailingPerShare(parsed, "dividends_per_share") : null;
    const sector = (submissions as { sicDescription?: string } | null)?.sicDescription ?? null;
    if (epsTtm !== null || shares !== null || divTtm !== null || sector !== null) {
      const { error } = await db.from("fundamentals").upsert(
        {
          symbol,
          as_of_date: shares?.end ?? now.slice(0, 10),
          shares_outstanding: shares?.val ?? null,
          eps_ttm: epsTtm,
          dividends_ttm: divTtm,
          sector,
          sic: (submissions as { sic?: string } | null)?.sic ?? null,
          source: "sec_xbrl",
          updated_at: now,
        } as never,
        { onConflict: "symbol" },
      );
      if (error) throw new Error(`Failed to store fundamentals for ${symbol}: ${error.message}`);
    }
    sec = "fetched";
    quarters = rows.quarters.length;
    releases = parsedReleases.map((r) => ({ release_date: r.release_date, accn: r.accn, timing: r.timing }));
  }

  // Earnings-day moves from the share's own prices. A curated row already on
  // file for the same date (Nasdaq's, with the EPS surprise) is kept as is.
  const bars = await loadBars(db, symbol);
  const reactionRows = earningsReactionRows(symbol, releases, bars);
  if (reactionRows.length > 0) {
    const { error } = await db.from("historical_events").upsert(reactionRows as never, { onConflict: "symbol,event_type,event_date", ignoreDuplicates: true });
    if (error) throw new Error(`Failed to store earnings reactions for ${symbol}: ${error.message}`);
  }
  return { symbol, sec, releases: releases.length, quarters, reactions: reactionRows.length };
}
