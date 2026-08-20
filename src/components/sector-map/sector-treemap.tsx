"use client";

import Link from "next/link";
import { colorForChange, labelToneForChange, weightedAvgChange } from "@/lib/sector-map";
import type { SectorMapNode } from "@/lib/sector-map";

// Cap tiles per sector so labels stay legible; the rest roll into a remainder
// tile rather than becoming unreadable slivers.
const MAX_TILES = 6;

function fmtPct(pct: number | null) {
  if (pct === null) return "-";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

export function SectorTreemap({ data }: { data: SectorMapNode[] }) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2.5 self-end">
        <span className="font-mono text-[10px] tracking-[0.12em] text-dim uppercase">−5%</span>
        <div
          className="h-2 w-32.5 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, rgba(217,108,108,1), rgba(217,108,108,0.15), rgba(47,198,133,0.15), rgba(47,198,133,1))",
          }}
        />
        <span className="font-mono text-[10px] tracking-[0.12em] text-dim uppercase">+5%</span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
        {data.map((sector, index) => {
          const sorted = [...sector.children].sort((a, b) => b.size - a.size);
          const tiles = sorted.slice(0, MAX_TILES);
          const total = tiles.reduce((sum, t) => sum + t.size, 0) || 1;
          const avg = weightedAvgChange(sector.children);

          return (
            <div
              key={sector.name}
              className="animate-rise-in rounded-card border border-line bg-panel p-3.75"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">{sector.name}</span>
                <span
                  className={`text-[12.5px] tabular-nums ${
                    avg === null ? "text-muted" : avg >= 0 ? "text-accent" : "text-negative"
                  }`}
                >
                  {fmtPct(avg)}
                </span>
              </div>

              <div className="flex h-32.5 gap-1">
                {tiles.map((tile) => {
                  const tone = labelToneForChange(tile.changePct);
                  return (
                    <Link
                      key={tile.name}
                      href={`/ticker/${tile.name}`}
                      // Floor each tile at 8% of the row so a mega-cap next to a
                      // small-cap doesn't reduce the latter to an invisible sliver.
                      style={{
                        flexGrow: Math.max(tile.size, total * 0.08),
                        flexBasis: 0,
                        background: colorForChange(tile.changePct),
                      }}
                      className="flex min-w-0 flex-col justify-end gap-0.75 overflow-hidden rounded-[9px] p-2.25 transition-[transform,box-shadow] duration-base ease-standard hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(0,0,0,0.45)]"
                    >
                      <span
                        className={`truncate text-[12px] font-semibold ${tone === "dark" ? "text-canvas" : "text-primary"}`}
                      >
                        {tile.name}
                      </span>
                      <span
                        className={`truncate font-mono text-[10px] tabular-nums ${
                          tone === "dark" ? "text-canvas/75" : "text-muted"
                        }`}
                      >
                        {fmtPct(tile.changePct)}
                      </span>
                    </Link>
                  );
                })}
              </div>

              {sorted.length > MAX_TILES && (
                <div className="mt-2 text-[11px] text-dim">+{sorted.length - MAX_TILES} smaller holdings</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
