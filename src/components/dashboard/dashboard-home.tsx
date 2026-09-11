"use client";

import { useState } from "react";
import Link from "next/link";
import { getMarketStatus } from "@/lib/market-hours";
import { useLiveRefresh } from "@/components/use-live-refresh";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { absoluteChangeFrom, formatChange, formatMoney, formatSignedMoney } from "@/lib/display-prefs";
import { useActionState } from "react";
import { updateDashboardLayout } from "@/lib/actions/dashboard";
import { ArrangeControls, DashboardSummaryCard } from "@/components/dashboard/dashboard-summary-card";
import { decodeEntities } from "@/lib/news";
import { TimeAgo } from "@/components/time-ago";
import { MODULE_KEYS, type ModuleKey } from "@/lib/dashboard-modules";
import { DataFreshness } from "@/components/data-freshness";
import { Sparkline } from "@/components/sparkline";

// MODULE_KEYS / ModuleKey now live in lib/dashboard-modules.ts. The dashboard
// page is a Server Component and imported them from this "use client" module,
// which hands back a client reference rather than the array itself - so
// `MODULE_KEYS.includes(...)` threw and the dashboard 500'd.

interface DashboardHomeProps {
  initialLayout: ModuleKey[];
  today: string;
  /** From user_settings.refresh_rate_seconds - written by the settings form and, until now, read by nothing. */
  refreshRateSeconds?: number;
  /** Date of the newest close behind every price on this page. */
  dataAsOf?: string | null;
  portfolio: {
    /** Raw USD - formatted here through the shared display-prefs formatter. */
    totalValue: number;
    totalGain: number;
    totalGainPct: number;
    positive: boolean;
    positions: number;
    sparkline: number[];
    /** Direction of the sparkline's own window, not of all-time gain. */
    sparklinePositive: boolean;
    sparklineTimeframe: string;
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

const MODULES: { key: ModuleKey; label: string; href: string; cta: string }[] = [
  { key: "portfolio", label: "Portfolio", href: "/portfolio", cta: "Open holdings" },
  { key: "markets", label: "Markets", href: "/markets", cta: "Browse markets" },
  { key: "watchlist", label: "Watchlist", href: "/watchlists", cta: "Open watchlists" },
  { key: "news", label: "News", href: "/news", cta: "Read all" },
  { key: "assistant", label: "AI Assistant", href: "/assistant", cta: "Open assistant" },
];

const DEFAULT_LAYOUT: ModuleKey[] = ["portfolio", "markets", "watchlist", "news", "assistant"];

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

export function DashboardHome({
  initialLayout,
  today,
  portfolio,
  markets,
  watchlist,
  news,
  assistant,
  refreshRateSeconds = 30,
  dataAsOf = null,
}: DashboardHomeProps) {
  const [layout, setLayout] = useState<ModuleKey[]>(initialLayout.length ? initialLayout : DEFAULT_LAYOUT);
  const [arranging, setArranging] = useState(false);
  // Was `useState(true)` wired to nothing, next to prices that never changed.
  // Now reflects a timer that actually runs - and only runs when refreshing
  // would tell the user something new.
  const marketStatus = getMarketStatus();
  const { active: live, paused, setPaused } = useLiveRefresh(refreshRateSeconds, marketStatus.isOpen);
  // Settings > Display: currency and percent-vs-dollar, the same source every
  // other price surface reads.
  const prefs = useDisplayPrefs();
  const [result, formAction] = useActionState(updateDashboardLayout, null);

  const moduleMap = new Map(MODULES.map((m) => [m.key, m]));
  const hidden = MODULE_KEYS.filter((key) => !layout.includes(key));

  function moveModule(key: ModuleKey, direction: -1 | 1) {
    setLayout((current) => {
      const next = [...current];
      const index = next.indexOf(key);
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function hideModule(key: ModuleKey) {
    setLayout((current) => current.filter((k) => k !== key));
  }

  function showModule(key: ModuleKey) {
    setLayout((current) => [...current, key]);
  }

  function renderCard(key: ModuleKey, index: number) {
    // Named `module` previously, which shadows the CommonJS binding and is a
    // hard @next/next/no-assign-module-variable error.
    const card = moduleMap.get(key);
    if (!card) return null;
    const delay = index * 40;
    const arrangeProps = {
      arranging,
      onMoveUp: () => moveModule(key, -1),
      onMoveDown: () => moveModule(key, 1),
      onHide: () => hideModule(key),
    };

    switch (key) {
      case "markets":
        return (
          <DashboardSummaryCard key={key} title={card.label} href={card.href} ctaLabel={card.cta} delay={delay} {...arrangeProps}>
            <div className="flex flex-col gap-2.5">
              {markets.top.map((r) => (
                <div key={r.symbol} className="flex items-center justify-between gap-3">
                  <span className="text-body text-primary">{r.symbol}</span>
                  <span className="font-mono text-body tabular-nums text-muted">
                    {formatMoney(r.price, prefs)}
                  </span>
                  <span className={`font-mono text-caption tabular-nums ${r.changePct >= 0 ? "text-accent" : "text-negative"}`}>
                    {formatChange(absoluteChangeFrom(r.price, r.changePct), r.changePct, prefs)}
                  </span>
                </div>
              ))}
            </div>
          </DashboardSummaryCard>
        );
      case "watchlist":
        return (
          <DashboardSummaryCard key={key} title={card.label} href={card.href} ctaLabel={card.cta} delay={delay} {...arrangeProps}>
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
                <Link
                  href="/watchlists/new"
                  className="mt-3.5 inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-2 text-body text-primary transition-colors duration-fast ease-standard hover:border-accent hover:text-accent"
                >
                  Create a watchlist
                  <span aria-hidden>→</span>
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
          <DashboardSummaryCard key={key} title={card.label} href={card.href} ctaLabel={card.cta} delay={delay} {...arrangeProps}>
            {news.items.length === 0 ? (
              <div className="text-body text-muted">No headlines yet</div>
            ) : (
              <div className="flex flex-col gap-3">
                {news.items.map((item, i) => (
                  <div key={i} className="flex gap-2.5">
                    <span
                      className={`w-[3px] shrink-0 rounded-xs ${NEWS_TINT[item.tint].className}`}
                      title={NEWS_TINT[item.tint].label}
                    />
                    <div>
                      <div className="text-body leading-normal text-primary">{decodeEntities(item.title)}</div>
                      <div className="mt-1 text-micro text-dim">
                        <span className="sr-only">{NEWS_TINT[item.tint].label} · </span>
                        {item.source} · <TimeAgo iso={item.publishedAt} />
                      </div>
                    </div>
                  </div>
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
   * Not a card. Base Camp used to be five equal panels in a two-column grid,
   * which is a layout that says every one of these matters the same amount.
   * They do not: this is a portfolio tracker, and the first question anyone
   * opens it with is "where do I stand". Setting the total on the page itself,
   * at display scale, with the month behind it, answers that before anything
   * else can compete for the look.
   */
  function renderStanding() {
    return (
      <section className="border-b border-line pb-7">
        {arranging && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="font-mono text-eyebrow text-muted uppercase">Portfolio</span>
            <ArrangeControls
              onMoveUp={() => moveModule("portfolio", -1)}
              onMoveDown={() => moveModule("portfolio", 1)}
              onHide={() => hideModule("portfolio")}
            />
          </div>
        )}
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
          <div className="min-w-0">
            <div className="font-mono text-eyebrow text-muted uppercase">Total value</div>
            <div className="mt-2 font-serif text-[clamp(2.75rem,6vw,4rem)] leading-[0.95] font-normal tabular-nums text-primary">
              {formatMoney(portfolio.totalValue, prefs)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-lead">
              <span className={portfolio.positive ? "text-accent" : "text-negative"}>
                {formatSignedMoney(portfolio.totalGain, prefs)} {portfolio.totalGainPct >= 0 ? "+" : ""}
                {portfolio.totalGainPct.toFixed(2)}%
              </span>
              <span className="text-muted">all time</span>
              <span className="text-dim">·</span>
              <span className="text-muted">
                {portfolio.positions} {portfolio.positions === 1 ? "position" : "positions"}
              </span>
            </div>
          </div>

          {portfolio.sparkline.length > 1 && (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {/* Coloured by the window it draws, not by all-time gain - the
                  same rule the Portfolio chart and the table rows follow. */}
              {/* The size classes have to be passed, not just width/height:
                  Sparkline's default className is "h-7 w-[90px]", and those
                  win over the SVG attributes, so a 260x72 request rendered at
                  90x28. */}
              <Sparkline
                values={portfolio.sparkline}
                positive={portfolio.sparklinePositive}
                width={260}
                height={72}
                className="h-[72px] w-[260px] shrink-0"
              />
              <span className="font-mono text-eyebrow text-dim uppercase">{portfolio.sparklineTimeframe}</span>
            </div>
          )}
        </div>

        {portfolio.topHoldings.length > 0 && (
          // Holdings read as a row here rather than a stacked list: at this
          // size they are a supporting detail on the headline number, not a
          // table of their own. The full table is one click away.
          <div className="mt-6 flex flex-wrap items-center gap-x-2.5 gap-y-2">
            {portfolio.topHoldings.map((h) => (
              <Link
                key={h.symbol}
                href={`/ticker/${h.symbol}`}
                className="flex items-center gap-2 rounded-panel border border-line px-3 py-1.5 transition-colors duration-fast ease-standard hover:border-line-strong hover:bg-active"
              >
                <span className="text-body text-primary">{h.symbol}</span>
                <span className={`font-mono text-caption tabular-nums ${h.gainPct >= 0 ? "text-accent" : "text-negative"}`}>
                  {h.gainPct >= 0 ? "+" : ""}
                  {h.gainPct.toFixed(1)}%
                </span>
              </Link>
            ))}
            <Link
              href="/portfolio"
              className="ml-auto text-body text-dim transition-colors duration-fast ease-standard hover:text-accent"
            >
              All holdings →
            </Link>
          </div>
        )}
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
      <section className="rounded-card border border-line bg-panel p-5.5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="font-mono text-eyebrow text-muted uppercase">What Cairn flagged</span>
          {arranging ? (
            <ArrangeControls
              onMoveUp={() => moveModule("assistant", -1)}
              onMoveDown={() => moveModule("assistant", 1)}
              onHide={() => hideModule("assistant")}
            />
          ) : (
            <Link
              href="/assistant"
              className="text-caption text-dim transition-colors duration-fast ease-standard hover:text-accent"
            >
              Open assistant →
            </Link>
          )}
        </div>

        {analysis ? (
          // Reading column left, evidence rail right - the same shape the
          // methodology card uses, so "what it says" and "what it rests on"
          // sit in the same relationship everywhere in the product. A single
          // full-width column would have run the prose to ~150 characters or
          // left two thirds of the band empty.
          <div className="grid gap-x-9 gap-y-5 lg:grid-cols-[minmax(0,44rem)_minmax(0,1fr)]">
            <div>
              {quoteParagraphs(analysis.quote).map((para, i) => (
                <p
                  key={i}
                  className={
                    i === 0
                      ? "font-serif text-h3 leading-[1.35] text-primary text-pretty"
                      : "mt-3 text-lead leading-[1.65] text-muted text-pretty"
                  }
                >
                  {i === 0 ? <QuoteLead text={para} /> : para}
                </p>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 lg:flex-col lg:items-start">
              <span className="rounded-full border border-line px-2.5 py-1 text-caption text-muted">
                {analysis.sourceCount} sources
              </span>
              <span className="rounded-full border border-line px-2.5 py-1 text-caption text-muted">
                {analysis.sampleSize} {analysis.sampleSize === 1 ? "analog" : "analogs"}
              </span>
              <span className="rounded-full border border-accent/35 px-2.5 py-1 text-caption text-accent capitalize">
                {analysis.confidenceLevel} confidence
              </span>
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
              className="mt-4 inline-flex items-center gap-1.5 rounded-control border border-line px-3.5 py-2 text-body text-primary transition-colors duration-fast ease-standard hover:border-accent hover:text-accent"
            >
              Ask a question
              <span aria-hidden>→</span>
            </Link>
          </div>
        )}
      </section>
    );
  }

  // Which modules are live, and which tier each belongs to. `layout` still
  // owns visibility and order; the tier decides how much of the page a module
  // is entitled to, which is a property of what it is rather than a per-card
  // preference the reader has to set.
  const showStanding = layout.includes("portfolio");
  const showFlagged = layout.includes("assistant");
  const supporting = layout.filter((k) => k !== "portfolio" && k !== "assistant");

  return (
    <div className="animate-page-in">
      <div className="mb-5.5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-eyebrow text-muted uppercase">
            <span>
              {today} · {marketStatus.label}
            </span>
            <span className="text-dim">·</span>
            {/* Every number on this page is a stored daily close; the page used
                to say so nowhere while showing a green "Live" dot. */}
            <DataFreshness source="last_close" asOf={dataAsOf} className="text-micro" />
          </div>
          <h1 className="font-serif text-display leading-[1.1] font-normal text-primary">Base Camp</h1>
          <p className="mt-2 max-w-[560px] text-lead text-muted text-pretty">
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
          <form action={formAction} className="flex items-center gap-2">
            {layout.map((key) => (
              <input key={key} type="hidden" name="layout" value={key} />
            ))}
            <button
              type="button"
              onClick={() => setArranging((prev) => !prev)}
              className={`rounded-control border border-line px-3 py-2 text-body text-primary transition-colors duration-base ease-standard hover:border-line-strong ${
                arranging ? "bg-active" : "bg-transparent"
              }`}
            >
              {arranging ? "Done" : "Arrange"}
            </button>
            {arranging && (
              <button
                type="submit"
                className="rounded-control bg-accent px-3 py-2 text-body font-semibold text-canvas transition-colors duration-base ease-standard hover:bg-accent-dark"
              >
                Save layout
              </button>
            )}
          </form>
        </div>
      </div>

      {result && result !== "saved" && <div className="mb-3.5 text-lead text-negative">{result}</div>}

      {/* Three tiers, in the order the questions actually get asked: where do
          I stand, what should I know, what else moved. The old layout was a
          two-column grid of five equal cards, which gave a four-line news
          widget the same visual claim as the total value of the account and
          left the page with nothing to look at first. */}
      <div className="flex flex-col gap-7">
        {showStanding && renderStanding()}
        {showFlagged && renderFlagged()}

        {supporting.length > 0 && (
          // `self-start` and a fixed track, as before: an auto-fit grid
          // stretched every tile in a row to the tallest, so a short module
          // grew a band of empty space under its content.
          <div className="grid grid-cols-1 items-start gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {supporting.map((key, index) => renderCard(key, index))}
          </div>
        )}
      </div>

      {hidden.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2.5 rounded-panel border border-dashed border-line px-4 py-3">
          <span className="font-mono text-eyebrow text-dim uppercase">Hidden</span>
          {hidden.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => showModule(key)}
              className="rounded-full border border-line px-3 py-1 text-caption text-muted transition-colors duration-base ease-standard hover:border-accent hover:text-primary"
            >
              + {moduleMap.get(key)?.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
