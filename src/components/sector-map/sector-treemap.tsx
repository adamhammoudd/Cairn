"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { colorForChange, labelToneForChange, weightedAvgChange } from "@/lib/sector-map";
import type { SectorMapNode } from "@/lib/sector-map";
import { sectorCountLabel } from "@/lib/sector-names";

// Cap tiles per sector so labels stay legible; the rest roll into a remainder
// tile rather than becoming unreadable slivers.
const MAX_TILES = 6;

type SectorSort = "cap" | "gainers" | "losers";

/** Ordering the map offers. "By size" is the default because tile area already
 *  encodes market cap - sorting by it keeps the biggest ground at the top
 *  where the eye starts. */
const SORTS: [SectorSort, string][] = [
  ["cap", "By size"],
  ["gainers", "Green first"],
  ["losers", "Red first"],
];

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
  const [sort, setSort] = useState<SectorSort>("cap");

  // Sector-level figures, all derived from the same weighted average the
  // cards already show - so the summary above cannot disagree with the tiles
  // below it.
  const { ordered, stats } = useMemo(() => {
    const scored = data.map((sector) => ({
      sector,
      avg: weightedAvgChange(sector.children),
      weight: sector.children.reduce((sum, c) => sum + c.size, 0),
      top: [...sector.children].sort((a, b) => b.size - a.size)[0],
    }));
    const withAvg = scored.filter((x) => x.avg !== null) as (Omit<(typeof scored)[number], "avg"> & {
      avg: number;
    })[];
    const ordered = [...scored].sort((a, b) => {
      if (sort === "gainers") return (b.avg ?? -Infinity) - (a.avg ?? -Infinity);
      if (sort === "losers") return (a.avg ?? Infinity) - (b.avg ?? Infinity);
      return b.weight - a.weight;
    });
    const green = withAvg.filter((x) => x.avg >= 0).length;
    const best = [...withAvg].sort((a, b) => b.avg - a.avg)[0];
    const worst = [...withAvg].sort((a, b) => a.avg - b.avg)[0];
    const mapped = data.reduce((sum, sector) => sum + sector.children.length, 0);
    const breadth = withAvg.length > 0 ? Math.round((green / withAvg.length) * 100) : null;
    return {
      ordered,
      stats: [
        {
          label: "Breadth",
          value: breadth === null ? "n/a" : `${breadth}%`,
          note: withAvg.length > 0 ? `${green} of ${withAvg.length} sectors green` : "no priced sectors yet",
          tone: breadth === null ? "text-muted" : breadth >= 50 ? "text-accent" : "text-negative",
        },
        {
          label: "Strongest",
          // The SECTOR, by name - not its biggest ticker ("Strongest: BE" read as a
          // company call). The note says how many companies the move is based on.
          value: best?.sector.name ?? "n/a",
          note: best ? `${best.avg >= 0 ? "+" : "−"}${Math.abs(best.avg).toFixed(2)}% · ${sectorCountLabel(best.sector.name, best.sector.children.length)}` : "not enough data",
          tone: "text-accent",
        },
        {
          label: "Weakest",
          value: worst?.sector.name ?? "n/a",
          note: worst
            ? `${worst.avg >= 0 ? "+" : "−"}${Math.abs(worst.avg).toFixed(2)}% · ${sectorCountLabel(worst.sector.name, worst.sector.children.length)}`
            : "not enough data",
          tone: "text-negative",
        },
        {
          label: "Mapped",
          value: String(mapped),
          note: `${mapped === 1 ? "symbol" : "symbols"} across ${data.length} ${
            data.length === 1 ? "sector" : "sectors"
          }`,
          tone: "text-info",
        },
      ],
    };
  }, [data, sort]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex w-fit flex-wrap gap-[3px] rounded-[10px] border border-line-soft bg-canvas p-[3px]">
          {SORTS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              className={`rounded-[7px] px-3 py-1.5 text-[11.5px] whitespace-nowrap transition-colors duration-base ease-standard ${
                sort === key ? "bg-line-soft text-primary" : "text-muted hover:text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-eyebrow text-dim">−5%</span>
          <div
            className="h-2.5 w-[150px] rounded-[5px]"
            style={{
              // The spec's stops. The flat mid-tones are what a near-zero
              // tile actually looks like once its low-alpha fill sits on the
              // panel, so the key matches the ground it explains.
              background: "linear-gradient(90deg, var(--color-negative), var(--color-legend-neg), var(--color-legend-pos), var(--color-accent))",
            }}
          />
          <span className="font-mono text-eyebrow text-dim">+5%</span>
        </div>
      </div>

      {/* Breadth, the extremes, and coverage - the three questions a map like
          this gets asked before any single tile is looked at. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className="animate-rise-in flex flex-col gap-1.5 rounded-[14px] border border-line-soft bg-panel px-4.5 py-4"
            style={{ animationDelay: `${60 + i * 55}ms` }}
          >
            <div className="font-mono text-eyebrow tracking-[0.18em] text-dim uppercase">{stat.label}</div>
            <div className={`truncate font-serif text-[30px] leading-[1.1] ${stat.tone}`}>{stat.value}</div>
            <div className="text-caption text-muted">{stat.note}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
        {ordered.map(({ sector }, index) => {
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
              className={`animate-rise-in rounded-[14px] border bg-panel px-4 py-[15px] transition-[border-color,transform] duration-[220ms] ease-standard hover:-translate-y-0.5 hover:border-line-strong ${
                sector.name === focusedSector ? "border-accent/45" : "border-line-soft"
              }`}
              style={{ animationDelay: `${100 + index * 40}ms` }}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-mono text-eyebrow leading-[1.5] tracking-[0.13em] text-muted uppercase">
                  {sector.name}
                  {sector.name === focusedSector && <span className="text-accent normal-case">· focus</span>}
                  <span className="font-sans text-micro tracking-normal text-dim normal-case">{sectorCountLabel(sector.name, sector.children.length)}</span>
                </span>
                <span
                  className={`font-mono text-[11.5px] whitespace-nowrap tabular-nums ${
                    avg === null ? "text-muted" : avg >= 0 ? "text-accent" : "text-negative"
                  }`}
                >
                  {fmtPct(avg)}
                </span>
              </div>

              <div className="flex h-28 gap-1">
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
                        background: colorForChange(tile.changePct),
                      }}
                      className="@container flex min-w-[34px] flex-col pointer-coarse:min-w-11 justify-end gap-1 overflow-hidden rounded-control p-2 transition-[filter,box-shadow] duration-base ease-standard hover:brightness-[1.22] hover:outline hover:outline-1 hover:outline-white/20"
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
