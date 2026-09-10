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

export function SectorTreemap({
  data,
  focusedSector = null,
}: {
  data: SectorMapNode[];
  /** Settings > Display > "Sector map focus" - ringed rather than isolated. */
  focusedSector?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2.5 self-end">
        <span className="font-mono text-eyebrow text-dim uppercase">−5%</span>
        <div
          className="h-2 w-32.5 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, rgba(217,108,108,1), rgba(217,108,108,0.15), rgba(47,198,133,0.15), rgba(47,198,133,1))",
          }}
        />
        <span className="font-mono text-eyebrow text-dim uppercase">+5%</span>
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
              // The focus sector gets the accent border, not a different
              // colour scale: saturation on these tiles means gain/loss and
              // nothing else, so "this is the one you picked" has to be said
              // with the frame.
              className={`animate-rise-in rounded-card border bg-panel p-4 ${
                sector.name === focusedSector ? "border-accent/45" : "border-line"
              }`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-mono text-eyebrow text-muted uppercase">
                  {sector.name}
                  {sector.name === focusedSector && <span className="text-accent normal-case">· focus</span>}
                </span>
                <span
                  className={`text-body tabular-nums ${
                    avg === null ? "text-muted" : avg >= 0 ? "text-accent" : "text-negative"
                  }`}
                >
                  {fmtPct(avg)}
                </span>
              </div>

              <div className="flex h-32.5 gap-1">
                {tiles.map((tile) => {
                  const tone = labelToneForChange(tile.changePct);
                  // Small tiles truncate to a couple of characters (several
                  // distinct tickers can all read as "U."), with nothing to
                  // disambiguate them - the reported bug, confirmed in at
                  // least two sectors now. `title` gives every tile a native
                  // hover tooltip with its full symbol AND real name
                  // regardless of how narrow it renders.
                  const tileLabel = tile.displayName
                    ? `${tile.name} · ${tile.displayName} · ${fmtPct(tile.changePct)}`
                    : `${tile.name} · ${fmtPct(tile.changePct)}`;
                  return (
                    <Link
                      key={tile.name}
                      href={`/ticker/${tile.name}`}
                      title={tileLabel}
                      aria-label={tileLabel}
                      // Floor each tile at 10% of the row (was 8%) so a
                      // narrow tile has room for 2-3 characters before
                      // truncating instead of collapsing to one - the bonus
                      // half of the same fix, cheap enough to be worth doing:
                      // a handful of extra px per tile, no layout redesign.
                      style={{
                        flexGrow: Math.max(tile.size, total * 0.1),
                        flexBasis: 0,
                        minWidth: "34px",
                        background: colorForChange(tile.changePct),
                      }}
                      className="@container flex min-w-0 flex-col justify-end gap-1 overflow-hidden rounded-control p-2 transition-[transform,box-shadow] duration-base ease-standard hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(0,0,0,0.45)]"
                    >
                      {/* A 34px tile minus p-2 leaves ~18px of text - two
                          characters. The earlier pass added the title tooltip
                          and raised the floor, but the labels still rendered
                          as "P…" and "-0…", which read as data while carrying
                          none, and on a treemap where area and colour already
                          encode the values that is worse than nothing.
                          Each tile is its own @container, so a label appears
                          only on a tile wide enough to hold it; below that the
                          tile stays a clean block and the full symbol, name
                          and move remain available via title/aria-label. */}
                      <span
                        className={`hidden truncate text-caption font-semibold @[52px]:block ${
                          tone === "dark" ? "text-canvas" : "text-primary"
                        }`}
                      >
                        {tile.name}
                      </span>
                      <span
                        className={`hidden truncate font-mono text-eyebrow tabular-nums @[68px]:block ${
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
                <div className="mt-2 text-micro text-dim">+{sorted.length - MAX_TILES} smaller holdings</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
