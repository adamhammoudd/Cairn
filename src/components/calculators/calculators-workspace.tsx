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
    <div className="flex max-w-[900px] flex-col gap-6">
      <div>
        <h2 className="font-serif text-2xl text-primary">Calculators</h2>
        <p className="mt-1 text-[13px] text-muted">
          Planning tools for sizing, what-if modeling, and target tracking. All math runs on your own inputs
          and current holdings — nothing here is a recommendation or a prediction.
        </p>
      </div>

      <div className="flex gap-1.5 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3.5 py-2.5 text-[13.5px] ${tab === t ? "border-b-2 border-accent text-primary" : "text-muted"}`}
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
