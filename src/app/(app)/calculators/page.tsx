import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPositionSizingDefaults, getScenarioHoldings, getGoalsWithProgress } from "@/lib/actions/planning";
import { CalculatorsWorkspace } from "@/components/calculators/calculators-workspace";
import { guardReads } from "@/components/data-unavailable";

export default async function CalculatorsPage() {
  return guardReads(CalculatorsBody);
}

async function CalculatorsBody() {
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
