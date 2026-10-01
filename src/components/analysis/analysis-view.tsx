"use client";

// The one way an analysis is shown, wherever it appears: ticker page,
// Research, Assistant and the briefing (feat/analysis-display-v2,
// docs/decisions/2026-09-27-analysis-rebuild.md). Order, top to bottom:
//
//   1. In plain words        headline + bullets
//   2. What history says     "Higher 2 weeks later in 9 of 14 similar moments", dots, range, confidence
//   3. Scorecard             the seven tiles
//   4. What to watch         dated events and cited sources
//   5. What this means for you   only when the reader holds it, and only behind the exposure flag
/   6. Full breakdown        collapsed: what it does, sources, every case, company numbers, use of cash, trader indicators, how
//   7. Footer
//
// Everything here draws what the server already decided the reader may see
// (lib/analysis-display.ts): on Free, `cases`, `trader` and the company table
// are absent from the payload, not hidden. Colours are brand tokens only; red
// marks "lower" dots and weak business readings, nothing else.

import type { ReactNode } from "react";
import Link from "next/link";
import type { AnalysisDisplay } from "@/lib/analysis-display";
import type { Scorecard } from "@/lib/scorecard";
import { decodeEntities } from "@/lib/news";
import { AnalysisFooter, CAPITAL_DEFINITION, DimensionDetail, FullBreakdown, PlainWordsPanel, ScorecardGrid, useBreakdownState, type BreakdownRow } from "@/components/analysis/summary-sections";

const H2 = "m-0 font-mono text-micro font-medium uppercase tracking-[0.16em] text-muted";

export interface AnalysisSource {
  id: string;
  title: string;
  source_name: string;
  url: string | null;
  published_at: string;
}

export interface AnalysisViewProps {
  display: AnalysisDisplay;
  sources: AnalysisSource[];
  /** Free sees one case: the closest analog, already cut to one by the server. */
  closestCase?: { date: string; label: string; note: string | null } | null;
  /** Today's scorecard (ticker page); otherwise the one stored with the analysis. */
  scorecard?: Scorecard | null;
  /** "What this means for you" lines; null or empty hides the section. */
  forYou?: string[] | null;
  /** Premium company table (ticker page). Undefined: the row is not offered here. */
  companyNumbers?: ReactNode;
  /** "What it does" (ticker page, equities with a stored 10-K profile): the first breakdown row. */
  whatItDoes?: { oneLiner: string; content: ReactNode };
  /** Extra content per breakdown row (the ticker page adds its news list and key stats). */
  extras?: Partial<Record<"sources" | "cases" | "trader", ReactNode>>;
  /** Shown in "What history says" (the ticker page's request button when there is no analysis yet). */
  historyAction?: ReactNode;
  /** Rendered after section 1 (the ticker page's price chart). */
  afterSummary?: ReactNode;
  dense?: boolean;
  /** A breakdown row to start open ("cases", "trader"...), e.g. from a link. */
  openBreakdown?: string;
}

// ------------------------------------------------------------- history

function Dots({ dots, horizon }: { dots: ("higher" | "lower")[]; horizon: string }) {
  const higher = dots.filter((d) => d === "higher").length;
  const size = dots.length <= 21 ? "h-[18px] w-[18px]" : "h-3 w-3";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" role="img" aria-label={`${higher} of ${dots.length} ended higher, ${dots.length - higher} lower or unchanged`}>
        {dots.map((d, i) =>
          d === "higher" ? (
            <span key={i} className={`${size} rounded-full bg-accent`} />
          ) : (
            <span key={i} className={`${size} box-border rounded-full border-2 border-negative`} />
          ),
        )}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-muted">
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-accent" />
          Filled: higher {horizon} later ({higher})
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="box-border h-2.5 w-2.5 rounded-full border-2 border-negative" />
          Outlined: lower or unchanged ({dots.length - higher})
        </span>
      </div>
    </div>
  );
}

export function DirectionPanel({ display, onShowCases, dense, action }: { display: AnalysisDisplay; onShowCases?: () => void; dense?: boolean; action?: ReactNode }) {
  const h = display.history;
  const count = (h.kind === "direction" || h.kind === "baseline" || h.kind === "earnings") && h.n > 0 ? `${h.higher} of ${h.n}` : null;
  const [before, after] = count ? h.line.split(count) : [h.line, undefined];
  return (
    <section aria-label="What history says" className={`flex flex-col gap-4 rounded-[18px] border border-line bg-panel ${dense ? "p-4" : "px-5 py-6 md:px-9 md:py-8"}`}>
      <h2 className={H2}>What history says</h2>
      {h.basisLabel && <p className="m-0 -mt-2 font-mono text-eyebrow text-dim uppercase">{h.basisLabel}</p>}
      <p className={`m-0 font-serif leading-[1.3] text-primary text-pretty ${dense ? "text-[19px]" : "text-[22px] md:text-[26px]"}`}>
        {count && after !== undefined ? (
          <>
            {before}
            <span className="text-accent-light">{count}</span>
            {after}
          </>
        ) : (
          h.line
        )}
      </p>
      {h.dots.length > 0 && <Dots dots={h.dots} horizon={h.horizon} />}
      <div className="flex flex-col gap-1.5 text-[15px] leading-[1.6] text-primary/75">
        {h.range && <p className="m-0">{h.range}</p>}
        {h.extremes && <p className="m-0">{h.extremes}</p>}
        <p className="m-0">
          {h.confidenceText && <span className="text-primary">{h.confidenceText}</span>} {h.caveat}
        </p>
        {h.matchedOn.length > 0 && <p className="m-0 text-[13px] text-muted">Similar moments: {h.matchedOn.join("; ")}.</p>}
      </div>
      {display.history.kind === "none" && action}
      {onShowCases && display.caseCount > 0 && (
        <button type="button" onClick={onShowCases} className="min-h-11 self-start text-[14px] text-accent-light hover:text-accent">
          See the {display.caseCount} cases and what happened →
        </button>
      )}
    </section>
  );
}

// ----------------------------------------------------------------- watch

export function WatchPanel({ display, dense }: { display: AnalysisDisplay; dense?: boolean }) {
  return (
    <section aria-label="What to watch" className={`flex flex-col gap-3 rounded-[18px] border border-line bg-panel ${dense ? "p-4" : "px-5 py-6 md:px-9 md:py-7"}`}>
      <h2 className={H2}>What to watch</h2>
      {display.watch.length === 0 ? (
        <p className="m-0 text-[15px] text-muted">Nothing dated in Cairn&apos;s calendar for {display.name}, and no sourced story to follow.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {display.watch.map((w) => (
            <li key={w.text} className="flex gap-3 text-[16px] leading-[1.5] text-primary/85">
              <span aria-hidden className="mt-0.5 font-mono text-[13px] text-info">
                {w.kind === "event" ? "◷" : "↗"}
              </span>
              {w.url ? (
                <a href={w.url} target="_blank" rel="noreferrer" className="tap text-pretty text-primary/85 underline decoration-line-strong underline-offset-2 hover:text-accent">
                  {decodeEntities(w.text)}
                </a>
              ) : (
                <span className="text-pretty">{decodeEntities(w.text)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------- for you

export function ForYouPanel({ lines }: { lines: string[] }) {
  return (
    <section aria-label="What this means for you" className="flex flex-col gap-3 rounded-[18px] border border-line bg-panel px-5 py-6 md:px-9 md:py-7">
      <h2 className={H2}>What this means for you</h2>
      {lines.map((l) => (
        <p key={l} className="m-0 text-[16px] leading-[1.65] text-primary/80 text-pretty">
          {l}
        </p>
      ))}
      <p className="m-0 text-[13px] leading-[1.6] text-muted">Figures about your own holdings are arithmetic, not advice. Whether to buy, hold or sell is your call.</p>
    </section>
  );
}

// ------------------------------------------------------------ breakdown

export function PremiumNote({ what }: { what: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-canvas px-4 py-3">
      <p className="m-0 text-caption text-muted text-pretty">{what}</p>
      <Link href="/billing" className="inline-flex min-h-11 items-center rounded-control border border-line px-3.5 text-caption text-primary hover:border-accent">
        See Premium
      </Link>
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;

function CasesRow({ display, closestCase }: { display: AnalysisDisplay; closestCase?: AnalysisViewProps["closestCase"] }) {
  if (display.cases) {
    if (display.cases.length === 0) return <p className="m-0 text-body text-muted">No cases were counted for this analysis.</p>;
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse text-left text-body">
          <thead>
            <tr className="text-caption text-muted">
              <th className="py-2 pr-4 font-normal">Similar moment</th>
              <th className="py-2 pr-4 font-normal">{display.history.horizon} later</th>
              <th className="py-2 font-normal">Change</th>
            </tr>
          </thead>
          <tbody>
            {display.cases.map((c) => (
              <tr key={c.date} className="border-t border-line-soft">
                <td className="py-2.5 pr-4 text-primary">{fmtDate(c.date)}</td>
                <td className="py-2.5 pr-4 text-muted">{c.dateAfter ? fmtDate(c.dateAfter) : "-"}</td>
                <td className={`py-2.5 font-mono tabular-nums ${c.movePct > 0 ? "text-accent-light" : c.movePct < 0 ? "text-negative" : "text-muted"}`}>
                  {c.movePct > 0 ? "▲ " : c.movePct < 0 ? "▼ " : ""}
                  {signed(c.movePct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {closestCase && (
        <p className="m-0 text-body text-primary/85">
          Closest match: {closestCase.label}
          {closestCase.note ? <span className="text-muted"> · {closestCase.note}</span> : null}
        </p>
      )}
      <PremiumNote what={`Premium shows all ${display.caseCount} cases, with their dates and what happened after each.`} />
    </div>
  );
}

function TraderRow({ display }: { display: AnalysisDisplay }) {
  const t = display.trader;
  if (!t) return <PremiumNote what="Premium shows the trader indicators: the chance of a 5%-or-bigger move either way, RSI, volatility and drawdown." />;
  return (
    <div className="flex flex-col gap-3.5 text-body text-primary/85">
      <p className="m-0">
        Chance of a move of {t.thresholdPct}% or more, either way, within {display.history.horizon}:{" "}
        <span className="font-mono tabular-nums text-primary">
          {t.bandLow}–{t.bandHigh}%
        </span>{" "}
        ({t.confidence} confidence, {t.sampleSize} past cases, 95% Wilson interval).
      </p>
      {t.readings.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-2.5">
          {t.readings.map((r) => (
            <div key={r.label} className="rounded-panel border border-line bg-canvas px-3.5 py-3">
              <div className="font-mono text-eyebrow text-dim uppercase">{r.label}</div>
              <div className="mt-1.5 font-mono text-lead tabular-nums text-primary">{r.value ?? "-"}</div>
              {(r.percentile !== null || r.stateLabel) && (
                <div className="mt-1 text-caption text-muted text-pretty">
                  {r.percentile !== null ? `${r.percentile}th percentile of its own history` : ""}
                  {r.percentile !== null && r.stateLabel ? " · " : ""}
                  {r.stateLabel ?? ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DataSourcesList({ display }: { display: AnalysisDisplay }) {
  if (display.dataSources.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-eyebrow text-dim uppercase">Data the figures come from</div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {display.dataSources.map((d) => (
          <li key={`${d.kind}:${d.reference}`} className="text-body leading-[1.5]">
            {d.url ? (
              <a href={d.url} target="_blank" rel="noreferrer" className="tap text-primary hover:text-accent">
                {d.label}
              </a>
            ) : (
              <span className="text-primary">{d.label}</span>
            )}
            {d.kind === "sec_filing" && <span className="text-caption text-dim"> · accession {d.reference}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourcesRow({ sources, used, display }: { sources: AnalysisSource[]; used: Set<string>; display: AnalysisDisplay }) {
  if (sources.length === 0)
    return (
      <div className="flex flex-col gap-4">
        <p className="m-0 text-body text-muted">{display.noNews ?? "No news sources were cited."}</p>
        <DataSourcesList display={display} />
      </div>
    );
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {sources.map((s) => (
        <li key={s.id} className="text-body leading-[1.5]">
          {s.url ? (
            <a href={s.url} target="_blank" rel="noreferrer" className="tap text-primary hover:text-accent">
              {decodeEntities(s.title)}
            </a>
          ) : (
            <span className="text-primary">{decodeEntities(s.title)}</span>
          )}
          <span className="text-caption text-dim">
            {" "}
            · {s.source_name.replace(/\s*\(RSS\)\s*$/i, "")} · {fmtDate(s.published_at)}
            {used.has(s.id) ? " · used in the summary" : ""}
          </span>
        </li>
      ))}
      {display.dataSources.length > 0 && (
        <li className="list-none pt-2">
          <DataSourcesList display={display} />
        </li>
      )}
    </ul>
  );
}

function HowRow({ display }: { display: AnalysisDisplay }) {
  const words =
    display.textSource === "model"
      ? "An AI model wrote the summary and the things to watch around the figures above. Before it was stored, code checked that every number in it is one of those figures, that it gives no advice and predicts nothing as fact, that any finance term is explained, and that each thing to watch names a date or a source."
      : display.textSource === "template"
        ? "The summary is in Cairn's own words, built in code from the scorecard and history sentences, because the AI draft did not pass every check (or no AI model was reachable). Nothing unchecked is ever stored."
        : "This analysis was made before the current format. Its summary was written under the checks in place at the time.";
  return (
    <div className="flex max-w-[76ch] flex-col gap-3 text-body leading-[1.65] text-primary/80">
      <p className="m-0">
        <strong className="font-medium text-primary">What history says.</strong> Cairn scans this symbol&apos;s own daily prices for past
        days in the same state as today (and, where it leaves at least 5 cases, with results due or not and the same price trend), then counts
        how often the price was higher {display.history.horizon} later. The typical range is the middle half of those moves (25th to 75th
        percentile). Confidence is low under 5 cases and never high when the 95% Wilson interval on the up-rate is wide. Windows derived from
        volatility alone are not counted. When nothing about the price is unusual that day, or today matches too few past moments to measure, Cairn says so and shows a fallback instead, labelled above the line: for a share with results due within {display.history.horizon}, its past results releases measured from the same point before; otherwise the base rate, every {display.history.horizon} stretch in the stored prices. It describes the past; it is not a forecast.
      </p>
      <p className="m-0">
        <strong className="font-medium text-primary">Scorecard.</strong> Each tile is computed in code from SEC filings and stored prices,
        using fixed, published thresholds. Coins and funds have no company filings, so their company tiles say &quot;not applicable&quot;, never zero.
      </p>
      <p className="m-0">
        <strong className="font-medium text-primary">The words.</strong> {words}
      </p>
    </div>
  );
}

// ----------------------------------------------------------------- view

export function AnalysisView({ display, sources, closestCase, scorecard, forYou, companyNumbers, whatItDoes, extras = {}, historyAction, afterSummary, dense = false, openBreakdown }: AnalysisViewProps) {
  const breakdown = useBreakdownState(openBreakdown ?? null);
  const card = scorecard === undefined ? display.scorecard : scorecard;
  const used = new Set(display.sourcesUsed);
  // Scorecards stored before the dimension existed have no "capital" entry: no row.
  const capital = card?.dimensions.find((d) => d.key === "capital");
  const written = new Date(display.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const meta =
    display.textSource === "model"
      ? `Written ${written} around figures computed in code. Every number is checked against them.`
      : display.textSource === "template"
        ? `Written ${written} in Cairn's own words, from figures computed in code.`
        : `Written ${written}, before the current format.`;

  const rows: BreakdownRow[] = [
    ...(whatItDoes ? [{ id: "business", title: "What it does", detail: whatItDoes.oneLiner, content: whatItDoes.content }] : []),
    {
      id: "sources",
      title: "Sources",
      detail: [
        sources.length > 0 || display.dataSources.length === 0 ? `${sources.length} article${sources.length === 1 ? "" : "s"}` : "no recent news",
        display.dataSources.length > 0 ? `${display.dataSources.length} data source${display.dataSources.length === 1 ? "" : "s"}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      content: (
        <div className="flex flex-col gap-4">
          <SourcesRow sources={sources} used={used} display={display} />
          {extras.sources}
        </div>
      ),
    },
    {
      id: "cases",
      title: display.caseCount > 0 ? `All ${display.caseCount} historical cases` : "Historical cases",
      detail: display.plan === "premium" ? "dates and what happened" : "Premium",
      content: (
        <div className="flex flex-col gap-4">
          <CasesRow display={display} closestCase={closestCase} />
          {extras.cases}
        </div>
      ),
    },
    ...(companyNumbers !== undefined
      ? [{ id: "company", title: "Company numbers", detail: display.plan === "premium" ? "sales, EBITDA, cash flow, debt" : "Premium", content: companyNumbers }]
      : []),
    ...(capital && capital.inputs.length > 0
      ? [{ id: "capital", title: "Use of cash", detail: capital.verdict, content: <DimensionDetail d={capital} definition={CAPITAL_DEFINITION} /> }]
      : []),
    {
      id: "trader",
      title: "Trader indicators",
      detail: display.plan === "premium" ? "move probability, RSI, volatility, drawdown" : "Premium",
      content: (
        <div className="flex flex-col gap-4">
          <TraderRow display={display} />
          {extras.trader}
        </div>
      ),
    },
    { id: "how", title: "How this was calculated", content: <HowRow display={display} /> },
  ];

  return (
    <div className={`flex min-w-0 flex-col ${dense ? "gap-4" : "gap-7 md:gap-9"}`} data-analysis-view={display.id}>
      <PlainWordsPanel headline={display.headline} bullets={display.bullets} meta={meta} forYou={null} />
      {afterSummary}
      <DirectionPanel display={display} dense={dense} action={historyAction} onShowCases={() => breakdown.openAndScroll("cases")} />
      {card ? (
        <ScorecardGrid scorecard={card} />
      ) : (
        <p className="m-0 text-caption text-dim">No scorecard was stored with this analysis.</p>
      )}
      <WatchPanel display={display} dense={dense} />
      {forYou && forYou.length > 0 && <ForYouPanel lines={forYou} />}
      <FullBreakdown openId={breakdown.openId} onToggle={breakdown.toggle} rows={rows} />
      <AnalysisFooter />
    </div>
  );
}
