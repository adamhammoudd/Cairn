"use client";

import { useState } from "react";
import Link from "next/link";

interface Step {
  key: string;
  label: string;
  desc: string;
  cta: string;
  href: string;
}

const STEPS: Step[] = [
  {
    key: "holding",
    label: "Add your first holding",
    desc: "Quantity and entry price - Cairn works out value, gain, and news relevance from there.",
    cta: "Add holding",
    href: "/portfolio",
  },
  {
    key: "watchlist",
    label: "Build a watchlist",
    desc: "Group the tickers you're tracking but don't own yet.",
    cta: "New watchlist",
    href: "/watchlists/new",
  },
  {
    key: "briefing",
    label: "Meet the assistant",
    desc: "Ask one question and see how sources and analogs are shown.",
    cta: "Open assistant",
    href: "/assistant",
  },
];

const EMPTY_PREVIEWS = [
  {
    key: "portfolio",
    tag: "Portfolio · empty",
    title: "No stones stacked yet",
    desc: "Value, gain/loss, and news relevance all follow from your first holding.",
  },
  {
    key: "watchlist",
    tag: "Watchlist · empty",
    title: "Nothing marked yet",
    desc: "Watchlists shape news ranking and what the assistant considers relevant.",
  },
  {
    key: "assistant",
    tag: "Assistant · first run",
    title: "Ask anything, see the inputs",
    desc: "Every answer shows sources, historical analogs, and a confidence level.",
  },
];

// Stacking stone dots above the welcome heading - widths shrink top to bottom,
// echoing the cairn mark used across the brand.
const STONES = [
  { width: "w-8.5", delay: "200ms", glow: "rgba(47,198,133,0.25)" },
  { width: "w-6.5", delay: "100ms", glow: "rgba(47,198,133,0.2)" },
  { width: "w-4.5", delay: "0ms", glow: "rgba(47,198,133,0.15)" },
];

export function OnboardingSteps() {
  // Progress is intentionally in-memory only: there's no schema column for it,
  // and a walkthrough is cheap to re-run. Marking a step done is a nudge for
  // this visit, not persisted state.
  const [done, setDone] = useState<string[]>([]);

  const pct = Math.round((done.length / STEPS.length) * 100);
  const allDone = done.length === STEPS.length;

  return (
    <div className="mx-auto flex max-w-[860px] flex-col">
      <div className="animate-page-in relative overflow-hidden rounded-card border border-line bg-gradient-to-b from-raised to-panel px-7.5 py-8.5 text-center">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(460px 180px at 50% 0%, rgba(47,198,133,0.12), transparent 70%)" }}
        />

        <div className="relative mb-5 flex flex-col items-center gap-1.5">
          {STONES.map((stone) => (
            <span
              key={stone.width}
              className={`animate-rise-in h-2 ${stone.width} rounded-full bg-gradient-to-br from-accent-light to-accent-dark`}
              style={{ animationDelay: stone.delay, boxShadow: `0 0 14px ${stone.glow}` }}
            />
          ))}
        </div>

        <h1 className="relative m-0 font-serif text-display leading-[1.1] font-normal text-primary">
          Welcome to Cairn
        </h1>
        <p className="relative mx-auto mt-2.5 max-w-[480px] text-lead leading-relaxed text-muted text-pretty">
          Three steps and Base Camp fills in with your own numbers. Nothing here is a recommendation - Cairn shows
          sourced context and lets you draw the conclusion.
        </p>

        <div className="relative mx-auto mt-5.5 max-w-[300px]">
          <div className="h-1 overflow-hidden rounded-full bg-active">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-light to-accent-dark transition-[width] duration-base ease-standard"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 font-mono text-colhead text-faint uppercase">
            {done.length} of {STEPS.length} complete
          </div>
        </div>
      </div>

      <div className="mt-3.5 flex flex-col gap-2.5">
        {STEPS.map((step, index) => {
          const isDone = done.includes(step.key);
          return (
            <div
              key={step.key}
              className={`animate-rise-in flex flex-wrap items-center gap-3.5 rounded-card border bg-canvas px-4.5 py-4 transition-colors duration-base ease-standard ${
                isDone ? "border-accent/40" : "border-line"
              }`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-caption transition-colors duration-base ease-standard ${
                  isDone ? "bg-gradient-to-br from-accent-light to-accent-dark text-canvas" : "bg-active text-muted"
                }`}
              >
                {isDone ? "✓" : index + 1}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-lead text-primary">{step.label}</div>
                <p className="mt-1 text-caption leading-relaxed text-muted text-pretty">{step.desc}</p>
              </div>

              <Link
                href={step.href}
                onClick={() => setDone((prev) => (prev.includes(step.key) ? prev : [...prev, step.key]))}
                className="shrink-0 rounded-panel border border-line px-4 py-2 text-body text-primary transition-colors duration-fast ease-standard hover:border-accent"
              >
                {isDone ? "Revisit" : step.cta}
              </Link>
            </div>
          );
        })}
      </div>

      <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
        {EMPTY_PREVIEWS.map((card) => (
          <div key={card.key} className="rounded-card border border-dashed border-line/70 p-4.5">
            <div className="mb-2.5 font-mono text-colhead text-faint uppercase">{card.tag}</div>
            <div className="font-serif text-title text-primary">{card.title}</div>
            <p className="mt-2 text-caption leading-relaxed text-muted text-pretty">{card.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-4.5 flex justify-center gap-2">
        <Link
          href="/"
          className="rounded-panel border border-line px-4.5 py-3 text-body text-muted transition-colors duration-fast ease-standard hover:border-line-strong hover:text-primary"
        >
          Skip for now
        </Link>
        <Link
          href="/"
          className="rounded-panel bg-gradient-to-br from-accent-light to-accent-dark px-5 py-3 text-body font-semibold text-canvas transition-shadow duration-base ease-standard hover:shadow-[0_0_24px_rgba(47,198,133,0.35)]"
        >
          Go to Base Camp
        </Link>
      </div>

      {allDone && (
        <div className="animate-menu-in mt-4.5 rounded-card border border-accent/40 bg-panel p-4.5 text-center">
          <div className="font-serif text-h3 text-primary">Trail marked</div>
          <p className="mx-auto mt-2 mb-4 max-w-[420px] text-body text-muted text-pretty">
            That&apos;s the whole walkthrough. Base Camp now has your portfolio, watchlist, and the assistant&apos;s
            first read.
          </p>
          <Link
            href="/"
            className="inline-block rounded-control bg-gradient-to-br from-accent-light to-accent-dark px-4.5 py-2.5 text-body font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_26px_rgba(47,198,133,0.35)]"
          >
            Go to Base Camp
          </Link>
        </div>
      )}
    </div>
  );
}
