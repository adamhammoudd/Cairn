"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { boundedAmount, MAX_AMOUNT_INPUT } from "@/lib/input-limits";
import { computeGoalProgress, type GoalProgress, type ScenarioHolding } from "@/lib/planning";
import { latestCloseBySymbol } from "@/lib/portfolio";

// Duplicates the holdings + latest-close fetch already in the Portfolio page
// and the Comparison action - accepted small duplication, same pattern used
// there, rather than threading a shared fetcher through unrelated features.
async function getCurrentPortfolioValue(): Promise<{ value: number; holdings: ScenarioHolding[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { value: 0, holdings: [] };

  const { data: holdings } = await supabase.from("holdings").select("symbol, quantity").eq("user_id", user.id);
  const rows = holdings ?? [];
  if (rows.length === 0) return { value: 0, holdings: [] };

  const symbols = Array.from(new Set(rows.map((h) => h.symbol)));
  // Two bars per symbol is all latestCloseBySymbol() needs, and it has to be
  // the NEWEST two. Ordered ascending with no limit, this returned the oldest
  // rows under PostgREST's row cap, so the calculators valued a portfolio at
  // prices from whenever ingestion started.
  const { data: prices } = await supabase.rpc("recent_prices", { symbols, per_symbol: 2 });

  const closes = latestCloseBySymbol((prices ?? []) as Parameters<typeof latestCloseBySymbol>[0]);
  const scenarioHoldings: ScenarioHolding[] = rows.map((h) => ({
    symbol: h.symbol,
    quantity: h.quantity,
    currentPrice: closes.get(h.symbol)?.latest ?? null,
  }));
  const value = scenarioHoldings.reduce((sum, h) => sum + (h.currentPrice !== null ? h.currentPrice * h.quantity : 0), 0);

  return { value, holdings: scenarioHoldings };
}

export async function getPositionSizingDefaults(): Promise<{ accountValue: number }> {
  const { value } = await getCurrentPortfolioValue();
  return { accountValue: value };
}

export async function getScenarioHoldings(): Promise<ScenarioHolding[]> {
  const { holdings } = await getCurrentPortfolioValue();
  return holdings;
}

export async function getGoalsWithProgress(): Promise<GoalProgress[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [{ data: goals }, { value: currentValue }] = await Promise.all([
    supabase.from("goals").select("*").eq("user_id", user.id).order("target_date", { ascending: true }),
    getCurrentPortfolioValue(),
  ]);

  return (goals ?? []).map((g) => computeGoalProgress(g, currentValue));
}

export async function createGoal(_prevState: string | null, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const targetValue = boundedAmount(formData.get("target_value"));
  const targetDate = String(formData.get("target_date") ?? "");
  if (!name || !targetDate) {
    return "Name, a positive target value, and a target date are required.";
  }
  if (targetValue === null) {
    return `Target value must be a positive number no larger than ${MAX_AMOUNT_INPUT.toLocaleString("en-US")}.`;
  }

  const { error } = await supabase
    .from("goals")
    .insert({ user_id: user.id, name, target_value: targetValue, target_date: targetDate });
  if (error) return error.message;

  revalidatePath("/calculators");
  return "saved";
}

export async function deleteGoal(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("goals").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/calculators");
}
