"use client";

import { useState } from "react";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { formatMoney } from "@/lib/display-prefs";
import type { AllocationSlice } from "@/lib/portfolio";

const DIMENSIONS = [
  { key: "asset_class", label: "Asset class" },
  { key: "sector", label: "Sector" },
  { key: "geography", label: "Geography" },
] as const;

const COLORS = ["var(--color-accent)", "var(--color-accent-light)", "var(--color-accent-dark)", "var(--color-muted)", "var(--color-dim)"];

interface AllocationPanelProps {
  byDimension: Record<(typeof DIMENSIONS)[number]["key"], AllocationSlice[]>;
}

export function AllocationPanel({ byDimension }: AllocationPanelProps) {
  const prefs = useDisplayPrefs();
  const [dimension, setDimension] = useState<(typeof DIMENSIONS)[number]["key"]>("asset_class");
  const slices = byDimension[dimension];

  return (
    <div className="rounded-card border border-line bg-panel p-6">
      <div className="mb-4 flex gap-1.5">
        {DIMENSIONS.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setDimension(d.key)}
            className={`rounded-control px-3 py-1.5 text-caption ${
              dimension === d.key ? "bg-active text-primary" : "text-muted"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {slices.length === 0 ? (
        <div className="py-8 text-center text-lead text-muted">No holdings to allocate yet.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {slices.map((s, i) => (
            <div key={s.label}>
              <div className="mb-1.5 flex justify-between text-body text-primary">
                <span>
                  {s.label} · {s.pct.toFixed(0)}%
                </span>
                <span>{formatMoney(s.value, prefs)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-active">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${s.pct}%`, background: COLORS[i % COLORS.length] }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
