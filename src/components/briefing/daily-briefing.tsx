"use client";

// The daily briefing at the top of Base Camp (feat/daily-briefing), built to
// the approved "Daily briefing" desktop and phone boards: headline, what
// changed (up to three cards), holdings at a glance, coming up, your mix, and
// the footer line. Every sentence comes from src/lib/daily-briefing.ts; this
// file only lays it out and formats money in the reader's currency.

import Link from "next/link";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { formatMoney } from "@/lib/display-prefs";
import { formatQuantity } from "@/lib/portfolio";
import type { Briefing, CardTag, GlanceRow } from "@/lib/daily-briefing";
import type { Level } from "@/lib/scorecard";
import { plainDate } from "@/lib/scorecard";
import { roughMoney } from "@/lib/exposure";

const H2 = "m-0 font-mono text-micro font-medium uppercase tracking-[0.16em] text-muted";

const TAG_STYLE: Record<CardTag, string> = {
  "Coming up": "bg-info/15 text-info",
  "Good news": "bg-accent/15 text-accent-light",
  "Unusual move": "bg-warning/15 text-warning",
  Changed: "bg-active text-primary/80",
};

const LEVEL_COLOR: Record<Level, string> = {
  strong: "var(--color-accent)",
  mixed: "var(--color-warning)",
  weak: "var(--color-negative)",
  not_applicable: "var(--color-line)",
};

function MiniBars({ level, label, valuation }: { level: Level; label: string; valuation?: boolean }) {
  if (level === "not_applicable") return <span className="text-caption text-dim">n/a</span>;
  const n = level === "strong" ? 3 : level === "mixed" ? 2 : 1;
  // "Expensive" is amber, not red: a high price is not a loss (see the scorecard).
  const color = valuation && level === "weak" ? "var(--color-warning)" : LEVEL_COLOR[level];
  return (
    <span className="flex items-center gap-[2px]" title={`${label}: ${level}`}>
      <span className="sr-only">
        {label}: {level}, {n} of 3
      </span>
      {[1, 2, 3].map((i) => (
        <span key={i} aria-hidden className="h-1.5 w-3.5 rounded-[2px]" style={{ background: i <= n ? color : "var(--color-line)" }} />
      ))}
    </span>
  );
}

function WeekChange({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-dim">-</span>;
  return (
    <span className={`font-mono tabular-nums ${pct >= 0 ? "text-accent-light" : "text-negative-light"}`}>
      {pct >= 0 ? "+" : "−"}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}


function unitFor(row: GlanceRow): string {
  return /^[A-Z]{2,6}$/.test(row.symbol) && row.quantity < 1 ? "" : row.quantity === 1 ? " share" : " shares";
}

export function DailyBriefing({ briefing, dateLabel }: { briefing: Briefing; dateLabel: string }) {
  const prefs = useDisplayPrefs();
  const money = (usd: number | null) => formatMoney(usd, prefs);
  const [first, ...restSentences] = briefing.headline.split(/(?<=\.)\s+/);
  const worth =
    briefing.valueUsd === null
      ? null
      : `Your portfolio is worth ${money(briefing.valueUsd)}${
          briefing.weekChangePct === null
            ? ""
            : `, ${briefing.weekChangePct >= 0 ? "up" : "down"} ${Math.abs(briefing.weekChangePct).toFixed(1)}% this week`
        }.`;

  return (
    <section aria-labelledby="briefing-headline" className="mb-9 flex flex-col gap-8">
      {/* Headline */}
      <div className="flex flex-col gap-3">
        <div className="font-mono text-micro uppercase tracking-[0.16em] text-muted">{dateLabel} · Your briefing</div>
        <h2 id="briefing-headline" className="m-0 max-w-[30ch] font-serif text-[32px] font-normal leading-[1.12] tracking-[-0.01em] text-primary md:text-[44px]">
          {first} {restSentences.length > 0 && <span className="text-accent-light">{restSentences.join(" ")}</span>}
        </h2>
        {(worth || briefing.biggestEvent) && (
          <p className="m-0 max-w-[70ch] text-[15px] leading-[1.55] text-primary/75 md:text-[17px]">
            {worth} {briefing.biggestEvent}
          </p>
        )}
      </div>

      {/* What changed */}
      {briefing.holdings.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className={H2}>What changed</h3>
          {briefing.cards.length === 0 ? (
            <div className="rounded-[14px] border border-line bg-panel px-5 py-5 text-body text-primary/80">{briefing.quietNote}</div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
              {briefing.cards.map((c) => (
                <article key={`${c.tag}-${c.symbol}`} className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-panel p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-caption text-primary">{c.symbol}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-micro ${TAG_STYLE[c.tag]}`}>{c.tag}</span>
                  </div>
                  <h4 className="m-0 font-serif text-[21px] font-normal leading-[1.25] text-primary">{c.title}</h4>
                  {c.body.map((line) => (
                    <p key={line} className="m-0 text-[14px] leading-[1.55] text-primary/70 text-pretty">
                      {line}
                    </p>
                  ))}
                  <Link href={c.href} className="mt-auto pt-1 text-[14px] text-accent-light hover:text-accent">
                    Open the full picture →
                  </Link>
                </article>
              ))}
            </div>
          )}
          {briefing.moreCount > 0 && (
            <p className="m-0 text-caption text-muted">
              {briefing.moreCount === 1 ? "One more change is" : `${briefing.moreCount} more changes are`} on each holding&apos;s page below.
            </p>
          )}
        </div>
      )}

      {/* Holdings at a glance */}
      {briefing.holdings.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className={H2}>Your holdings at a glance</h3>
            <span className="text-caption text-dim">Bars: 3 = strong · 2 = mixed · 1 = weak</span>
          </div>
          {/* Desktop and tablet: a table. */}
          <div className="hidden overflow-hidden rounded-[14px] border border-line bg-panel md:block">
            <table className="w-full border-collapse text-left text-[14px]">
              <caption className="sr-only">Each holding: value, this week&apos;s change, four scorecard bars and a plain line</caption>
              <thead>
                <tr className="border-b border-line-soft font-mono text-eyebrow uppercase text-dim">
                  <th scope="col" className="px-4 py-3 font-normal">Holding</th>
                  <th scope="col" className="px-3 py-3 text-right font-normal">Value</th>
                  <th scope="col" className="px-3 py-3 text-right font-normal">This week</th>
                  <th scope="col" className="px-2 py-3 font-normal">Price</th>
                  <th scope="col" className="px-2 py-3 font-normal">Growth</th>
                  <th scope="col" className="px-2 py-3 font-normal">Health</th>
                  <th scope="col" className="px-2 py-3 font-normal">Trend</th>
                  <th scope="col" className="hidden px-4 py-3 font-normal lg:table-cell">In plain words</th>
                </tr>
              </thead>
              <tbody>
                {briefing.holdings.map((h) => (
                  <tr key={h.symbol} className="border-b border-line-soft last:border-b-0 hover:bg-active">
                    <th scope="row" className="px-4 py-3.5 font-normal">
                      <Link href={h.href} className="text-primary hover:text-accent-light">
                        {h.name}
                      </Link>
                      <div className="font-mono text-micro text-dim">
                        {h.symbol} · {formatQuantity(h.quantity)}
                        {unitFor(h)}
                      </div>
                    </th>
                    <td className="px-3 py-3.5 text-right font-mono tabular-nums text-primary">{money(h.valueUsd)}</td>
                    <td className="px-3 py-3.5 text-right">
                      <WeekChange pct={h.weekChangePct} />
                    </td>
                    {h.bars.map((b) => (
                      <td key={b.key} className="px-2 py-3.5">
                        <MiniBars level={b.level} label={b.label} valuation={b.key === "valuation"} />
                      </td>
                    ))}
                    <td className="hidden px-4 py-3.5 text-[13px] leading-[1.5] text-primary/70 lg:table-cell">{h.line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phones: a stacked list. */}
          <ul className="m-0 list-none overflow-hidden rounded-[14px] border border-line bg-panel p-0 md:hidden">
            {briefing.holdings.map((h) => (
              <li key={h.symbol} className="border-b border-line-soft last:border-b-0">
                <Link href={h.href} className="flex flex-col gap-1.5 px-4.5 py-4 text-primary">
                  <span className="flex justify-between gap-3 text-[15px]">
                    <span className="font-medium">{h.name}</span>
                    <span>
                      {money(h.valueUsd)} <span className="text-[13px]"><WeekChange pct={h.weekChangePct} /></span>
                    </span>
                  </span>
                  <span className="flex gap-3">
                    {h.bars.map((b) => (
                      <MiniBars key={b.key} level={b.level} label={b.label} valuation={b.key === "valuation"} />
                    ))}
                  </span>
                  <span className="text-[13px] leading-[1.5] text-primary/70">{h.line}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Coming up + your mix */}
      {briefing.holdings.length > 0 && (
        <div className={`grid grid-cols-1 gap-8 ${briefing.mix ? "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" : ""}`}>
          <div className="flex flex-col gap-3">
            <h3 className={H2}>Coming up</h3>
            {briefing.comingUp.length === 0 ? (
              <p className="m-0 text-body text-muted">No earnings or dividend dates for your holdings in the next 30 days.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0 text-[14px] leading-[1.5]">
                {briefing.comingUp.map((e) => (
                  <li key={`${e.date}-${e.title}`} className="flex gap-4 border-b border-line-soft py-2.5 last:border-b-0">
                    <span className="w-[76px] shrink-0 font-mono text-caption text-muted">{plainDate(e.date)}</span>
                    <span className="text-primary">
                      <strong className="font-medium">{e.title}.</strong>{" "}
                      <span className="text-primary/70">
                        {e.detail}
                        {e.amountUsd !== null &&
                          ` About ${roughMoney(e.amountUsd * prefs.fxRate).toLocaleString(undefined, { style: "currency", currency: prefs.effectiveCurrency, maximumFractionDigits: 0 })} to you.`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {briefing.mix && (
            <div className="flex flex-col gap-3">
              <h3 className={H2}>Your mix</h3>
              <p className="m-0 font-serif text-[22px] leading-[1.3] text-primary">{briefing.mix.sentence}</p>
              <p className="m-0 text-[14px] leading-[1.55] text-primary/70">{briefing.mix.detail}</p>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-line" role="img" aria-label={briefing.mix.segments.map((s) => `${s.name} ${Math.round(s.share * 100)}%`).join(", ")}>
                {briefing.mix.segments.map((s, i) => (
                  <span
                    key={s.symbol}
                    className="h-full border-r border-canvas last:border-r-0"
                    style={{ width: `${s.share * 100}%`, background: i === 0 ? "var(--color-accent)" : i === 1 ? "var(--color-accent-dark)" : "var(--color-line-strong)" }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-micro text-muted">
                {briefing.mix.segments.slice(0, 5).map((s) => (
                  <span key={s.symbol}>
                    {s.name} {Math.round(s.share * 100)}%
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="m-0 border-t border-line-soft pt-5 text-[13px] leading-[1.6] text-muted">
        Cairn explains what the numbers say. Whether to buy, hold or sell is your call. Not investment advice.
      </p>
    </section>
  );
}
