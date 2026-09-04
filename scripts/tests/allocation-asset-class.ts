// Regression test for computeAllocation (src/lib/portfolio.ts) - the
// 2026-09-04 walkthrough's finding #2: the Portfolio page's asset-class
// allocation widget bucketed BTC under "Unclassified" even though its
// Edit-asset modal correctly stores asset_type: "crypto".
//
// Root cause: the widget groups by `asset_class`, a free-text field
// completely separate from the structured `asset_type` dropdown the modal
// actually shows as "Asset type" - most holdings never get it filled in.
// Live check against Adam's real account confirmed a SECOND silently-broken
// case beyond BTC: NVDA and AMZN have asset_class manually typed as "Equity",
// but ISRG and MSFT (also equities) don't, so before this fix ISRG/MSFT
// landed in "Unclassified" right alongside BTC.
//
// Run: npx tsx --conditions=react-server scripts/tests/allocation-asset-class.ts

import { computeAllocation, type HoldingMetrics } from "../../src/lib/portfolio";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

function metric(over: Partial<HoldingMetrics>): HoldingMetrics {
  return {
    id: "id",
    user_id: "u",
    symbol: "SYM",
    asset_type: "equity",
    quantity: 1,
    purchase_price: 100,
    purchase_date: "2026-01-01",
    sector: null,
    asset_class: null,
    geography: null,
    notes: null,
    currentPrice: 100,
    value: 100,
    gain: 0,
    gainPct: 0,
    priceStale: false,
    priceAsOf: null,
    ...over,
  } as HoldingMetrics;
}

// --- 1. Adam's real shape: reproduce the live bug exactly ---------------------
{
  const metrics = [
    metric({ symbol: "NVDA", asset_type: "equity", asset_class: "Equity", value: 100 }),
    metric({ symbol: "AMZN", asset_type: "equity", asset_class: "Equity", value: 100 }),
    metric({ symbol: "ISRG", asset_type: "equity", asset_class: null, value: 100 }),
    metric({ symbol: "MSFT", asset_type: "equity", asset_class: null, value: 100 }),
    metric({ symbol: "BTC", asset_type: "crypto", asset_class: null, value: 100 }),
  ];
  const slices = computeAllocation(metrics, "asset_class");
  const byLabel = new Map(slices.map((s) => [s.label, s.value]));

  check("no 'Unclassified' bucket at all", !byLabel.has("Unclassified"), JSON.stringify([...byLabel.keys()]));
  check("BTC backfilled to 'Crypto' (the reported bug)", byLabel.get("Crypto") === 100, String(byLabel.get("Crypto")));
  check(
    "ISRG + MSFT join NVDA + AMZN under 'Equity', not a separate bucket (the second broken case)",
    byLabel.get("Equity") === 400,
    String(byLabel.get("Equity")),
  );
}

// --- 2. A holding with genuinely no asset_type either: still "Unclassified" --
{
  const metrics = [metric({ symbol: "MYSTERY", asset_type: "" as never, asset_class: null, value: 50 })];
  const slices = computeAllocation(metrics, "asset_class");
  check("no asset_type: still falls to Unclassified", slices[0]?.label === "Unclassified", slices[0]?.label);
}

// --- 3. Every other asset_type maps to a real label, not just crypto/equity ---
{
  for (const [assetType, expected] of [
    ["etf", "ETF"],
    ["forex", "Forex"],
    ["index", "Index"],
    ["future", "Future"],
  ] as const) {
    const slices = computeAllocation([metric({ asset_type: assetType, asset_class: null, value: 10 })], "asset_class");
    check(`${assetType} backfills to '${expected}'`, slices[0]?.label === expected, slices[0]?.label);
  }
}

// --- 4. A manually-set asset_class always wins over the asset_type fallback --
{
  const slices = computeAllocation(
    [metric({ asset_type: "equity", asset_class: "Growth stock", value: 10 })],
    "asset_class",
  );
  check("explicit asset_class is never overridden", slices[0]?.label === "Growth stock", slices[0]?.label);
}

// --- 5. Sector/geography are unaffected - no asset_type fallback for those ----
{
  const slices = computeAllocation([metric({ asset_type: "crypto", sector: null, value: 10 })], "sector");
  check("sector still falls to Unclassified (no fallback map for it)", slices[0]?.label === "Unclassified", slices[0]?.label);
}

console.log(`\n${pass}/${pass + fail} allocation-asset-class cases passed`);
process.exit(fail === 0 ? 0 : 1);
