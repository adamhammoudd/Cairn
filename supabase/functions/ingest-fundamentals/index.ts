// Scheduled Edge Function: pulls per-share and share-count fundamentals from
// SEC EDGAR's XBRL API for every symbol tracked by an enabled market_data
// provider, so the screener can filter on market cap / P/E / dividend yield.
//
// Keyless - SEC requires only a declared User-Agent. Stores raw reported
// figures; market cap, P/E, and yield are derived at query time against
// historical_prices so they don't go stale as prices move.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/auth.ts";
import {
  parseCompanyFacts,
  secHistoryRows,
  parseEarningsReleases,
  trailingPerShare,
  type CompanyFacts,
  type ParsedCompany,
  type Submissions,
} from "../_shared/sec-companyfacts.ts";
import { SEC_USER_AGENT } from "../_shared/sec-user-agent.ts";

// SEC's fair-access limit is 10 requests/second. Each symbol makes three
// (share count, submissions, companyfacts), so pace between symbols.
const SYMBOL_DELAY_MS = 600;
/** Symbols per run: ~3 SEC requests each plus the delay keeps a run well inside the Edge wall clock. */
const MAX_SYMBOLS_PER_RUN = 40;
/** A symbol refreshed this recently is not fetched again this run. */
const FRESH_DAYS = 6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function secJson(url: string): Promise<unknown | null> {
  const res = await fetch(url, { headers: { "User-Agent": SEC_USER_AGENT } });
  if (!res.ok) return null;
  return await res.json();
}

interface ConceptFact {
  end: string;
  val: number;
  form: string;
  start?: string;
}

function factsFor(doc: unknown, unit: string): ConceptFact[] {
  const units = (doc as { units?: Record<string, ConceptFact[]> } | null)?.units;
  return units?.[unit] ?? [];
}

function latestInstant(facts: ConceptFact[]): ConceptFact | null {
  const sorted = [...facts].sort((a, b) => (a.end < b.end ? 1 : -1));
  return sorted[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Scheduled callers must present the shared secret; see _shared/auth.ts.
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: providers } = await supabase
    .from("data_providers")
    .select("config")
    .eq("provider_type", "market_data")
    .eq("enabled", true);

  const symbols = Array.from(
    new Set(
      (providers ?? []).flatMap((p: { config: Record<string, unknown> }) => {
        // config.symbols accepts plain strings and { symbol, asset_type }
        // objects (see ingest-market-data). Only the ticker matters here.
        const syms = Array.isArray(p.config?.symbols) ? (p.config.symbols as unknown[]) : [];
        return syms
          .map((s) => (typeof s === "string" ? s : (s as { symbol?: string })?.symbol))
          .filter((s): s is string => typeof s === "string");
      }),
    ),
  ).map((s) => s.toUpperCase());

  // Held and watched equities too: the scorecard and briefing are about what
  // people own, and a held stock (ISRG) was not on the provider list, so it
  // had no company data at all.
  const [{ data: held }, { data: watched }] = await Promise.all([
    supabase.from("holdings").select("symbol"),
    supabase.from("watchlist_items").select("symbol"),
  ]);
  for (const r of [...(held ?? []), ...(watched ?? [])] as { symbol: string }[]) {
    const s = r.symbol.toUpperCase();
    if (!symbols.includes(s)) symbols.push(s);
  }

  // Every available US share in the symbol directory (fix/analysis-coverage):
  // a share someone analysed, searched or opened is covered from then on,
  // not just the provider list. Paged - the directory is far over the API's
  // 1000-row response cap.
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await supabase
      .from("symbol_directory")
      .select("symbol")
      .eq("status", "available")
      .eq("asset_type", "equity")
      .order("symbol")
      .range(from, from + 999);
    if (error) return Response.json({ error: `symbol_directory read failed: ${error.message}` }, { status: 500, headers: corsHeaders });
    for (const r of (page ?? []) as { symbol: string }[]) {
      const s = r.symbol.toUpperCase();
      if (!symbols.includes(s)) symbols.push(s);
    }
    if (!page || page.length < 1000) break;
  }

  if (symbols.length === 0) {
    return Response.json({ error: "no market_data provider symbols configured" }, { status: 400, headers: corsHeaders });
  }

  // Bounded per run so the function stays inside its wall clock as the
  // directory grows: stalest first (never fetched, then oldest refresh), and
  // anything refreshed within FRESH_DAYS is skipped. ?limit= overrides.
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? MAX_SYMBOLS_PER_RUN);
  const { data: freshRows } = await supabase.from("fundamentals").select("symbol, updated_at").in("symbol", symbols);
  const lastRefresh = new Map<string, string>((freshRows ?? []).map((r: { symbol: string; updated_at: string }) => [r.symbol, r.updated_at]));
  const cutoff = new Date(Date.now() - FRESH_DAYS * 86_400_000).toISOString();
  const due = symbols
    .filter((s) => (lastRefresh.get(s) ?? "") < cutoff)
    .sort((a, b) => (lastRefresh.get(a) ?? "").localeCompare(lastRefresh.get(b) ?? ""))
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : MAX_SYMBOLS_PER_RUN);

  // Only equities file company accounts. ETFs, funds and coins are skipped
  // here and shown as "not applicable" in the app, never as zero.
  const { data: dirRows } = await supabase.from("symbol_directory").select("symbol, asset_type").in("symbol", due);
  const assetType = new Map<string, string>((dirRows ?? []).map((r: { symbol: string; asset_type: string }) => [r.symbol, r.asset_type]));

  const tickerMap = (await secJson("https://www.sec.gov/files/company_tickers.json")) as
    | Record<string, { cik_str: number; ticker: string }>
    | null;
  if (!tickerMap) {
    return Response.json({ error: "failed to fetch SEC ticker map" }, { status: 502, headers: corsHeaders });
  }

  const cikByTicker = new Map<string, string>();
  for (const entry of Object.values(tickerMap)) {
    cikByTicker.set(entry.ticker.toUpperCase(), String(entry.cik_str).padStart(10, "0"));
  }

  const results = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const symbol of due) {
    const type = assetType.get(symbol);
    if (type && type !== "equity") {
      results.push({ symbol, skipped: `not applicable (${type})` });
      continue;
    }
    await sleep(SYMBOL_DELAY_MS);
    const cik = cikByTicker.get(symbol);
    if (!cik) {
      results.push({ symbol, error: "no CIK match (non-US listing or ETF)" });
      continue;
    }

    try {
      const base = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap`;
      const [sharesDoc, submissionsDoc, factsDoc] = await Promise.all([
        secJson(`${base}/CommonStockSharesOutstanding.json`),
        secJson(`https://data.sec.gov/submissions/CIK${cik}.json`),
        // One call per company for the quarterly history (feat/fundamentals-expansion).
        secJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`),
      ]);

      const { out: history, parsed } = await storeHistory(supabase, symbol, cik, factsDoc as CompanyFacts | null, submissionsDoc as Submissions | null);

      // From the parsed, split-adjusted quarters: the concept endpoints mix
      // share bases across a split, and summing their 3-month rows skipped Q4.
      const epsTtm = parsed ? trailingPerShare(parsed, "eps_diluted") : null;
      const sharesFact = latestInstant(factsFor(sharesDoc, "shares"));
      const divTtm = parsed ? trailingPerShare(parsed, "dividends_per_share") : null;
      const sector = (submissionsDoc as { sicDescription?: string } | null)?.sicDescription ?? null;
      const sic = (submissionsDoc as { sic?: string } | null)?.sic ?? null;

      if (epsTtm === null && sharesFact === null && divTtm === null && sector === null) {
        results.push({ symbol, error: "no usable XBRL facts" });
        continue;
      }

      const { error } = await supabase.from("fundamentals").upsert(
        {
          symbol,
          as_of_date: sharesFact?.end ?? today,
          shares_outstanding: sharesFact?.val ?? null,
          eps_ttm: epsTtm,
          dividends_ttm: divTtm,
          sector,
          sic,
          source: "sec_xbrl",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "symbol" },
      );

      results.push({ symbol, eps_ttm: epsTtm, shares: sharesFact?.val ?? null, dividends_ttm: divTtm, sector, splits: parsed?.splits ?? [], history, error: error?.message });
    } catch (err) {
      results.push({ symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return Response.json({ covered: symbols.length, due: due.length, results }, { headers: corsHeaders });
});

// ------------------------------------------------------------ quarterly history

// deno-lint-ignore no-explicit-any
type Supa = SupabaseClient<any, "public", any>;

/**
 * Parse and upsert one company's quarterly and annual figures and its
 * earnings releases. Returns counts, or the reason nothing was stored. A
 * company without us-gaap facts (a foreign filer reporting under IFRS) stores
 * nothing and says so; nothing is filled in.
 */
async function storeHistory(
  supabase: Supa,
  symbol: string,
  cik: string,
  facts: CompanyFacts | null,
  submissions: Submissions | null,
): Promise<{ out: Record<string, unknown>; parsed: ParsedCompany | null }> {
  const out: Record<string, unknown> = {};
  let parsed: ParsedCompany | null = null;
  if (!facts?.facts?.["us-gaap"]) {
    out.quarters = 0;
    out.quarters_note = "no us-gaap facts (not filed under US GAAP)";
  } else {
    parsed = parseCompanyFacts(facts);
    // Same row builder as the on-demand path (src/lib/market-data/company-data.ts).
    const { quarters: quarterRows, annual: annualRows } = secHistoryRows(symbol, cik, parsed, [], new Date().toISOString());
    const [qRes, aRes] = await Promise.all([
      quarterRows.length
        ? supabase.from("company_financials_quarterly").upsert(quarterRows, { onConflict: "symbol,fiscal_year,fiscal_quarter" })
        : Promise.resolve({ error: null }),
      annualRows.length
        ? supabase.from("company_financials_annual").upsert(annualRows, { onConflict: "symbol,fiscal_year" })
        : Promise.resolve({ error: null }),
    ]);
    out.quarters = qRes.error ? 0 : quarterRows.length;
    out.years = aRes.error ? 0 : annualRows.length;
    if (qRes.error) out.quarters_error = qRes.error.message;
    if (aRes.error) out.years_error = aRes.error.message;
  }

  const releases = submissions ? parseEarningsReleases(submissions) : [];
  if (releases.length) {
    const { error } = await supabase.from("earnings_releases").upsert(
      secHistoryRows(symbol, cik, null, releases, new Date().toISOString()).releases,
      { onConflict: "symbol,release_date" },
    );
    out.earnings_releases = error ? 0 : releases.length;
    if (error) out.earnings_releases_error = error.message;
  } else {
    out.earnings_releases = 0;
  }
  return { out, parsed };
}
