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
    <div className="animate-page-in flex flex-col gap-4">
      <div>
        <div className="mb-2 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">Planning · Calculators</div>
        <h1 className="font-serif text-[32px] leading-tight font-normal text-primary">Run the numbers</h1>
        <p className="mt-1.5 max-w-[580px] text-[13.5px] text-muted text-pretty">
          Sizing, what-if modeling, and target tracking. All math runs on your own inputs and current holdings —
          nothing here is a recommendation or a prediction.
        </p>
      </div>

      <div className="flex w-fit flex-wrap gap-1.5 rounded-xl border border-line bg-panel p-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3.25 py-1.75 text-[12.5px] transition-colors duration-base ease-standard ${
              tab === t ? "bg-active text-primary" : "text-muted hover:text-primary"
            }`}
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
