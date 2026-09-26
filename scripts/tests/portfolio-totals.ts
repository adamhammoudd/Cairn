// Tests for computeTotals (src/lib/portfolio.ts) - the Portfolio-page summary
// stats, with the focus on the "Today" change figure.
//
// Regression target (audit 2026-09-04, finding #3): a holding whose current
// price has not loaded yet was excluded from the current-value sum but still
// added (at cost basis) to the prior-value sum, so todayChange showed a
// phantom loss equal to that holding's cost basis - most easily triggered
// right after adding a new holding.
//
// Convention since QA pass 2026-09-26: an unpriced holding counts at its COST
// BASIS in both totalValue and the prior-value sum - the same fallback
// computeAllocation() and computeConcentration() use. Dropping it from
// totalValue (the PR #60 fix) made the Total Value card disagree with the
// Concentration/Allocation panels on the same page, and put a phantom loss of
// the holding's whole cost basis into totalGain. Counting it in both sums
// keeps PR #60's point: it adds nothing to the day change.
//
// Run: npx tsx --conditions=react-server scripts/tests/portfolio-totals.ts

import {
  computeAllocation,
  computeConcentration,
  computeHoldingMetrics,
  computeTotals,
  type Holding,
} from "../../src/lib/portfolio";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}
function near(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}

function holding(symbol: string, quantity: number, purchase_price: number): Holding {
  return { symbol, quantity, purchase_price, purchase_date: "2026-01-01" } as Holding;
}

type Closes = Map<string, { latest: number | null; prev: number | null }>;

function totalsFor(holdings: Holding[], closes: Closes) {
  return computeTotals(computeHoldingMetrics(holdings, closes), closes);
}

// --- 1. Priced holding with a prior close: day change is real -------------
{
  const closes: Closes = new Map([["AAPL", { latest: 110, prev: 100 }]]);
  const t = totalsFor([holding("AAPL", 10, 90)], closes);
  check("priced holding: totalValue = latest * qty", near(t.totalValue, 1100), `${t.totalValue}`);
  check("priced holding: todayChangeValue = (latest - prev) * qty", near(t.todayChangeValue, 100), `${t.todayChangeValue}`);
  check("priced holding: todayChangePct off prior value", near(t.todayChangePct, 10), `${t.todayChangePct}`);
}

// --- 2. One holding has no current price yet ------------------------------
// AAPL is priced and flat on the day; MSFT was just added and has no quote.
// MSFT counts at cost basis (5 x 400); the day change must reflect AAPL only
// (0), not -cost-basis of MSFT (PR #60) nor +cost-basis (a phantom gain).
{
  const closes: Closes = new Map([
    ["AAPL", { latest: 100, prev: 100 }],
    ["MSFT", { latest: null, prev: null }],
  ]);
  const t = totalsFor([holding("AAPL", 10, 80), holding("MSFT", 5, 400)], closes);
  check("unpriced holding: counted at cost basis in totalValue", near(t.totalValue, 1000 + 2000), `${t.totalValue}`);
  check("unpriced holding: still counted in totalCostBasis", near(t.totalCostBasis, 800 + 2000), `${t.totalCostBasis}`);
  check(
    "unpriced holding: NOT dragging todayChangeValue negative (was -2000)",
    near(t.todayChangeValue, 0),
    `${t.todayChangeValue}`,
  );
  check("unpriced holding: todayChangePct is 0, not a phantom loss", near(t.todayChangePct, 0), `${t.todayChangePct}`);
  // Gain is AAPL's alone (1000 - 800); MSFT at cost contributes 0, where
  // excluding it from totalValue booked its whole 2000 as a loss.
  check("unpriced holding: totalGain is AAPL's only, not -2000 lower", near(t.totalGain, 200), `${t.totalGain}`);
}

// --- 2b. Total Value agrees with Allocation and Concentration --------------
// The QA bug itself: on one /portfolio load the Total Value card excluded an
// unpriced holding while the panels below counted it at cost basis.
{
  const closes: Closes = new Map([
    ["NVDA", { latest: 180, prev: 178 }],
    ["AMZN", { latest: null, prev: null }],
    ["ISRG", { latest: 500, prev: 505 }],
  ]);
  const metrics = computeHoldingMetrics(
    [holding("NVDA", 0.1, 150), holding("AMZN", 0.1, 200), holding("ISRG", 0.1, 450)],
    closes,
  );
  const t = computeTotals(metrics, closes);
  const allocationTotal = computeAllocation(metrics, "asset_type").reduce((s, a) => s + a.value, 0);
  check("totalValue equals computeAllocation's total", near(t.totalValue, allocationTotal), `${t.totalValue} vs ${allocationTotal}`);
  const conc = computeConcentration(metrics)!;
  const top = metrics.find((m) => m.symbol === conc.topSymbol)!;
  const implied = ((top.value ?? top.purchase_price * top.quantity) / conc.topSharePct) * 100;
  check("totalValue equals Concentration's implied total", near(t.totalValue, implied), `${t.totalValue} vs ${implied}`);
  check("day change is the priced holdings' only", near(t.todayChangeValue, 0.2 - 0.5), `${t.todayChangeValue}`);
}

// --- 2c. Unpriced but a prior close exists: still no day change -------------
// A latest-price miss with a stranded prior close must not be read as a move
// from that close to the cost basis.
{
  const closes: Closes = new Map([["AMZN", { latest: null, prev: 230 }]]);
  const t = totalsFor([holding("AMZN", 2, 200)], closes);
  check("unpriced with prior close: totalValue is cost basis", near(t.totalValue, 400), `${t.totalValue}`);
  check("unpriced with prior close: todayChangeValue 0", near(t.todayChangeValue, 0), `${t.todayChangeValue}`);
}

// --- 3. Priced holding with NO prior close: contributes 0 to day change --
{
  const closes: Closes = new Map([["IPO", { latest: 50, prev: null }]]);
  const t = totalsFor([holding("IPO", 4, 45)], closes);
  check("no prior close: totalValue still counts it", near(t.totalValue, 200), `${t.totalValue}`);
  check("no prior close: todayChangeValue is 0 (no swing invented)", near(t.todayChangeValue, 0), `${t.todayChangeValue}`);
}

// --- 4. All holdings unpriced: valued at cost, no change, no divide-by-zero
{
  const closes: Closes = new Map([["X", { latest: null, prev: null }]]);
  const t = totalsFor([holding("X", 3, 10)], closes);
  check("all unpriced: totalValue is cost basis", near(t.totalValue, 30), `${t.totalValue}`);
  check("all unpriced: totalGain 0", near(t.totalGain, 0), `${t.totalGain}`);
  check("all unpriced: todayChangeValue 0", near(t.todayChangeValue, 0), `${t.todayChangeValue}`);
  check("all unpriced: todayChangePct 0", near(t.todayChangePct, 0), `${t.todayChangePct}`);
}

console.log(`\n${pass}/${pass + fail} portfolio-totals cases passed`);
process.exit(fail === 0 ? 0 : 1);
