"use client";

import { useState } from "react";
import type { AllocationSlice } from "@/lib/portfolio";

const DIMENSIONS = [
  { key: "asset_class", label: "Asset class" },
  { key: "sector", label: "Sector" },
  { key: "geography", label: "Geography" },
] as const;

const COLORS = ["#2FC685", "#5EE6A6", "#22B573", "#8A8A8A", "#6A6A6A"];

interface AllocationPanelProps {
  byDimension: Record<(typeof DIMENSIONS)[number]["key"], AllocationSlice[]>;
}

export function AllocationPanel({ byDimension }: AllocationPanelProps) {
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
            className={`rounded-md px-3 py-1.5 text-xs ${
              dimension === d.key ? "bg-active text-primary" : "text-muted"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {slices.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted">No holdings to allocate yet.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {slices.map((s, i) => (
            <div key={s.label}>
              <div className="mb-1.5 flex justify-between text-[13px] text-primary">
                <span>
                  {s.label} · {s.pct.toFixed(0)}%
                </span>
                <span>{s.value.toLocaleString(undefined, { style: "currency", currency: "USD" })}</span>
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
