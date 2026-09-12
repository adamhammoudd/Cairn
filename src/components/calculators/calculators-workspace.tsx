"use client";

import { PositionSizingCalculator } from "@/components/calculators/position-sizing-calculator";
import { ScenarioModeler } from "@/components/calculators/scenario-modeler";
import { GoalTracker } from "@/components/calculators/goal-tracker";
import { GrowthProjector } from "@/components/calculators/growth-projector";
import type { ScenarioHolding, GoalProgress } from "@/lib/planning";

export function CalculatorsWorkspace({
  defaultAccountValue,
  scenarioHoldings,
  goals,
}: {
  defaultAccountValue: number;
  scenarioHoldings: ScenarioHolding[];
  goals: GoalProgress[];
}) {
  return (
    <div className="animate-page-in flex flex-col gap-4">
      <div>
        <div className="mb-2 font-mono text-eyebrow-page text-muted uppercase">Planning · Calculators</div>
        <h1 className="font-serif text-h1 leading-[1.1] font-normal text-primary">Calculators</h1>
        <p className="mt-2 max-w-[580px] text-lead text-muted text-pretty">
          Arithmetic on numbers you supply - none of this is a recommendation about any position. The growth
          projection is standalone: it reads nothing from your portfolio and saves nothing.
        </p>
      </div>

      {/* The long-horizon projection gets the full width: it carries a chart
          and two rows of inputs, and squeezed into a third-width column its
          year axis was unreadable. */}
      <GrowthProjector />

      {/* The mock shows all three side by side rather than behind tabs - they
          each answer a different question, so hiding two of them costs a click
          for no benefit. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(330px,1fr))] items-start gap-3.5">
        <PositionSizingCalculator defaultAccountValue={defaultAccountValue} />
        <ScenarioModeler holdings={scenarioHoldings} />
        <GoalTracker goals={goals} />
      </div>
    </div>
  );
}
