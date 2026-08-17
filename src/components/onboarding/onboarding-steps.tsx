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
    desc: "Quantity and entry price — Cairn works out value, gain, and news relevance from there.",
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

export function OnboardingSteps() {
  // Progress is intentionally in-memory only: there's no schema column for it,
  // and a walkthrough is cheap to re-run. Marking a step done is a nudge for
  // this visit, not persisted state.
  const [done, setDone] = useState<string[]>([]);

  const pct = Math.round((done.length / STEPS.length) * 100);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-line bg-panel p-4.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">Progress</span>
          <span className="font-mono text-[11px] tabular-nums text-muted">
            {done.length} of {STEPS.length} · {pct}%
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-active">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-light to-accent-dark transition-[width] duration-base ease-standard"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {STEPS.map((step, index) => {
          const isDone = done.includes(step.key);
          return (
            <div
              key={step.key}
              className={`animate-rise-in flex flex-wrap items-center gap-4 rounded-card border bg-panel p-4.5 transition-colors duration-base ease-standard ${
                isDone ? "border-accent/40" : "border-line"
              }`}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold ${
                  isDone ? "bg-gradient-to-br from-accent-light to-accent-dark text-canvas" : "bg-active text-muted"
                }`}
              >
                {isDone ? "✓" : index + 1}
              </div>

              <div className="min-w-[200px] flex-1">
                <div className="text-[14px] text-primary">{step.label}</div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted text-pretty">{step.desc}</p>
              </div>

              <Link
                href={step.href}
                onClick={() => setDone((prev) => (prev.includes(step.key) ? prev : [...prev, step.key]))}
                className={`shrink-0 rounded-lg px-4 py-2.25 text-[12.5px] font-semibold transition-[box-shadow,transform,color] duration-base ease-standard ${
                  isDone
                    ? "border border-line text-muted hover:text-primary"
                    : "bg-gradient-to-br from-accent-light to-accent-dark text-canvas hover:-translate-y-px hover:shadow-[0_0_24px_rgba(47,198,133,0.35)]"
                }`}
              >
                {isDone ? "Revisit" : step.cta}
              </Link>
            </div>
          );
        })}
      </div>

      {done.length === STEPS.length && (
        <div className="animate-menu-in rounded-card border border-accent/40 bg-panel p-4.5 text-center">
          <div className="font-serif text-[20px] text-primary">Trail marked</div>
          <p className="mx-auto mt-2 mb-4 max-w-[420px] text-[13px] text-muted text-pretty">
            That&apos;s the whole walkthrough. Base Camp now has your portfolio, watchlist, and the assistant&apos;s
            first read.
          </p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-gradient-to-br from-accent-light to-accent-dark px-4.5 py-2.5 text-[13px] font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_26px_rgba(47,198,133,0.35)]"
          >
            Go to Base Camp
          </Link>
        </div>
      )}
    </div>
  );
}
