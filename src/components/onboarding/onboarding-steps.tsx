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

// Stacking stone dots above the welcome heading — widths shrink top to bottom,
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
    <div>
      <div>
        <div

 />

        <div>
          {STONES.map((stone) => (
            <span
              key={stone.width}

 />
          ))}
        </div>

        <h1>
          Welcome to Cairn
        </h1>
        <p>
          Three steps and Base Camp fills in with your own numbers. Nothing here is a recommendation — Cairn shows
          sourced context and lets you draw the conclusion.
        </p>

        <div>
          <div>
            <div

 />
          </div>
          <div>
            {done.length} of {STEPS.length} complete
          </div>
        </div>
      </div>

      <div>
        {STEPS.map((step, index) => {
          const isDone = done.includes(step.key);
          return (
            <div
              key={step.key}

 >
              <div

 >
                {isDone ? "✓" : index + 1}
              </div>

              <div>
                <div>{step.label}</div>
                <p>{step.desc}</p>
              </div>

              <Link
                href={step.href}
                onClick={() => setDone((prev) => (prev.includes(step.key) ? prev : [...prev, step.key]))}

 >
                {isDone ? "Revisit" : step.cta}
              </Link>
            </div>
          );
        })}
      </div>

      <div>
        {EMPTY_PREVIEWS.map((card) => (
          <div key={card.key}>
            <div>{card.tag}</div>
            <div>{card.title}</div>
            <p>{card.desc}</p>
          </div>
        ))}
      </div>

      <div>
        <Link
          href="/"

 >
          Skip for now
        </Link>
        <Link
          href="/"

 >
          Go to Base Camp
        </Link>
      </div>

      {allDone && (
        <div>
          <div>Trail marked</div>
          <p>
            That&apos;s the whole walkthrough. Base Camp now has your portfolio, watchlist, and the assistant&apos;s
            first read.
          </p>
          <Link
            href="/"

 >
            Go to Base Camp
          </Link>
        </div>
      )}
    </div>
  );
}
