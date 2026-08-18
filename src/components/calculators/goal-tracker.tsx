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
    <div className="flex flex-col gap-3.5">
      <CalcCard
        title="Goal tracking"
        blurb="Set a target portfolio value and date. Progress and required annual return are computed from your current portfolio value — not a prediction of whether you'll get there."
      >
        <form action={formAction} className="grid grid-cols-1 items-end gap-2.75 sm:grid-cols-2">
          <CalcField label="Goal name">
            <input name="name" placeholder="e.g. Retirement fund" className={CALC_INPUT} />
          </CalcField>
          <CalcField label="Target value ($)">
            <input name="target_value" placeholder="e.g. 250000" className={CALC_INPUT} />
          </CalcField>
          <CalcField label="Target date">
            <input type="date" name="target_date" className={CALC_INPUT} />
          </CalcField>
          <button
            type="submit"
            className="rounded-lg border border-line px-3.5 py-2.5 text-[12.5px] text-primary transition-colors duration-base ease-standard hover:border-[#3A3A3A] hover:bg-active"
          >
            Add goal
          </button>
        </form>
        {error && error !== "saved" && <p className="mt-2 text-[12.5px] text-negative">{error}</p>}
      </CalcCard>

      {goals.length === 0 ? (
        <div className="rounded-card border border-dashed border-line px-6 py-16 text-center">
          <div className="font-serif text-[20px] text-primary">No summit picked yet</div>
          <p className="mx-auto mt-2 max-w-[380px] text-[13px] text-muted text-pretty">
            Add a target value and date above to track progress against it.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {goals.map((g, index) => {
            const progressWidth = Math.min(Math.max(g.progressPct, 0), 100);
            return (
              <div
                key={g.id}
                className="animate-rise-in rounded-card border border-line bg-panel p-4.5"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-serif text-[17px] text-primary">{g.name}</div>
                    <div className="mt-1 text-[12.5px] tabular-nums text-muted">
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
                    className="shrink-0 text-[12px] text-muted transition-colors duration-fast ease-standard hover:text-negative"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-active">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent-light to-accent-dark transition-[width] duration-base ease-standard"
                    style={{ width: `${progressWidth}%` }}
                  />
                </div>

                <div className="mt-2.25 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
                  <span className="tabular-nums">{g.progressPct.toFixed(1)}% of target</span>
                  <span className="tabular-nums">
                    {g.yearsRemaining === null ? "Target date passed" : `${g.yearsRemaining.toFixed(1)}y remaining`}
                  </span>
                </div>

                <div className="mt-3.5 rounded-xl border border-line bg-canvas p-3.25">
                  <div className="text-[11.5px] text-muted">Required annual return to hit the target on time</div>
                  <div className="mt-1.75 font-serif text-[22px] tabular-nums text-primary">
                    {g.yearsRemaining === null
                      ? "—"
                      : g.requiredAnnualReturnPct === null
                        ? "—"
                        : `${g.requiredAnnualReturnPct.toFixed(1)}%`}
                  </div>
                  <div className="mt-1.5 text-[11px] leading-relaxed text-dim text-pretty">
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
