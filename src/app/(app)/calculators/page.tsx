import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPositionSizingDefaults, getScenarioHoldings, getGoalsWithProgress } from "@/lib/actions/planning";
import { CalculatorsWorkspace } from "@/components/calculators/calculators-workspace";

export default async function CalculatorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ accountValue }, scenarioHoldings, goals] = await Promise.all([
    getPositionSizingDefaults(),
    getScenarioHoldings(),
    getGoalsWithProgress(),
  ]);

  return <CalculatorsWorkspace defaultAccountValue={accountValue} scenarioHoldings={scenarioHoldings} goals={goals} />;
}
