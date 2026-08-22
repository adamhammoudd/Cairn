// Long-horizon growth projection maths for the retirement/growth calculator
// (roadmap Phase 11, "Retirement/Growth Calculators: Standalone, no
// persistence unless saved").
//
// Pure arithmetic on figures the user types. It projects a balance forward at
// an assumed rate - it does not forecast a market, and nothing in this file
// reads a price, a holding, or an analysis. That separation is the point: a
// projection that quietly mixed in the user's real portfolio would be a
// statement about their personal position, which this product never makes.

export interface ProjectionInput {
  /** Balance today. */
  startingBalance: number;
  /** Added every month, before growth is applied for that month. */
  monthlyContribution: number;
  /** Nominal annual return, in percent. */
  annualReturnPct: number;
  /** Annual inflation, in percent - used only to restate the result in today's money. */
  inflationPct: number;
  years: number;
  /** Annual fee drag (expense ratios, platform fees), in percent. */
  annualFeePct: number;
}

export interface ProjectionYear {
  year: number;
  /** Age of the projection in years, 0 = today. */
  contributed: number;
  balance: number;
  /** The same balance restated in today's purchasing power. */
  realBalance: number;
  growth: number;
}

export interface ProjectionResult {
  rows: ProjectionYear[];
  finalBalance: number;
  finalRealBalance: number;
  totalContributed: number;
  totalGrowth: number;
  /**
   * Annual withdrawal at the given rate, on the final balance. Presented as
   * arithmetic on the projection, not as an income the user can count on.
   */
  withdrawalAtRate: (ratePct: number) => number;
}

/**
 * Month-by-month compounding, contributions applied at the start of each month.
 *
 * The fee is subtracted from the nominal return before compounding rather than
 * charged against the balance at year end: a percentage fee on assets is a drag
 * on the growth rate, and charging it annually understates its effect over a
 * long horizon by a compounding period.
 */
export function project(input: ProjectionInput): ProjectionResult {
  const years = Math.max(0, Math.min(80, Math.floor(input.years)));
  const netAnnual = (input.annualReturnPct - input.annualFeePct) / 100;
  // Geometric monthly rate, so twelve months compound to exactly the annual
  // figure. Dividing by 12 would overstate the result by the compounding.
  const monthly = netAnnual <= -1 ? -1 : Math.pow(1 + netAnnual, 1 / 12) - 1;
  const inflationMonthly = Math.pow(1 + input.inflationPct / 100, 1 / 12) - 1;

  let balance = input.startingBalance;
  let contributed = input.startingBalance;
  let deflator = 1;

  const rows: ProjectionYear[] = [
    {
      year: 0,
      contributed,
      balance,
      realBalance: balance,
      growth: 0,
    },
  ];

  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      balance += input.monthlyContribution;
      contributed += input.monthlyContribution;
      balance *= 1 + monthly;
      deflator *= 1 + inflationMonthly;
    }
    rows.push({
      year: y,
      contributed,
      balance,
      realBalance: deflator === 0 ? balance : balance / deflator,
      growth: balance - contributed,
    });
  }

  const last = rows[rows.length - 1];
  return {
    rows,
    finalBalance: last.balance,
    finalRealBalance: last.realBalance,
    totalContributed: last.contributed,
    totalGrowth: last.growth,
    withdrawalAtRate: (ratePct: number) => (last.balance * ratePct) / 100,
  };
}

/**
 * The monthly contribution needed to reach `target` in nominal terms, found by
 * bisection because there is no closed form once a fee drag and a starting
 * balance are both in play. Returns null when the target is already met with no
 * contributions, or when it is unreachable at this rate within the horizon.
 */
export function requiredMonthlyContribution(
  input: Omit<ProjectionInput, "monthlyContribution">,
  target: number,
): number | null {
  const at = (contribution: number) => project({ ...input, monthlyContribution: contribution }).finalBalance;
  if (at(0) >= target) return 0;

  let lo = 0;
  let hi = 1000;
  // Grow the bracket rather than assuming one: a large target over a short
  // horizon needs a contribution far above any fixed ceiling.
  for (let i = 0; i < 40 && at(hi) < target; i++) hi *= 2;
  if (at(hi) < target) return null;

  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < target) lo = mid;
    else hi = mid;
  }
  return hi;
}
