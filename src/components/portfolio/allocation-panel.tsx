"use client";

import { useState } from "react";
import type { AllocationSlice } from "@/lib/portfolio";

const DIMENSIONS = [
  { key: "asset_class", label: "Asset class" },
  { key: "sector", label: "Sector" },
  { key: "geography", label: "Geography" },
] as const;

// ui-reset-v2: neutral placeholders, no brand color system in this baseline.
const COLORS = ["#555555", "#666666", "#777777", "#888888", "#999999"];

interface AllocationPanelProps {
  byDimension: Record<(typeof DIMENSIONS)[number]["key"], AllocationSlice[]>;
}

export function AllocationPanel({ byDimension }: AllocationPanelProps) {
  const [dimension, setDimension] = useState<(typeof DIMENSIONS)[number]["key"]>("asset_class");
  const slices = byDimension[dimension];

  return (
    <div>
      <div>
        {DIMENSIONS.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setDimension(d.key)}

 >
            {d.label}
          </button>
        ))}
      </div>

      {slices.length === 0 ? (
        <div>No holdings to allocate yet.</div>
      ) : (
        <div>
          {slices.map((s, i) => (
            <div key={s.label}>
              <div>
                <span>
                  {s.label} · {s.pct.toFixed(0)}%
                </span>
                <span>{s.value.toLocaleString(undefined, { style: "currency", currency: "USD" })}</span>
              </div>
              <div>
                <div

 />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
