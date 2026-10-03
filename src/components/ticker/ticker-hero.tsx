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
  /** "≈ €192.40 (ECB, 26 Sep 2026)" - the price in the reader's currency, only when it differs. */
  priceHint?: string | null;
  /** "Prices in USD" - the asset's own currency, named once. Null for a rate or an index level. */
  pricesIn?: string | null;
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
  priceHint = null,
  pricesIn = null,
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

      {/* Below 1024px the identity, price and actions stack in one
          left-aligned column. The two-sided layout (price on the right) only
          applies once the row fits: when the blocks wrapped on a phone, the
          name sat left, the price right and the buttons left again. */}
      <div className="relative flex flex-col items-start gap-5 px-5.5 py-5 lg:flex-row lg:flex-wrap lg:justify-between lg:gap-5.5">
        {/* Identity. On phones the logo and name share the first row and the
            ticker, type and position chips start at the left edge under both;
            from 1024px the ticker and type sit beside the name, as before. */}
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3 lg:gap-y-0">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-gradient-to-br from-accent-light to-accent-dark px-1 font-mono text-micro leading-none font-semibold text-canvas lg:row-span-2">
            {symbol.slice(0, 5)}
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h1 className="font-serif text-[38px] leading-none font-normal tracking-[-0.015em] text-primary">
              {name}
            </h1>
            <span className="hidden font-mono text-caption text-muted lg:inline">{symbol}</span>
            <span className="hidden rounded-xs border border-line px-1.5 py-0.5 font-mono text-eyebrow text-muted uppercase lg:inline">
              {typeBadge}
            </span>
          </div>
          <div className={`col-span-2 flex flex-wrap items-center gap-2 lg:col-span-1 lg:col-start-2 ${chips.length > 0 ? "lg:mt-3" : "lg:hidden"}`}>
            <span className="font-mono text-caption text-muted lg:hidden">{symbol}</span>
            <span className="rounded-xs border border-line px-1.5 py-0.5 font-mono text-eyebrow text-muted uppercase lg:hidden">
              {typeBadge}
            </span>
            {chips.map((c) => (
              <span
                key={c}
                className="rounded-control border border-line bg-canvas px-2.5 py-1 text-micro text-muted"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-start gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:gap-5.5">
          <div className="text-left lg:text-right">
            {pricesIn && <div className="mb-2 font-mono text-eyebrow tracking-[0.14em] text-dim uppercase">{pricesIn}</div>}
            <div className="font-mono text-[36px] leading-none tracking-[-0.015em] tabular-nums text-primary">
              {priceLabel}
            </div>
            {priceHint && <div className="mt-1.5 font-mono text-caption tabular-nums text-dim">{priceHint}</div>}
            <div className="mt-2.5 flex flex-wrap items-center justify-start gap-2.5 lg:justify-end">
              {changePct !== null && (
                <span
                  className={`rounded-control border px-2.5 py-1 font-mono text-caption tabular-nums ${tone.border} ${tone.bg} ${tone.text}`}
                >
                  {positive ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
                </span>
              )}
              {changeLabel && <span className="font-mono text-caption tabular-nums text-muted">{changeLabel}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-start gap-x-2.5 gap-y-1 lg:justify-end">
              {priceSource === "live" && (
                <span aria-hidden className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inset-0 rounded-full bg-accent" />
                  <span className="animate-ping-ring absolute inset-0 rounded-full bg-accent" />
                </span>
              )}
              <DataFreshness source={priceSource} asOf={priceAsOf} />
              <LivePricePoll refreshRateSeconds={refreshRateSeconds} live={priceSource === "live"} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
        </div>
      </div>

      {/* Day-range rail. Only drawn when the session actually has a low and a
          high - an empty track with no marker says nothing, and a marker with
          no position would have to be guessed. */}
      {dayRange && (
        <div className="relative flex flex-wrap items-center gap-3.5 border-t border-line-soft bg-canvas/50 px-5.5 py-3.5">
          <span className="font-mono text-micro tabular-nums text-dim">{dayRange.low}</span>
          <div className="relative h-1 min-w-0 flex-1 rounded-full bg-gradient-to-r from-line-soft to-line lg:min-w-[140px] lg:flex-[1_1_220px]">
            {dayRange.position !== null && (
              <div
                className="absolute -top-1 h-3 w-0.5 rounded-xs bg-accent-light shadow-[0_0_10px_rgba(94,230,166,0.8)]"
                style={{ left: `${dayRange.position * 100}%` }}
              />
            )}
          </div>
          <span className="font-mono text-micro tabular-nums text-dim">{dayRange.high}</span>
          {/* First, on its own line, below 1024px: low, rail and high then share one row. */}
          <span className="order-first basis-full font-mono text-eyebrow text-dim uppercase lg:order-none lg:basis-auto">Day range</span>
        </div>
      )}
    </section>
  );
}
