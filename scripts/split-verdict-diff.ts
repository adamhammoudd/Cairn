// Before -> after scorecard verdicts for every company with stored quarters,
// for fix/split-adjusted-fundamentals.
//
// "Before" is the scorecard exactly as the app builds it from the database
// now (loadScorecard). "After" re-parses SEC companyfacts with the fixed
// parser and rebuilds the four company dimensions against the SAME prices, so
// the only thing that differs is the company figures. Read-only: writes
// nothing to the database.
//
//   npx tsx --conditions=react-server scripts/split-verdict-diff.ts [cacheDir]
//
// cacheDir (optional) holds <SYMBOL>.json companyfacts downloads; missing
// ones are fetched from data.sec.gov with the ingest's User-Agent.
import "./tests/env";
import fs from "node:fs";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadScorecard } from "@/lib/scorecard-data";
import { parseCompanyFacts, trailingPerShare, type CompanyFacts, type ParsedCompany } from "../supabase/functions/_shared/sec-companyfacts";
import { companyMetrics, dividendGrowthYears, peHistory, sortQuarters, ttmSnapshot, type Quarter } from "@/lib/fundamentals";
import { dividendDimension, growthDimension, healthDimension, sectorMedianPe, valuationDimension, type Dimension } from "@/lib/scorecard";
import { templateSummary } from "@/lib/ai/plain-summary";
import { SEC_USER_AGENT } from "../supabase/functions/_shared/sec-user-agent";

const cacheDir = process.argv[2];

async function companyFacts(symbol: string, cik: string): Promise<CompanyFacts> {
  const cached = cacheDir ? path.join(cacheDir, `${symbol}.json`) : null;
  if (cached && fs.existsSync(cached)) return JSON.parse(fs.readFileSync(cached, "utf8"));
  const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers: { "User-Agent": SEC_USER_AGENT } });
  if (!res.ok) throw new Error(`${symbol}: SEC ${res.status}`);
  await new Promise((r) => setTimeout(r, 300));
  return res.json();
}

const asQuarter = (r: ParsedCompany["quarters"][number]): Quarter => ({ fiscal_year: r.fiscal_year, fiscal_quarter: r.fiscal_quarter, period_end: r.period_end, ...r.values });
const line = (d: Dimension | undefined) => (d ? `${d.verdict}: ${d.sentence}` : "-");

async function main() {
  const admin = createAdminClient();
  const { data: rows, error } = await admin.from("company_financials_quarterly").select("symbol, cik").order("symbol");
  if (error) throw error;
  const ciks = new Map((rows ?? []).map((r) => [r.symbol as string, r.cik as string]));

  const parsed = new Map<string, ParsedCompany>();
  for (const [symbol, cik] of ciks) parsed.set(symbol, parseCompanyFacts(await companyFacts(symbol, cik)));

  // Peers' trailing EPS as the fixed ingest will store it.
  const { data: fund } = await admin.from("fundamentals").select("symbol, sector, eps_ttm, shares_outstanding");
  const epsAfter = new Map<string, number | null>((fund ?? []).map((f) => [f.symbol, f.eps_ttm === null ? null : Number(f.eps_ttm)]));
  for (const [s, p] of parsed) epsAfter.set(s, trailingPerShare(p, "eps_diluted"));
  const { data: bars } = await admin.rpc("recent_prices", { symbols: (fund ?? []).map((f) => f.symbol), per_symbol: 1 });
  const lastClose = new Map((bars ?? []).map((b: { symbol: string; close: number | null }) => [b.symbol, b.close === null ? null : Number(b.close)]));

  const changes: string[] = [];
  const report: string[] = [];
  for (const [symbol, p] of parsed) {
    const before = await loadScorecard(symbol, { supabase: admin });
    const quarters = sortQuarters(p.quarters.map(asQuarter)).slice(0, 28);
    const annualEps = new Map<number, number>();
    for (const a of p.annual) if (typeof a.values.eps_diluted === "number") annualEps.set(a.fiscal_year, a.values.eps_diluted);
    const price = before.price.value;
    const metrics = companyMetrics(quarters, annualEps);
    const pe = peHistory(quarters, before.pricesAsc, price, annualEps);
    const sectorName = (fund ?? []).find((f) => f.symbol === symbol)?.sector ?? null;
    let sector: { median: number; peers: number; name: string } | null = null;
    if (sectorName) {
      const peers = (fund ?? []).filter((f) => f.sector === sectorName && f.symbol !== symbol);
      const med = sectorMedianPe(peers.map((f) => {
        const c = lastClose.get(f.symbol);
        const e = epsAfter.get(f.symbol);
        return c && e && e > 0 ? c / e : null;
      }));
      if (med) sector = { ...med, name: sectorName };
    }
    const shares = Number((fund ?? []).find((f) => f.symbol === symbol)?.shares_outstanding ?? NaN);
    const fcf = metrics?.ttm.free_cash_flow ?? null;
    const fcfYield = fcf !== null && shares > 0 && price ? fcf / (shares * price) : null;
    const snap = ttmSnapshot(quarters, 0, annualEps);
    const after: Dimension[] = [
      valuationDimension({ pe, sector, fcfYield: pe.current ? null : fcfYield, priceDate: before.price.asOf, filing: null }),
      growthDimension(metrics, null),
      healthDimension(metrics, null),
      dividendDimension({
        perShareTtm: snap?.dividends_per_share ?? null,
        price,
        payoutOfFcf: metrics?.payoutOfFcf ?? null,
        freeCashFlow: metrics?.ttm.free_cash_flow ?? null,
        growthYears: dividendGrowthYears(quarters),
        filing: null,
      }),
    ];
    const splits = p.splits.map((s) => `${s.ratio}:1 (${s.lastOldBasis}..${s.firstNewBasis})`).join(", ") || "none";
    report.push(`\n## ${symbol}  splits: ${splits}`);
    for (const a of after) {
      const b = before.scorecard.dimensions.find((d) => d.key === a.key);
      const changed = b?.verdict !== a.verdict;
      report.push(`${changed ? "CHANGED" : "same   "} ${a.label}\n   before  ${line(b)}\n   after   ${line(a)}`);
      if (changed) changes.push(`${symbol} | ${a.label} | ${b?.verdict} -> ${a.verdict}`);
    }
    if (symbol === "NVDA") {
      const card = { ...before.scorecard, dimensions: [...after, ...before.scorecard.dimensions.slice(4)] };
      const s0 = templateSummary({ name: "NVIDIA", symbol, assetType: before.assetType, scorecard: before.scorecard, history: null });
      const s1 = templateSummary({ name: "NVIDIA", symbol, assetType: before.assetType, scorecard: card, history: null });
      report.push(`\nNVDA template summary before:\n  ${s0.headline}\n  - ${s0.bullets.join("\n  - ")}`);
      report.push(`NVDA template summary after:\n  ${s1.headline}\n  - ${s1.bullets.join("\n  - ")}`);
    }
  }
  console.log(report.join("\n"));
  console.log(`\n# Verdict changes (${changes.length})\n${changes.join("\n") || "none"}`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
