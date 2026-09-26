"use client";

import Link from "next/link";
import { DailyBriefing } from "@/components/briefing/daily-briefing";
import type { Briefing } from "@/lib/daily-briefing";
import { getMarketStatus } from "@/lib/market-hours";
import { useLiveRefresh } from "@/components/use-live-refresh";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { formatMoney } from "@/lib/display-prefs";
import { DashboardSummaryCard, type ModuleTint } from "@/components/dashboard/dashboard-summary-card";
import { decodeEntities } from "@/lib/news";
import { TimeAgo } from "@/components/time-ago";
import type { ModuleKey } from "@/lib/dashboard-modules";
import { DataFreshness } from "@/components/data-freshness";
import { TickerStrip, type TickerStripItem } from "@/components/dashboard/ticker-strip";
import { Disclosure } from "@/components/compliance/disclosure";
import { usePageTone } from "@/components/layout/page-tone";
import {
  PortfolioValueChart,
  type ValueSeries,
  type ValueTimeframe,
} from "@/components/dashboard/portfolio-value-chart";

interface DashboardHomeProps {
  today: string;
  /** "What changed for what you own" (feat/daily-briefing); leads the page. */
  briefing?: Briefing | null;
  /** Long date for the briefing's eyebrow. */
  briefingDate?: string;
  /** From user_settings.refresh_rate_seconds - written by the settings form and, until now, read by nothing. */
  refreshRateSeconds?: number;
  /** Date of the newest close behind every price on this page. */
  dataAsOf?: string | null;
  /** Symbols for the moving strip under the header. */
  tickerItems: TickerStripItem[];
  portfolio: {
    /** Raw USD - formatted here through the shared display-prefs formatter. */
    totalValue: number;
    totalGain: number;
    totalGainPct: number;
    positive: boolean;
    positions: number;
    /**
     * One series per selectable range for the hero chart. Ranges with fewer
     * than two stored closes are omitted rather than sent empty, so the chart
     * only offers a button it can actually draw.
     */
    series: Partial<Record<ValueTimeframe, ValueSeries>>;
    /** Which range the chart opens on. */
    defaultTimeframe: ValueTimeframe;
    topHoldings: { symbol: string; gainPct: number }[];
  };
  markets: {
    trackedSymbols: number;
    top: { symbol: string; price: number; changePct: number }[];
  };
  watchlist: {
    lists: number;
    symbols: number;
    alertsPastThreshold: number;
    topMovers: { symbol: string; pct: number }[];
  };
  news: {
    articles: number;
    items: { title: string; source: string; publishedAt: string; tint: "accent" | "violet" | "warning" }[];
  };
  assistant: {
    sessions: number;
    latestAnalysis: {
      quote: string;
      sourceCount: number;
      sampleSize: number;
      confidenceLevel: string;
      scopeType: string;
      scopeValue: string;
      analysisType: string;
      /** "Higher 2 weeks later in 9 of 14 similar moments." - never a probability. */
      historyLine: string;
      createdAt: string;
      /** Highest-weighted headline the analysis was built from, if any. */
      topSource: { title: string; source: string; publishedAt: string } | null;
    } | null;
  };
}

// A headline's rule says how it reaches you: a symbol you hold, one you watch,
// or neither. That was encoded in colour alone, with no legend anywhere on the
// card - unreadable to anyone who cannot separate the three hues, and to
// everyone else too, since nothing said what they meant. The label travels with
// the colour now: announced to assistive tech, and shown on hover/focus.
const NEWS_TINT: Record<"accent" | "violet" | "warning", { className: string; label: string }> = {
  accent: { className: "bg-accent", label: "Mentions a holding" },
  violet: { className: "bg-violet", label: "Mentions a watchlist symbol" },
  warning: { className: "bg-warning", label: "General market news" },
};

const MODULES: { key: ModuleKey; label: string; href: string; cta: string; tint?: ModuleTint }[] = [
  { key: "portfolio", label: "Portfolio", href: "/portfolio", cta: "Open holdings" },
  { key: "markets", label: "Markets", href: "/markets", cta: "Browse", tint: "info" },
  { key: "watchlist", label: "Watchlist", href: "/watchlists", cta: "Open", tint: "violet" },
  { key: "news", label: "News", href: "/news", cta: "Read all", tint: "warning" },
  { key: "assistant", label: "AI Assistant", href: "/assistant", cta: "Open assistant", tint: "accent" },
];

/**
 * Modules that sit in the right rail beside the assistant band, in this order.
 * `news` is deliberately not among them: it is a three-across band under the
 * fold, because headlines are the one thing here read by scanning sideways.
 */
const RAIL_MODULES: ModuleKey[] = ["markets", "watchlist"];

const LAYOUT: ModuleKey[] = ["portfolio", "markets", "watchlist", "news", "assistant"];

/** Splits stored reasoning_text into its real paragraphs (it already comes
 * this way from the model, \n\n-separated - see lib/ai/generate.ts's
 * PROSE_SCHEMA) instead of letting HTML collapse them into one flowed block. */
function quoteParagraphs(quote: string): string[] {
  return quote
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Bolds the first sentence of a paragraph as a scannable lead line - same
 * text, no rewording, just emphasis on how much of the card a skim reads. */
function QuoteLead({ text }: { text: string }) {
  const match = /^(.*?[.!?])(\s+|$)/.exec(text);
  if (!match) return <>{text}</>;
  const [, lead] = match;
  return (
    <>
      <strong className="font-semibold">{lead}</strong>
      {text.slice(lead.length)}
    </>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function DashboardHome({
  today,
  briefing = null,
  briefingDate = "",
  tickerItems,
  portfolio,
  markets,
  watchlist,
  news,
  assistant,
  refreshRateSeconds = 30,
  dataAsOf = null,
}: DashboardHomeProps) {
  // Was `useState(true)` wired to nothing, next to prices that never changed.
  // Now reflects a timer that actually runs - and only runs when refreshing
  // would tell the user something new.
  const marketStatus = getMarketStatus();
  const { active: live, paused, setPaused } = useLiveRefresh(refreshRateSeconds, marketStatus.isOpen);
  // Settings > Display: currency and percent-vs-dollar, the same source every
  // other price surface reads.
  const prefs = useDisplayPrefs();
  // Reported by the value chart below; see layout/page-tone.tsx.
  const chartTone = usePageTone();

  const moduleMap = new Map(MODULES.map((m) => [m.key, m]));

  function renderCard(key: ModuleKey, index: number) {
    // Named `module` previously, which shadows the CommonJS binding and is a
    // hard @next/next/no-assign-module-variable error.
    const card = moduleMap.get(key);
    if (!card) return null;
    const delay = index * 40;

    switch (key) {
      case "markets":
        return (
          <DashboardSummaryCard key={key} title={card.label} href={card.href} ctaLabel={card.cta} tint={card.tint} delay={delay}>
            <div className="flex flex-col">
              {markets.top.map((r) => (
                <Link
                  key={r.symbol}
                  href={`/ticker/${encodeURIComponent(r.symbol)}`}
                  className="tap -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-[9px] transition-colors duration-fast ease-standard hover:bg-[#151515]"
                >
                  <span className="text-body text-primary">{r.symbol}</span>
                  <span className="ml-auto font-mono text-body tabular-nums text-muted">
                    {formatMoney(r.price, prefs)}
                  </span>
                  {/* Percent, not the absolute delta the display preference
                      would otherwise pick. On a summary card the move is the
                      scannable figure, and for the sub-cent assets that fill
                      this list the absolute change is unreadable noise
                      (+EUR 0.00000015). The full board on /markets still
                      honours the preference. */}
                  <span className={`min-w-[62px] text-right font-mono text-caption tabular-nums ${r.changePct >= 0 ? "text-accent" : "text-negative"}`}>
                    {r.changePct >= 0 ? "+" : ""}
                    {r.changePct.toFixed(2)}%
                  </span>
                </Link>
              ))}
            </div>
          </DashboardSummaryCard>
        );
      case "watchlist":
        return (
          <DashboardSummaryCard key={key} title={card.label} href={card.href} ctaLabel={card.cta} tint={card.tint} delay={delay}>
            {/* With no lists, this card read "0 lists · 0 symbols · none past
                an alert threshold" over a band of empty space - a count of
                nothing, three times, and no way to act on it. It is also the
                first card a new account sees. An empty state gets one sentence
                saying what the feature is for and one control that starts it. */}
            {watchlist.lists === 0 ? (
              <div>
                <p className="text-body text-muted text-pretty">
                  Track symbols you don&rsquo;t own yet, and get told when one crosses a price
                  or percentage you care about.
                </p>
                {/* A dashed, full-width control rather than a solid button:
                    it reads as a slot waiting to be filled, which is what an
                    empty watchlist is, and it does not compete with the one
                    real CTA on the page. */}
                <Link
                  href="/watchlists/new"
                  className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-line px-3 py-2.5 text-body text-muted transition-colors duration-fast ease-standard hover:border-violet hover:text-primary"
                >
                  + Add your first symbol
                </Link>
              </div>
            ) : (
              <>
            <div className="mb-3 text-body text-muted">
              {watchlist.lists} lists · {watchlist.symbols} symbols ·{" "}
              {watchlist.alertsPastThreshold > 0 ? `${watchlist.alertsPastThreshold} past an alert threshold` : "none past an alert threshold"}
            </div>
            <div className="flex flex-wrap gap-2">
              {watchlist.topMovers.map((m) => (
                <span key={m.symbol} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-caption">
                  <span className="text-primary">{m.symbol}</span>
                  <span className={`font-mono tabular-nums ${m.pct >= 0 ? "text-accent" : "text-negative"}`}>
                    {m.pct >= 0 ? "+" : ""}
                    {m.pct.toFixed(1)}%
                  </span>
                </span>
              ))}
            </div>
              </>
            )}
          </DashboardSummaryCard>
        );
      case "news":
        return (
          // A full-width band of three, not a column of three in a quarter of
          // the page. Headlines are the one thing here that is read by
          // scanning sideways, and at a third of the width each one gets a
          // measure that fits a real headline without wrapping four times.
          <DashboardSummaryCard
            key={key}
            title={card.label}
            href={card.href}
            ctaLabel={card.cta}
            tint={card.tint}
            delay={delay}
            className="w-full"
          >
            {news.items.length === 0 ? (
              <div className="text-body text-muted">No headlines yet</div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {news.items.map((item, i) => (
                  <Link
                    key={i}
                    href="/news"
                    className="flex gap-[11px] rounded-xl border border-[#1e1e1e] bg-[#101010] p-[13px] transition-[transform,border-color] duration-fast ease-standard hover:-translate-y-0.5 hover:border-line-strong"
                  >
                    <span
                      className={`w-[3px] shrink-0 rounded-xs ${NEWS_TINT[item.tint].className}`}
                      title={NEWS_TINT[item.tint].label}
                    />
                    <div className="min-w-0">
                      <div className="text-[13px] leading-[1.45] text-primary">{decodeEntities(item.title)}</div>
                      <div className="mt-1.5 text-micro text-dim">
                        <span className="sr-only">{NEWS_TINT[item.tint].label} · </span>
                        {item.source} · <TimeAgo iso={item.publishedAt} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </DashboardSummaryCard>
        );
      default:
        return null;
    }
  }

  /**
   * Tier 1 - where you stand.
   *
   * Base Camp used to be five equal panels in a two-column grid, which is a
   * layout that says every one of these matters the same amount. They do not:
   * this is a portfolio tracker, and the first question anyone opens it with
   * is "where do I stand".
   *
   * It is a panel again now, but not one of five - it is the only thing in its
   * tier, it carries the page's one display-scale figure, and it is the only
   * surface here that gets the sheet radius. The chart beside it is the same
   * series the Portfolio page plots, now at a size worth reading and with its
   * own range control rather than pinned to one month with no way to ask for
   * another.
   */
  function renderStanding() {
    const gainTone = portfolio.positive ? "text-accent" : "text-negative";
    return (
      <section
        className="animate-rise-in relative overflow-hidden rounded-2xl border border-[#232323] px-[26px] py-6"
        style={{ background: "linear-gradient(180deg,#101110,#0d0d0d)" }}
      >
        {/* The wash behind the headline figure follows the chart beside it,
            not all-time gain. Those two disagree whenever the selected range
            points the other way, and a green glow next to a red line reads as
            a contradiction rather than as two different measures. Falls back
            to all-time until the chart reports. */}
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            inset: "-40% 45% 40% -10%",
            background: `radial-gradient(closest-side, ${
              (chartTone ?? (portfolio.positive ? "positive" : "negative")) === "positive"
                ? "rgba(47,198,133,.16)"
                : "rgba(217,108,108,.16)"
            }, transparent)`,
            animation: "cn-glow 7s ease-in-out infinite",
          }}
        />
        {/* Figure left, chart right, stacking under lg. The chart is given a
            fixed minimum height rather than matching the column beside it, so
            it cannot collapse to a sliver when the figure wraps short. */}
        <div className="relative grid gap-x-9 gap-y-6 lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="font-mono text-eyebrow text-muted uppercase">Total value</div>
            <div className="mt-2 font-serif text-[clamp(2.5rem,5.2vw,62px)] leading-none font-normal tracking-[-0.02em] tabular-nums text-primary">
              {formatMoney(portfolio.totalValue, prefs)}
            </div>

            {/* The gain sat as bare coloured text beside two grey phrases, so
                the single most-read number after the total had no more weight
                than the word "positions". In a pill it is a thing rather than
                a run of text, and the arrow states the direction for anyone
                who cannot separate the two hues. */}
            <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-lead">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-caption tabular-nums ${gainTone} ${
                  portfolio.positive ? "border-accent/35 bg-accent/10" : "border-negative/35 bg-negative/10"
                }`}
              >
                {/* The arrow carries the sign, so the figures are set
                    unsigned: "▼ -€6.65 · -4.35%" states the direction three
                    times in six glyphs. Screen readers get the word instead of
                    the glyph, which is the one place the sign has to survive. */}
                <span aria-hidden>{portfolio.positive ? "▲" : "▼"}</span>
                <span className="sr-only">{portfolio.positive ? "Up" : "Down"} </span>
                {formatMoney(Math.abs(portfolio.totalGain), prefs)} ·{" "}
                {Math.abs(portfolio.totalGainPct).toFixed(2)}%
              </span>
              <span className="text-muted">all time</span>
              <span className="text-dim">·</span>
              <span className="text-muted">
                {portfolio.positions} {portfolio.positions === 1 ? "position" : "positions"}
              </span>
            </div>

            {portfolio.topHoldings.length > 0 && (
              // Holdings read as a row here rather than a stacked list: at this
              // size they are a supporting detail on the headline number, not a
              // table of their own. The full table is one click away.
              <div className="mt-5 flex flex-col items-start gap-2.5">
                <div className="flex flex-wrap items-center gap-2.5">
                {portfolio.topHoldings.map((h) => (
                  <Link
                    key={h.symbol}
                    href={`/ticker/${h.symbol}`}
                    className="tap flex items-center gap-2 rounded-full border border-line bg-[#101010] px-[11px] py-[7px] transition-[border-color,transform,background] duration-fast ease-standard hover:-translate-y-0.5 hover:border-line-strong hover:bg-active"
                  >
                    <span className="text-[12.5px] text-primary">{h.symbol}</span>
                    <span className={`font-mono text-[11.5px] tabular-nums ${h.gainPct >= 0 ? "text-accent" : "text-negative"}`}>
                      {h.gainPct >= 0 ? "+" : ""}
                      {h.gainPct.toFixed(1)}%
                    </span>
                  </Link>
                ))}
                </div>
                {/* Its own row, as the mock has it. Inline, it read as a
                    fourth holding chip; on its own line it reads as the way
                    out of the summary and into the table. */}
                <Link
                  href="/portfolio"
                  className="tap rounded-full border border-dashed border-line px-[11px] py-[7px] text-[12.5px] text-muted transition-[border-color,color] duration-fast ease-standard hover:border-line-strong hover:text-primary"
                >
                  All holdings →
                </Link>
              </div>
            )}
          </div>

          {/* An explicit height, not a minimum. The chart's SVG carries a
              viewBox and no intrinsic height, so with only a min-height it
              fell back to its own aspect ratio - at this column width that is
              ~260px, which drove the whole panel 40px taller than the mock and
              made the hero's height depend on the viewport rather than on the
              design. Fixing the box makes the SVG fill it instead. */}
          <div className="h-[280px] min-w-0">
            <PortfolioValueChart series={portfolio.series} initialTimeframe={portfolio.defaultTimeframe} />
          </div>
        </div>
      </section>
    );
  }

  /**
   * Tier 2 - what Cairn flagged.
   *
   * This is the product's actual differentiator and it was a quarter-width
   * card in the bottom-right corner, its reasoning squeezed to the same
   * measure as a list of ticker symbols. It gets the page's width and its
   * reading size, because it is the one thing here that has to be read rather
   * than glanced at.
   */
  function renderFlagged() {
    const analysis = assistant.latestAnalysis;
    return (
      <section className="animate-rise-in relative h-full overflow-hidden rounded-2xl border border-[#232323] bg-panel px-6 py-[22px]">
        <span
          aria-hidden
          className="absolute top-0 right-0 left-0 h-px"
          style={{ background: "linear-gradient(90deg,#2fc685,rgba(47,198,133,0))" }}
        />
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-mono text-eyebrow text-accent uppercase">
            {/* The dot breathes only while the page is actually re-fetching,
                so it reports the same thing the header's toggle does rather
                than being an ornament that implies live data on a page of
                daily closes. */}
            <span className={`h-1.5 w-1.5 rounded-full bg-accent ${live ? "animate-breathe" : ""}`} />
            What Cairn flagged
          </span>
          <Link
            href="/assistant"
            className="tap text-caption text-dim transition-colors duration-fast ease-standard hover:text-accent"
          >
            Open assistant →
          </Link>
        </div>

        {analysis ? (
          // The evidence used to sit in a right-hand rail. Now that this band
          // shares a row with the markets rail rather than owning the page's
          // full width, that second column would have squeezed the prose to a
          // ~40-character measure. The chips read as a footing under the
          // reading column instead - still "what it rests on", still directly
          // beneath what it rests under.
          <div>
            {/* What the analysis is about and what it rests on, above the
                prose - the spec's eyebrow line. Every field is the stored
                analysis row; nothing here is composed. */}
            <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[9.5px] tracking-[0.14em] text-dim uppercase">
              <span>
                {analysis.scopeType} · {analysis.scopeValue} · {analysis.analysisType.replace(/_/g, " ")}
              </span>
              <span>
                {analysis.sourceCount} {analysis.sourceCount === 1 ? "source" : "sources"} · {analysis.sampleSize}{" "}
                {analysis.sampleSize === 1 ? "analog" : "analogs"} · {formatShortDate(analysis.createdAt)}
              </span>
            </div>
            <div className="max-w-[68ch]">
              {quoteParagraphs(analysis.quote).map((para, i) => (
                <p
                  key={i}
                  className={
                    // text-title, not text-h3. At 20px the lead ran ~67
                    // characters to the line in this column; the mock sets it
                    // near 86, which is the measure the paragraph was written
                    // for and the size the card is proportioned around.
                    i === 0
                      ? "font-serif text-title leading-[1.5] text-primary text-pretty"
                      : "mt-3 text-body leading-[1.65] text-muted text-pretty"
                  }
                >
                  {i === 0 ? <QuoteLead text={para} /> : para}
                </p>
              ))}
            </div>
            {/* Confidence beside the history line it qualifies. Low confidence
                takes the warning tone, not the gain green. */}
            <div className="mt-5 flex flex-wrap items-center gap-4 border-y border-[#1a1a1a] py-3.5">
              <span
                className={`inline-flex items-center gap-[7px] rounded-lg border px-[11px] py-1.5 text-[11.5px] capitalize ${
                  analysis.confidenceLevel === "low"
                    ? "border-warning/35 bg-warning/10 text-warning"
                    : "border-accent/35 bg-accent/10 text-accent-light"
                }`}
              >
                <span
                  className={`h-[5px] w-[5px] rounded-full ${live ? "animate-breathe" : ""} ${
                    analysis.confidenceLevel === "low" ? "bg-warning" : "bg-accent"
                  }`}
                />
                {analysis.confidenceLevel} confidence
              </span>
              <div className="min-w-[150px] flex-1 basis-[220px]">
                <div className="font-mono text-[9px] tracking-[0.14em] text-dim uppercase">What history says</div>
                <p className="mt-1.5 text-body leading-[1.5] text-primary text-pretty">{analysis.historyLine}</p>
              </div>
            </div>
            {analysis.topSource && (
              <div className="mt-4 overflow-hidden rounded-xl border border-[#1f1f1f] bg-[#0b0b0b] transition-colors duration-fast ease-standard hover:border-[#2f2f2f] sm:max-w-[420px]">
                <div className="flex items-center justify-between gap-2.5 border-b border-[#1a1a1a] px-[13px] py-2.5">
                  <span className="font-mono text-[9px] tracking-[0.14em] text-dim uppercase">
                    Sources · {analysis.sourceCount}
                  </span>
                  <Link href="/news" className="text-[11px] text-accent-light">
                    View all
                  </Link>
                </div>
                <div className="px-[13px] py-[11px]">
                  <div className="text-[12px] leading-[1.5] text-pretty text-primary">
                    {decodeEntities(analysis.topSource.title)}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2.5 font-mono text-[10px] text-dim">
                    <span>{analysis.topSource.source}</span>
                    <span>{formatShortDate(analysis.topSource.publishedAt)}</span>
                  </div>
                </div>
              </div>
            )}
            {/*
              Phase 6 requires the SAME Disclosure component on every surface
              that shows analysis output - dashboard, briefing, chat, research.
              This one was missing here, which was the page making the AI
              finding its most prominent element while carrying no disclosure
              at all. The page-footer line further down is about price
              freshness; it is not this, and does not substitute for it.
            */}
            <div className="mt-4 max-w-[68ch]">
              <Disclosure variant="callout" />
            </div>
          </div>
        ) : (
          <div className="max-w-[60ch]">
            <p className="text-lead leading-[1.6] text-muted text-pretty">
              Nothing flagged yet. Ask about a ticker, sector or market trend and Cairn answers from stored
              research - with the sources, historical analogs and confidence behind every figure.
            </p>
            <Link
              href="/assistant"
              className="tap mt-4 inline-flex items-center gap-1.5 rounded-control border border-line px-3.5 py-2 text-body text-primary transition-colors duration-fast ease-standard hover:border-accent hover:text-accent"
            >
              Ask a question
              <span aria-hidden>→</span>
            </Link>
          </div>
        )}
      </section>
    );
  }

  // Which tier each module belongs to. The tier decides how much of the page a
  // module is entitled to, which is a property of what it is rather than a
  // per-card preference the reader has to set.
  const rail = RAIL_MODULES;
  const bands = LAYOUT.filter((k) => k !== "portfolio" && k !== "assistant" && !RAIL_MODULES.includes(k));

  return (
    <div className="animate-page-in">
      {/* Edge to edge, escaping both the shell's px-5.5 and the reading column
          below. A tape runs the width of the screen; boxing it inside the
          content column makes it read as another card. The width is
          `100vw - --sbw`, not `100vw`: the latter includes the scrollbar
          gutter, which had the strip running -7 -> 1913 against a usable
          1905 - overshooting both edges unevenly. See
          layout/scrollbar-width-var.tsx. */}
      <div className="relative left-1/2 -mt-6.5 mb-6.5 w-[calc(100vw-var(--sbw,0px))] -translate-x-1/2">
        <TickerStrip items={tickerItems} />
      </div>

      {/* Base Camp reads in a narrower column than the shell's 1560px.
          The page is one long read - a headline figure, a chart, a paragraph
          of reasoning - and at 1516px the prose measure runs past what anyone
          tracks comfortably and the hero's two halves drift apart. The shell
          keeps its own width for the header and for the table-shaped pages
          that need it; this is Base Camp's column, not a global change. */}
      <div className="mx-auto w-full max-w-[1240px]">

      <div className="mb-5.5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2.5 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">
            <span>
              {today} · {marketStatus.label}
            </span>
            <span className="text-line-strong">·</span>
            {/* Every number on this page is a stored daily close; the page used
                to say so nowhere while showing a green "Live" dot. */}
            <DataFreshness source="last_close" asOf={dataAsOf} className="text-micro" />
          </div>
          <h1 className="font-serif text-[40px] leading-[1.05] font-normal tracking-[-0.015em] text-primary">Base Camp</h1>
          <p className="mt-2 max-w-[520px] text-[13.5px] leading-[1.55] text-muted text-pretty">
            Your marker for the day - portfolio, markets, and what the assistant flagged while you were away.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaused(!paused)}
            title={
              paused
                ? "Auto-refresh paused"
                : marketStatus.isOpen
                  ? `Re-running this page's queries every ${Math.max(15, refreshRateSeconds)}s while this tab is open. The prices themselves are daily closes, not a live feed.`
                  : `${marketStatus.label} - the page refetches when the session reopens`
            }
            className="flex items-center gap-2 rounded-control border border-line px-3 py-2 text-body text-primary transition-colors duration-base ease-standard hover:border-line-strong"
          >
            <span
              className={`animate-breathe h-1.5 w-1.5 rounded-full ${live ? "bg-accent" : "bg-dim"}`}
            />
            {/* Said "Live" beside delayed prices. It reports what it actually
                controls: whether this page is re-fetching on a timer. */}
            {live ? `Auto-refresh · ${Math.max(15, refreshRateSeconds)}s` : paused ? "Auto-refresh paused" : marketStatus.isOpen ? "Idle" : "Market closed"}
          </button>
        </div>
      </div>

      {briefing && <DailyBriefing briefing={briefing} dateLabel={briefingDate} />}


      {/* Three tiers, in the order the questions actually get asked: where do
          I stand, what should I know, what else moved. The old layout was a
          two-column grid of five equal cards, which gave a four-line news
          widget the same visual claim as the total value of the account and
          left the page with nothing to look at first. */}
      <div className="flex flex-col gap-3.5">
        {renderStanding()}

        {/* The assistant's finding beside the market rail, rather than a
            full-width band above it. At full width its prose ran to a measure
            no one reads comfortably, and it pushed the three supporting cards
            entirely below the fold; sharing the row puts the page's one piece
            of real reading next to the numbers it is about. */}
        <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          {renderFlagged()}
          {/* A grid, not a flex column. The cards carry `self-start` so a
              short module does not stretch to a tall neighbour's height -
              and in a flex column `self-start` is the *horizontal* axis,
              which shrank each card to the width of its own text. In a
              single-column grid it means what it was written to mean. */}
          <div className="grid gap-3.5">
            {rail.map((key, index) => renderCard(key, index))}
          </div>
        </div>

        {bands.map((key, index) => renderCard(key, rail.length + index))}
      </div>

      {/* The strip above scrolls and the chart animates, which together imply
          a live tape. One line, once, says what the page is actually made of -
          and carries the standing non-advice line the product is required to
          show rather than leaving it to the assistant's own surfaces. */}
      <p className="mt-6 text-center text-caption text-dim text-pretty">
        Prices are daily closes, not a live feed. Nothing here is a recommendation.
      </p>
      </div>
    </div>
  );
}
