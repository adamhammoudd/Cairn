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
import { FIELDS, parseCompanyFacts, parseEarningsReleases, type CompanyFacts, type Submissions } from "../_shared/sec-companyfacts.ts";

const UA = "cairn-ingest contact@example.com";
// SEC's fair-access limit is 10 requests/second. Each symbol makes five
// (four concept/submission calls plus one companyfacts), so pace between symbols.
const SYMBOL_DELAY_MS = 600;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function secJson(url: string): Promise<unknown | null> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
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

// Sum the four most recent non-overlapping quarterly periods to get a TTM
// figure. SEC reports both quarterly and cumulative year-to-date rows for the
// same concept, so filter to ~quarter-length windows before summing - adding
// a YTD row to quarterly rows would double-count.
function trailingTwelveMonths(facts: ConceptFact[]): number | null {
  const quarterly = facts
    .filter((f) => f.start && f.end && (f.form === "10-Q" || f.form === "10-K"))
    .filter((f) => {
      const days = (new Date(f.end).getTime() - new Date(f.start!).getTime()) / 86_400_000;
      return days >= 60 && days <= 120;
    })
    .sort((a, b) => (a.end < b.end ? 1 : -1));

  const seen = new Set<string>();
  const distinct: ConceptFact[] = [];
  for (const f of quarterly) {
    if (seen.has(f.end)) continue;
    seen.add(f.end);
    distinct.push(f);
    if (distinct.length === 4) break;
  }

  if (distinct.length === 0) return null;
  return distinct.reduce((sum, f) => sum + f.val, 0);
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

  if (symbols.length === 0) {
    return Response.json({ error: "no market_data provider symbols configured" }, { status: 400, headers: corsHeaders });
  }

  // Only equities file company accounts. ETFs, funds and coins are skipped
  // here and shown as "not applicable" in the app, never as zero.
  const { data: dirRows } = await supabase.from("symbol_directory").select("symbol, asset_type").in("symbol", symbols);
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

  for (const symbol of symbols) {
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
      const [epsDoc, sharesDoc, divDoc, submissionsDoc, factsDoc] = await Promise.all([
        secJson(`${base}/EarningsPerShareDiluted.json`),
        secJson(`${base}/CommonStockSharesOutstanding.json`),
        secJson(`${base}/CommonStockDividendsPerShareDeclared.json`),
        secJson(`https://data.sec.gov/submissions/CIK${cik}.json`),
        // One call per company for the quarterly history (feat/fundamentals-expansion).
        secJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`),
      ]);

      const history = await storeHistory(supabase, symbol, cik, factsDoc as CompanyFacts | null, submissionsDoc as Submissions | null);

      const epsTtm = trailingTwelveMonths(factsFor(epsDoc, "USD/shares"));
      const sharesFact = latestInstant(factsFor(sharesDoc, "shares"));
      const divTtm = trailingTwelveMonths(factsFor(divDoc, "USD/shares"));
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

      results.push({ symbol, eps_ttm: epsTtm, shares: sharesFact?.val ?? null, dividends_ttm: divTtm, sector, history, error: error?.message });
    } catch (err) {
      results.push({ symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return Response.json({ results }, { headers: corsHeaders });
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
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  if (!facts?.facts?.["us-gaap"]) {
    out.quarters = 0;
    out.quarters_note = "no us-gaap facts (not filed under US GAAP)";
  } else {
    const parsed = parseCompanyFacts(facts);
    const now = new Date().toISOString();
    const quarterRows = parsed.quarters.map((q) => ({
      symbol,
      cik,
      fiscal_year: q.fiscal_year,
      fiscal_quarter: q.fiscal_quarter,
      period_start: q.period_start,
      period_end: q.period_end,
      ...q.values,
      provenance: q.provenance,
      updated_at: now,
    }));
    const annualRows = parsed.annual.map((a) => ({
      symbol,
      cik,
      fiscal_year: a.fiscal_year,
      period_start: a.period_start,
      period_end: a.period_end,
      ...Object.fromEntries(FIELDS.filter((f) => f in a.values).map((f) => [f, a.values[f] ?? null])),
      updated_at: now,
    }));
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
      releases.map((r) => ({ symbol, cik, ...r, updated_at: new Date().toISOString() })),
      { onConflict: "symbol,release_date" },
    );
    out.earnings_releases = error ? 0 : releases.length;
    if (error) out.earnings_releases_error = error.message;
  } else {
    out.earnings_releases = 0;
  }
  return out;
}
