"use client";

import { useState } from "react";
import { PositionSizingCalculator } from "@/components/calculators/position-sizing-calculator";
import { ScenarioModeler } from "@/components/calculators/scenario-modeler";
import { GoalTracker } from "@/components/calculators/goal-tracker";
import type { ScenarioHolding, GoalProgress } from "@/lib/planning";

const TABS = ["Position Sizing", "Scenario Modeling", "Goal Tracking"] as const;

export function CalculatorsWorkspace({
  defaultAccountValue,
  scenarioHoldings,
  goals,
}: {
  defaultAccountValue: number;
  scenarioHoldings: ScenarioHolding[];
  goals: GoalProgress[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Position Sizing");

  return (
    <div>
      <div>
        <div>Planning · Calculators</div>
        <h1>Run the numbers</h1>
        <p>
          Sizing, what-if modeling, and target tracking. All math runs on your own inputs and current holdings —
          nothing here is a recommendation or a prediction.
        </p>
      </div>

      <div>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}

 >
            {t}
          </button>
        ))}
      </div>

      {tab === "Position Sizing" && <PositionSizingCalculator defaultAccountValue={defaultAccountValue} />}
      {tab === "Scenario Modeling" && <ScenarioModeler holdings={scenarioHoldings} />}
      {tab === "Goal Tracking" && <GoalTracker goals={goals} />}
    </div>
  );
}
