// Tests for computeTotals (src/lib/portfolio.ts) - the Portfolio-page summary
// stats, with the focus on the "Today" change figure.
//
// Regression target (audit 2026-09-04, finding #3): a holding whose current
// price has not loaded yet was excluded from the current-value sum but still
// added (at cost basis) to the prior-value sum, so todayChange showed a
// phantom loss equal to that holding's cost basis - most easily triggered
// right after adding a new holding.
//
// Run: npx tsx --conditions=react-server scripts/tests/portfolio-totals.ts

import { computeHoldingMetrics, computeTotals, type Holding } from "../../src/lib/portfolio";

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

// --- 2. THE BUG: one holding has no current price yet --------------------
// AAPL is priced and flat on the day; MSFT was just added and has no quote.
// The day change must reflect AAPL only (0), not -cost-basis of MSFT.
{
  const closes: Closes = new Map([
    ["AAPL", { latest: 100, prev: 100 }],
    ["MSFT", { latest: null, prev: null }],
  ]);
  const t = totalsFor([holding("AAPL", 10, 80), holding("MSFT", 5, 400)], closes);
  check("unpriced holding: excluded from totalValue", near(t.totalValue, 1000), `${t.totalValue}`);
  check("unpriced holding: still counted in totalCostBasis", near(t.totalCostBasis, 800 + 2000), `${t.totalCostBasis}`);
  check(
    "unpriced holding: NOT dragging todayChangeValue negative (was -2000)",
    near(t.todayChangeValue, 0),
    `${t.todayChangeValue}`,
  );
  check("unpriced holding: todayChangePct is 0, not a phantom loss", near(t.todayChangePct, 0), `${t.todayChangePct}`);
}

// --- 3. Priced holding with NO prior close: contributes 0 to day change --
{
  const closes: Closes = new Map([["IPO", { latest: 50, prev: null }]]);
  const t = totalsFor([holding("IPO", 4, 45)], closes);
  check("no prior close: totalValue still counts it", near(t.totalValue, 200), `${t.totalValue}`);
  check("no prior close: todayChangeValue is 0 (no swing invented)", near(t.todayChangeValue, 0), `${t.todayChangeValue}`);
}

// --- 4. All holdings unpriced: everything zero, no divide-by-zero --------
{
  const closes: Closes = new Map([["X", { latest: null, prev: null }]]);
  const t = totalsFor([holding("X", 3, 10)], closes);
  check("all unpriced: totalValue 0", near(t.totalValue, 0), `${t.totalValue}`);
  check("all unpriced: todayChangeValue 0", near(t.todayChangeValue, 0), `${t.todayChangeValue}`);
  check("all unpriced: todayChangePct 0 (guarded divide)", near(t.todayChangePct, 0), `${t.todayChangePct}`);
}

console.log(`\n${pass}/${pass + fail} portfolio-totals cases passed`);
process.exit(fail === 0 ? 0 : 1);
