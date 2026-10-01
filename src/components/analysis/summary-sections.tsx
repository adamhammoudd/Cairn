"use client";

// The top of the ticker analysis (feat/analysis-summary-layout), built to the
// approved "Ticker analysis - summary + scorecard" board: In plain words (+
// What this means for you), the six-tile scorecard, What history says, the
// collapsed Full breakdown, and the footer line. Colours come from the tokens
// in globals.css; red appears only for "weak" business readings and for
// "lower" in the history dots, never as decoration.

import { useId, useState, type ReactNode } from "react";
import type { Dimension, Level, PeerComparison, Scorecard } from "@/lib/scorecard";
import { barSegments, hasUpcomingEvent } from "@/lib/scorecard";
import type { HistoryPlain } from "@/lib/ai/history-plain";

const H2 = "m-0 font-mono text-micro font-medium uppercase tracking-[0.16em] text-muted";

// ------------------------------------------------------------ in plain words

export function PlainWordsPanel({
  headline,
  bullets,
  meta,
  forYou,
}: {
  headline: string;
  bullets: string[];
  /** Where the words came from and when. */
  meta: string;
  /** "What this means for you" lines; null hides the column. */
  forYou: string[] | null;
}) {
  return (
    <section
      aria-labelledby="plain-words-heading"
      className={`animate-rise-in grid gap-8 rounded-[18px] border border-line bg-panel px-5 py-6 md:px-9 md:py-8 ${
        forYou ? "min-[900px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] min-[900px]:gap-11" : ""
      }`}
    >
      <div className="flex flex-col gap-4.5">
        <h2 id="plain-words-heading" className={H2}>
          In plain words
        </h2>
        <p className="m-0 font-serif text-[24px] leading-[1.3] tracking-[-0.3px] text-primary text-pretty md:text-[30px]">{headline}</p>
        {bullets.length > 0 && (
          <ul className="m-0 mt-1 flex list-none flex-col gap-3 p-0 text-[16px] leading-[1.55] text-primary/80">
            {bullets.map((b) => (
              <li key={b} className="flex gap-3">
                <span aria-hidden className="text-accent">
                  –
                </span>
                <span className="text-pretty">{b}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="m-0 text-caption text-dim">{meta}</p>
      </div>
      {forYou && (
        <div className="flex flex-col gap-3.5 border-t border-line-soft pt-6 min-[900px]:border-l min-[900px]:border-t-0 min-[900px]:pl-10 min-[900px]:pt-0">
          <h2 className={H2}>What this means for you</h2>
          {forYou.map((l) => (
            <p key={l} className="m-0 text-[16px] leading-[1.65] text-primary/80 text-pretty">
              {l}
            </p>
          ))}
          <p className="m-0 mt-2 text-[13px] leading-[1.6] text-muted">
            Figures about your own holdings are arithmetic, not advice. Whether to buy, hold or sell is your call.
          </p>
        </div>
      )}
    </section>
  );
}

// ----------------------------------------------------------------- scorecard

/**
 * Bar colour. Green for strong, amber for mixed. Weak is red where the numbers
 * describe a weakening business (shrinking, stretched, at risk, falling), but
 * amber for "Expensive": a high price is not a loss or a deterioration.
 */
function barColor(d: Dimension): string {
  if (d.level === "strong") return "var(--color-accent)";
  if (d.level === "mixed") return "var(--color-warning)";
  if (d.level === "weak") return d.key === "valuation" ? "var(--color-warning)" : "var(--color-negative)";
  return "var(--color-line)";
}

const LEVEL_WORDS: Record<Level, string> = { strong: "strong", mixed: "mixed", weak: "weak", not_applicable: "not rated" };

function Bars({ d }: { d: Dimension }) {
  const n = barSegments(d.level);
  return (
    <span className="flex items-center gap-[3px]">
      <span className="sr-only">
        {LEVEL_WORDS[d.level]}, {n} of 3
      </span>
      {[1, 2, 3].map((i) => (
        <span key={i} aria-hidden className="h-2 w-[22px] rounded-[2px]" style={{ background: i <= n ? barColor(d) : "var(--color-line)" }} />
      ))}
    </span>
  );
}

function Tile({ d }: { d: Dimension }) {
  const isEvent = d.key === "next_event";
  const upcoming = hasUpcomingEvent(d);
  const days = d.inputs.find((i) => i.label === "Days until the event")?.value;
  return (
    <div
      className={`flex flex-col gap-2.5 rounded-[14px] border bg-panel px-6 py-5.5 ${upcoming ? "border-info/40" : "border-line"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] text-muted">{d.label}</span>
        {isEvent ? (
          upcoming && typeof days === "number" ? (
            <span className="rounded-full bg-info/15 px-2.5 py-0.5 text-[12px] text-info">
              {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`}
            </span>
          ) : null
        ) : d.level === "not_applicable" ? (
          <span className="text-[12px] text-muted">{d.verdict === "Tiny" ? "Not a factor" : "Not rated"}</span>
        ) : (
          <Bars d={d} />
        )}
      </div>
      <div className="font-serif text-[24px] leading-tight text-primary md:text-[26px]">
        {isEvent && upcoming ? d.sentence.split(".")[0] : d.verdict}
      </div>
      <p className="m-0 text-[14px] leading-[1.55] text-primary/70 text-pretty">
        {isEvent && upcoming ? d.sentence.split(". ").slice(1).join(". ") || d.verdict : d.sentence}
      </p>
      {d.peers && <PeerRow p={d.peers} />}
    </div>
  );
}

/**
 * "vs similar companies" under price vs profit (feat/peer-comparison): the
 * company's price ÷ profit next to the medians, with how many companies fed
 * each, and the measured differences as plain facts - never a reason.
 */
export function PeerRow({ p }: { p: PeerComparison }) {
  return (
    <div className="mt-1 flex flex-col gap-1.5 border-t border-line-soft pt-3 text-[13px] leading-[1.5]">
      <span className="text-muted">vs similar companies · price ÷ yearly profit</span>
      <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5">
        <dt className="text-primary/70">This company</dt>
        <dd className="m-0 tabular-nums text-primary">{p.pe}</dd>
        {p.sector && (
          <>
            <dt className="text-primary/70">
              Similar companies, median ({p.sector.peers} in {p.sector.name})
            </dt>
            <dd className="m-0 tabular-nums text-primary">{p.sector.median}</dd>
          </>
        )}
        {p.market && (
          <>
            <dt className="text-primary/70">All {p.market.companies} companies Cairn tracks, median</dt>
            <dd className="m-0 tabular-nums text-primary">{p.market.median}</dd>
          </>
        )}
      </dl>
      {p.differences.length > 0 && (
        <>
          <span className="mt-1 text-muted">Measured differences (this company vs the median of similar companies)</span>
          <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5">
            {p.differences.map((x) => (
              <div key={x.label} className="contents">
                <dt className="text-primary/70">{x.label}</dt>
                <dd className="m-0 tabular-nums text-primary">
                  {x.company} vs {x.peers}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}

export function ScorecardGrid({ scorecard }: { scorecard: Scorecard }) {
  return (
    <section aria-labelledby="scorecard-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="scorecard-heading" className={H2}>
          Scorecard
        </h2>
        <span className="text-caption text-dim">Bars: 3 = strong · 2 = mixed · 1 = weak</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {scorecard.dimensions.map((d) => (
          <Tile key={d.key} d={d} />
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------- history

export function HistoryPanel({ history, onShowCases, empty }: { history: HistoryPlain | null; onShowCases?: () => void; empty: ReactNode }) {
  if (!history || history.status === "too_few") {
    return (
      <section aria-labelledby="history-heading" className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-panel px-5 py-6 md:px-9 md:py-8">
        <h2 id="history-heading" className={H2}>
          What history says
        </h2>
        {history ? <p className="m-0 font-serif text-[22px] leading-[1.35] text-primary text-pretty">{history.headline}</p> : empty}
      </section>
    );
  }
  const higherWord = `${history.higher} times`;
  const [before, after] = history.headline.split(higherWord);
  return (
    <section
      aria-labelledby="history-heading"
      className="grid items-center gap-8 rounded-[18px] border border-line bg-panel px-5 py-6 md:px-9 md:py-8 min-[900px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] min-[900px]:gap-11"
    >
      <div className="flex flex-col gap-3.5">
        <h2 id="history-heading" className={H2}>
          What history says
        </h2>
        <p className="m-0 font-serif text-[22px] leading-[1.35] text-primary text-pretty md:text-[26px]">
          {after !== undefined ? (
            <>
              {before}
              <span className="text-accent-light">{higherWord}</span>
              {after}
            </>
          ) : (
            history.headline
          )}
        </p>
        <p className="m-0 text-[15px] leading-[1.6] text-primary/70">
          {history.rangeSentence} {history.confidenceSentence}
        </p>
        {onShowCases && (
          <button type="button" onClick={onShowCases} className="self-start text-[14px] text-accent-light hover:text-accent">
            See all {history.n} cases and what happened →
          </button>
        )}
      </div>
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-7 gap-2.5" role="img" aria-label={`${history.higher} of ${history.n} cases ended higher, ${history.notHigher} lower or unchanged`}>
          {history.dots.map((d, i) =>
            d === "higher" ? (
              <span key={i} className="aspect-square rounded-full bg-accent" />
            ) : (
              <span key={i} className="box-border aspect-square rounded-full border-2 border-negative" />
            ),
          )}
        </div>
        <div className="flex flex-wrap gap-5.5 text-[13px] text-muted">
          <span className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-accent" />
            Higher after {history.horizon} ({history.higher})
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden className="box-border h-2.5 w-2.5 rounded-full border-2 border-negative" />
            Lower or unchanged ({history.notHigher})
          </span>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------ full breakdown

export interface BreakdownRow {
  id: string;
  title: string;
  detail?: string;
  content: ReactNode;
}

export function FullBreakdown({ rows, openId, onToggle }: { rows: BreakdownRow[]; openId: string | null; onToggle: (id: string) => void }) {
  const base = useId();
  return (
    <section aria-labelledby={`${base}-h`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${base}-h`} className={H2}>
          Full breakdown
        </h2>
        <span className="text-[13px] text-muted">For anyone who wants the detail. Every number above can be traced here.</span>
      </div>
      <div className="overflow-hidden rounded-[14px] border border-line bg-panel">
        {rows.map((r, i) => {
          const open = openId === r.id;
          const panelId = `${base}-${r.id}`;
          return (
            <div key={r.id} id={`breakdown-${r.id}`} className={i < rows.length - 1 ? "border-b border-line-soft" : ""}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => onToggle(r.id)}
                className="flex w-full items-center justify-between gap-4 bg-transparent px-5 py-5 text-left text-[16px] text-primary transition-colors duration-base ease-standard hover:bg-active md:px-6.5"
              >
                <span>
                  {r.title}
                  {r.detail && <span className="text-[14px] text-muted"> · {r.detail}</span>}
                </span>
                <span aria-hidden className="text-muted">
                  {open ? "−" : "+"}
                </span>
              </button>
              {open && (
                <div id={panelId} className="border-t border-line-soft px-4 py-5 md:px-6.5">
                  {r.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function AnalysisFooter() {
  return (
    <footer className="max-w-[900px] border-t border-line-soft pt-5.5 text-[13px] leading-[1.6] text-muted">
      Cairn explains what the numbers say. Whether to buy, hold or sell is your call. Not investment advice.
    </footer>
  );
}

export function useBreakdownState(initial: string | null = null) {
  const [openId, setOpenId] = useState<string | null>(initial);
  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));
  const openAndScroll = (id: string) => {
    setOpenId(id);
    requestAnimationFrame(() => document.getElementById(`breakdown-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  return { openId, toggle, openAndScroll };
}
