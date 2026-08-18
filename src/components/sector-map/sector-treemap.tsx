"use client";

import Link from "next/link";
import { colorForChange, labelToneForChange, weightedAvgChange } from "@/lib/sector-map";
import type { SectorMapNode } from "@/lib/sector-map";

// Cap tiles per sector so labels stay legible; the rest roll into a remainder
// tile rather than becoming unreadable slivers.
const MAX_TILES = 6;

function fmtPct(pct: number | null) {
  if (pct === null) return "—";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

export function SectorTreemap({ data }: { data: SectorMapNode[] }) {
  return (
    <div>
      <div>
        <span>−5%</span>
        <div

 />
        <span>+5%</span>
      </div>

      <div>
        {data.map((sector, index) => {
          const sorted = [...sector.children].sort((a, b) => b.size - a.size);
          const tiles = sorted.slice(0, MAX_TILES);
          const total = tiles.reduce((sum, t) => sum + t.size, 0) || 1;
          const avg = weightedAvgChange(sector.children);

          return (
            <div
              key={sector.name}

 >
              <div>
                <span>{sector.name}</span>
                <span

 >
                  {fmtPct(avg)}
                </span>
              </div>

              <div>
                {tiles.map((tile) => {
                  const tone = labelToneForChange(tile.changePct);
                  return (
                    <Link
                      key={tile.name}
                      href={`/ticker/${tile.name}`}
                      // Floor each tile at 8% of the row so a mega-cap next to a
                      // small-cap doesn't reduce the latter to an invisible sliver.

 >
                      <span

 >
                        {tile.name}
                      </span>
                      <span

 >
                        {fmtPct(tile.changePct)}
                      </span>
                    </Link>
                  );
                })}
              </div>

              {sorted.length > MAX_TILES && (
                <div>+{sorted.length - MAX_TILES} smaller holdings</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
