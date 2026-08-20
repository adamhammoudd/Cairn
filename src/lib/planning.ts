// Types and pure math for the Calculators page. Kept out of
// lib/actions/planning.ts because a "use server" module may only export
// async functions.

import type { Database } from "@/lib/supabase/types";

export type Goal = Database["public"]["Tables"]["goals"]["Row"];

export interface PositionSizeInput {
  accountValue: number;
  riskPct: number;
  entryPrice: number;
  stopPrice: number;
}

export interface PositionSizeResult {
  riskAmount: number;
  riskPerShare: number;
  shareQty: number;
  positionValue: number;
  positionPctOfAccount: number;
}

// Classic fixed-fractional position sizing: risk a set % of the account on
// the distance between entry and stop, not on the position's full value.
export function computePositionSize(input: PositionSizeInput): PositionSizeResult {
  const { accountValue, riskPct, entryPrice, stopPrice } = input;
  const riskAmount = accountValue * (riskPct / 100);
  const riskPerShare = Math.abs(entryPrice - stopPrice);
  const shareQty = riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 0;
  const positionValue = shareQty * entryPrice;
  const positionPctOfAccount = accountValue > 0 ? (positionValue / accountValue) * 100 : 0;

  return { riskAmount, riskPerShare, shareQty, positionValue, positionPctOfAccount };
}

export interface ScenarioHolding {
  symbol: string;
  quantity: number;
  currentPrice: number | null;
}

export interface ScenarioRow extends ScenarioHolding {
  shockPct: number;
  hypotheticalPrice: number | null;
  currentValue: number | null;
  hypotheticalValue: number | null;
  valueDelta: number | null;
}

// Applies a per-symbol (or global-default) hypothetical price move to each
// holding's *current* price - this is a what-if on top of today's value, not
// a re-derivation of cost basis or gain/loss.
export function computeScenario(
  holdings: ScenarioHolding[],
  globalShockPct: number,
  overrides: Record<string, number | null>,
): ScenarioRow[] {
  return holdings.map((h) => {
    const shockPct = overrides[h.symbol] ?? globalShockPct;
    const currentValue = h.currentPrice !== null ? h.currentPrice * h.quantity : null;
    const hypotheticalPrice = h.currentPrice !== null ? h.currentPrice * (1 + shockPct / 100) : null;
    const hypotheticalValue = hypotheticalPrice !== null ? hypotheticalPrice * h.quantity : null;
    const valueDelta = hypotheticalValue !== null && currentValue !== null ? hypotheticalValue - currentValue : null;
    return { ...h, shockPct, hypotheticalPrice, currentValue, hypotheticalValue, valueDelta };
  });
}

export interface GoalProgress extends Goal {
  currentValue: number;
  progressPct: number;
  yearsRemaining: number | null;
  requiredAnnualReturnPct: number | null;
}

// Required annual return is solved from compound growth: current*(1+r)^years
// = target. Not a prediction of what will happen - just the growth rate
// needed to hit the target on time, given today's value as principal.
export function computeGoalProgress(goal: Goal, currentValue: number): GoalProgress {
  const progressPct = goal.target_value > 0 ? (currentValue / goal.target_value) * 100 : 0;

  const msRemaining = new Date(goal.target_date).getTime() - Date.now();
  const yearsRemaining = msRemaining > 0 ? msRemaining / (365.25 * 24 * 60 * 60 * 1000) : null;

  let requiredAnnualReturnPct: number | null = null;
  if (yearsRemaining !== null && currentValue > 0) {
    requiredAnnualReturnPct = (Math.pow(goal.target_value / currentValue, 1 / yearsRemaining) - 1) * 100;
  }

  return { ...goal, currentValue, progressPct, yearsRemaining, requiredAnnualReturnPct };
}
