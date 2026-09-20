"use client";

import type { ReactNode } from "react";
import { DataFreshness } from "@/components/data-freshness";
import { LivePricePoll } from "@/components/live-price-poll";

// The Ticker Detail hero, transcribed from Cairn "Ticker Detail.dc.html": a
// full-width sheet carrying the identity block, the headline price, the two
// actions, and the day-range rail on its own footer strip.
//
// Everything it prints is handed in already formatted by the workspace, which
// owns the currency/rate/level routing. Nothing here derives a figure, so a
// forex pair can't pick up a dollar sign on its way through the hero.

interface TickerHeroProps {
  symbol: string;
  name: string;
  typeBadge: string;
  /** Position chips: held quantity, average cost, weight. Empty when unheld. */
  chips: string[];
  priceLabel: string;
  changePct: number | null;
  changeLabel: string | null;
  priceSource: "live" | "last_close";
  priceAsOf: string | null;
  refreshRateSeconds: number | null;
  /** Day low/high already formatted, plus where the last price sits, 0-1. */
  dayRange: { low: string; high: string; position: number | null } | null;
  actions: ReactNode;
}

export function TickerHero({
  symbol,
  name,
  typeBadge,
  chips,
  priceLabel,
  changePct,
  changeLabel,
  priceSource,
  priceAsOf,
  refreshRateSeconds,
  dayRange,
  actions,
}: TickerHeroProps) {
  const positive = (changePct ?? 0) >= 0;
  // Unknown stays neutral rather than defaulting to green: an absent change is
  // not a flat day, and the brand reserves the gain/loss pair for real moves.
  const tone =
    changePct === null
      ? { text: "text-muted", border: "border-line", bg: "bg-transparent" }
      : positive
        ? { text: "text-accent-light", border: "border-accent/40", bg: "bg-accent/10" }
        : { text: "text-negative-light", border: "border-negative/40", bg: "bg-negative/10" };

  return (
    <section className="animate-rise-in relative overflow-hidden rounded-sheet border border-line bg-panel">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(150deg, rgba(47,198,133,0.09), transparent 42%), radial-gradient(520px 200px at 82% 0%, rgba(47,198,133,0.12), transparent 70%)",
        }}
      />

      <div className="relative flex flex-wrap items-start justify-between gap-5.5 px-5.5 py-5">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-gradient-to-br from-accent-light to-accent-dark px-1 font-mono text-micro leading-none font-semibold text-canvas">
            {symbol.slice(0, 5)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-serif text-[38px] leading-none font-normal tracking-[-0.015em] text-primary">
                {name}
              </h1>
              <span className="font-mono text-caption text-muted">{symbol}</span>
              <span className="rounded-xs border border-line px-1.5 py-0.5 font-mono text-eyebrow text-muted uppercase">
                {typeBadge}
              </span>
            </div>
            {chips.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {chips.map((c) => (
                  <span
                    key={c}
                    className="rounded-control border border-line bg-canvas px-2.5 py-1 text-micro text-muted"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-5.5">
          <div className="text-right">
            <div className="font-mono text-[36px] leading-none tracking-[-0.015em] tabular-nums text-primary">
              {priceLabel}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2.5">
              {changePct !== null && (
                <span
                  className={`rounded-control border px-2.5 py-1 font-mono text-caption tabular-nums ${tone.border} ${tone.bg} ${tone.text}`}
                >
                  {positive ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
                </span>
              )}
              {changeLabel && <span className="font-mono text-caption tabular-nums text-muted">{changeLabel}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1">
              {priceSource === "live" && (
                <span aria-hidden className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inset-0 rounded-full bg-accent" />
                  <span className="animate-ping-ring absolute inset-0 rounded-full bg-accent" />
                </span>
              )}
              <DataFreshness source={priceSource} asOf={priceAsOf} />
              <LivePricePoll refreshRateSeconds={refreshRateSeconds} />
            </div>
          </div>
          <div className="flex items-center gap-2.5">{actions}</div>
        </div>
      </div>

      {/* Day-range rail. Only drawn when the session actually has a low and a
          high - an empty track with no marker says nothing, and a marker with
          no position would have to be guessed. */}
      {dayRange && (
        <div className="relative flex flex-wrap items-center gap-3.5 border-t border-line-soft bg-canvas/50 px-5.5 py-3.5">
          <span className="font-mono text-micro tabular-nums text-dim">{dayRange.low}</span>
          <div className="relative h-1 min-w-[140px] flex-[1_1_220px] rounded-full bg-gradient-to-r from-line-soft to-line">
            {dayRange.position !== null && (
              <div
                className="absolute -top-1 h-3 w-0.5 rounded-xs bg-accent-light shadow-[0_0_10px_rgba(94,230,166,0.8)]"
                style={{ left: `${dayRange.position * 100}%` }}
              />
            )}
          </div>
          <span className="font-mono text-micro tabular-nums text-dim">{dayRange.high}</span>
          <span className="font-mono text-eyebrow text-dim uppercase">Day range</span>
        </div>
      )}
    </section>
  );
}
