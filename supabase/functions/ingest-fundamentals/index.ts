// Scheduled Edge Function: pulls per-share and share-count fundamentals from
// SEC EDGAR's XBRL API for every symbol tracked by an enabled market_data
// provider, so the screener can filter on market cap / P/E / dividend yield.
//
// Keyless - SEC requires only a declared User-Agent. Stores raw reported
// figures; market cap, P/E, and yield are derived at query time against
// historical_prices so they don't go stale as prices move.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/auth.ts";

const UA = "cairn-ingest contact@example.com";

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
      (providers ?? []).flatMap((p: { config: Record<string, unknown> }) =>
        Array.isArray(p.config?.symbols) ? (p.config.symbols as string[]) : [],
      ),
    ),
  ).map((s) => s.toUpperCase());

  if (symbols.length === 0) {
    return Response.json({ error: "no market_data provider symbols configured" }, { status: 400, headers: corsHeaders });
  }

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
    const cik = cikByTicker.get(symbol);
    if (!cik) {
      results.push({ symbol, error: "no CIK match (non-US listing or ETF)" });
      continue;
    }

    try {
      const base = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap`;
      const [epsDoc, sharesDoc, divDoc, submissionsDoc] = await Promise.all([
        secJson(`${base}/EarningsPerShareDiluted.json`),
        secJson(`${base}/CommonStockSharesOutstanding.json`),
        secJson(`${base}/CommonStockDividendsPerShareDeclared.json`),
        secJson(`https://data.sec.gov/submissions/CIK${cik}.json`),
      ]);

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

      results.push({ symbol, eps_ttm: epsTtm, shares: sharesFact?.val ?? null, dividends_ttm: divTtm, sector, error: error?.message });
    } catch (err) {
      results.push({ symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return Response.json({ results }, { headers: corsHeaders });
});
