"use client";

import { useActionState, useTransition } from "react";
import { createGoal, deleteGoal } from "@/lib/actions/planning";
import type { GoalProgress } from "@/lib/planning";
import { CALC_INPUT, CalcCard, CalcField } from "@/components/calculators/calc-primitives";

function fmtCurrency(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function GoalTracker({ goals }: { goals: GoalProgress[] }) {
  const [error, formAction] = useActionState(createGoal, null);
  const [, startMutate] = useTransition();

  return (
    <div>
      <CalcCard
        title="Goal tracking"
        blurb="Set a target portfolio value and date. Progress and required annual return are computed from your current portfolio value — not a prediction of whether you'll get there."
 >
        <form action={formAction}>
          <CalcField label="Goal name">
            <input name="name" placeholder="e.g. Retirement fund" />
          </CalcField>
          <CalcField label="Target value ($)">
            <input name="target_value" placeholder="e.g. 250000" />
          </CalcField>
          <CalcField label="Target date">
            <input type="date" name="target_date" />
          </CalcField>
          <button
            type="submit"

 >
            Add goal
          </button>
        </form>
        {error && error !== "saved" && <p>{error}</p>}
      </CalcCard>

      {goals.length === 0 ? (
        <div>
          <div>No summit picked yet</div>
          <p>
            Add a target value and date above to track progress against it.
          </p>
        </div>
      ) : (
        <div>
          {goals.map((g, index) => {
            const progressWidth = Math.min(Math.max(g.progressPct, 0), 100);
            return (
              <div
                key={g.id}

 >
                <div>
                  <div>
                    <div>{g.name}</div>
                    <div>
                      {fmtCurrency(g.currentValue)} of {fmtCurrency(g.target_value)} by{" "}
                      {new Date(g.target_date).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => startMutate(() => deleteGoal(g.id))}

 >
                    Remove
                  </button>
                </div>

                <div>
                  <div

 />
                </div>

                <div>
                  <span>{g.progressPct.toFixed(1)}% of target</span>
                  <span>
                    {g.yearsRemaining === null ? "Target date passed" : `${g.yearsRemaining.toFixed(1)}y remaining`}
                  </span>
                </div>

                <div>
                  <div>Required annual return to hit the target on time</div>
                  <div>
                    {g.yearsRemaining === null
                      ? "—"
                      : g.requiredAnnualReturnPct === null
                        ? "—"
                        : `${g.requiredAnnualReturnPct.toFixed(1)}%`}
                  </div>
                  <div>
                    {g.yearsRemaining === null
                      ? "Target date has passed."
                      : g.requiredAnnualReturnPct === null
                        ? "No current portfolio value to project from."
                        : "Solved from compound growth on today's value. Not a forecast — just the rate the arithmetic requires."}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
