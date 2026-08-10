"use client";

import { ResponsiveContainer, Treemap } from "recharts";
import { colorForChange } from "@/lib/sector-map";
import type { SectorMapNode } from "@/lib/sector-map";

interface CellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  changePct?: number | null;
  depth?: number;
}

function Cell({ x = 0, y = 0, width = 0, height = 0, name, changePct = null, depth }: CellProps) {
  // depth 1 = sector group rect (no fill, just a label strip); depth 2 = a symbol leaf.
  if (depth === 1) {
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill="none" stroke="#2A2A2A" strokeWidth={1} />
        {width > 60 && height > 18 && (
          <text x={x + 6} y={y + 14} fontSize={11} fill="#8A8A8A" className="uppercase">
            {name}
          </text>
        )}
      </g>
    );
  }

  const showLabel = width > 40 && height > 28;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={colorForChange(changePct ?? null)} stroke="#0F0F0F" strokeWidth={1.5} />
      {showLabel && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 4} textAnchor="middle" fontSize={12} fill="#F2F2F2">
            {name}
          </text>
          <text x={x + width / 2} y={y + height / 2 + 12} textAnchor="middle" fontSize={11} fill="#C9C9C9">
            {changePct === null ? "—" : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`}
          </text>
        </>
      )}
    </g>
  );
}

export function SectorTreemap({ data }: { data: SectorMapNode[] }) {
  return (
    <div className="rounded-card border border-line bg-panel p-4">
      <ResponsiveContainer width="100%" height={520}>
        <Treemap
          data={data as unknown as Record<string, unknown>[]}
          dataKey="size"
          stroke="#0F0F0F"
          content={<Cell />}
          isAnimationActive={false}
        />
      </ResponsiveContainer>
    </div>
  );
}
