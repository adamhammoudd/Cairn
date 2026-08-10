"use client";

import { useActionState, useTransition } from "react";
import { createGoal, deleteGoal } from "@/lib/actions/planning";
import type { GoalProgress } from "@/lib/planning";

function fmtCurrency(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function GoalTracker({ goals }: { goals: GoalProgress[] }) {
  const [error, formAction] = useActionState(createGoal, null);
  const [, startMutate] = useTransition();

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-card border border-line bg-panel p-6">
        <div className="mb-1 text-[15px] font-semibold text-primary">Goal tracking</div>
        <p className="mb-5 text-[12.5px] text-dim">
          Set a target portfolio value and date. Progress and required annual return are computed from your
          current portfolio value — not a prediction of whether you&apos;ll get there.
        </p>

        <form action={formAction} className="grid grid-cols-[1.4fr_1fr_1fr_auto] items-end gap-3">
          <label className="flex flex-col gap-1.5 text-[12.5px] text-muted">
            Goal name
            <input
              name="name"
              placeholder="e.g. Retirement fund"
              className="rounded-lg border border-line bg-active px-3 py-2 text-[13px] text-primary outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[12.5px] text-muted">
            Target value ($)
            <input
              name="target_value"
              placeholder="e.g. 250000"
              className="rounded-lg border border-line bg-active px-3 py-2 text-[13px] text-primary outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[12.5px] text-muted">
            Target date
            <input
              type="date"
              name="target_date"
              className="rounded-lg border border-line bg-active px-3 py-2 text-[13px] text-primary outline-none"
            />
          </label>
          <button type="submit" className="rounded-lg border border-line px-3.5 py-2 text-[13px] text-primary">
            Add goal
          </button>
        </form>
        {error && error !== "saved" && <p className="mt-2 text-[12.5px] text-negative">{error}</p>}
      </div>

      {goals.length === 0 ? (
        <div className="rounded-card border border-dashed border-line p-12 text-center text-sm text-muted">
          No goals yet. Add one above.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {goals.map((g) => {
            const progressWidth = Math.min(Math.max(g.progressPct, 0), 100);
            return (
              <div key={g.id} className="rounded-card border border-line bg-panel p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[14px] font-semibold text-primary">{g.name}</div>
                    <div className="mt-0.5 text-[12.5px] text-muted">
                      {fmtCurrency(g.currentValue)} of {fmtCurrency(g.target_value)} by{" "}
                      {new Date(g.target_date).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => startMutate(() => deleteGoal(g.id))}
                    className="text-[12px] text-muted hover:text-negative"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-active">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${progressWidth}%` }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-[12px] text-muted">
                  <span>{g.progressPct.toFixed(1)}% of target</span>
                  <span>
                    {g.yearsRemaining === null
                      ? "Target date passed"
                      : g.requiredAnnualReturnPct === null
                        ? "No current portfolio value to project from"
                        : `Needs ${g.requiredAnnualReturnPct.toFixed(1)}%/yr for ${g.yearsRemaining.toFixed(1)}y`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
