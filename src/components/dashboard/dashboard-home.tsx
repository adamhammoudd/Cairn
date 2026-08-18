"use client";

import { useState } from "react";
import { useActionState } from "react";
import { updateDashboardLayout } from "@/lib/actions/dashboard";
import { DashboardSummaryCard } from "@/components/dashboard/dashboard-summary-card";
import { decodeEntities } from "@/lib/news";

export type ModuleKey = "portfolio" | "markets" | "watchlist" | "news" | "assistant";
export const MODULE_KEYS: ModuleKey[] = ["portfolio", "markets", "watchlist", "news", "assistant"];

interface DashboardHomeProps {
  initialLayout: ModuleKey[];
  today: string;
  portfolio: {
    totalValue: string;
    totalGain: string;
    totalGainPct: number;
    positive: boolean;
    positions: number;
    sparkline: number[];
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

function sparklinePoints(values: number[], width: number, height: number) {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const NEWS_TINT: Record<"accent" | "violet" | "warning", string> = {
  accent: "bg-accent",
  violet: "bg-violet",
  warning: "bg-warning",
};

const MODULES: { key: ModuleKey; label: string; href: string; cta: string; tint: "accent" | "info" | "violet" | "warning" }[] = [
  { key: "portfolio", label: "Portfolio", href: "/portfolio", cta: "Open holdings", tint: "accent" },
  { key: "markets", label: "Markets", href: "/markets", cta: "Browse markets", tint: "info" },
  { key: "watchlist", label: "Watchlist", href: "/watchlists", cta: "Open watchlists", tint: "violet" },
  { key: "news", label: "News", href: "/news", cta: "Read all", tint: "warning" },
  { key: "assistant", label: "AI Assistant", href: "/assistant", cta: "Open assistant", tint: "accent" },
];

const DEFAULT_LAYOUT: ModuleKey[] = ["portfolio", "markets", "watchlist", "news", "assistant"];

export function DashboardHome({ initialLayout, today, portfolio, markets, watchlist, news, assistant }: DashboardHomeProps) {
  const [layout, setLayout] = useState<ModuleKey[]>(initialLayout.length ? initialLayout : DEFAULT_LAYOUT);
  const [arranging, setArranging] = useState(false);
  // Portfolio ships double-width, as in the mock — its sparkline sits beside
  // the value rather than wrapping under it.
  const [wideKeys, setWideKeys] = useState<Set<ModuleKey>>(new Set<ModuleKey>(["portfolio"]));
  const [live, setLive] = useState(true);
  const [result, formAction] = useActionState(updateDashboardLayout, null);

  const moduleMap = new Map(MODULES.map((module) => [module.key, module]));
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

  function toggleWide(key: ModuleKey) {
    setWideKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderCard(key: ModuleKey, index: number) {
    const module = moduleMap.get(key);
    if (!module) return null;
    const delay = index * 40;
    const arrangeProps = {
      wide: wideKeys.has(key),
      arranging,
      onMoveUp: () => moveModule(key, -1),
      onMoveDown: () => moveModule(key, 1),
      onToggleWide: () => toggleWide(key),
      onHide: () => hideModule(key),
    };

    switch (key) {
      case "portfolio":
        return (
          <DashboardSummaryCard key={key} title={module.label} href={module.href} ctaLabel={module.cta} tint={module.tint} delay={delay} {...arrangeProps}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="font-serif text-[30px] leading-none text-primary">{portfolio.totalValue}</div>
                <div className="mt-2 text-xs text-muted">
                  <span className={portfolio.positive ? "text-accent" : "text-negative"}>
                    {portfolio.totalGain} {portfolio.totalGainPct >= 0 ? "+" : ""}
                    {portfolio.totalGainPct.toFixed(2)}%
                  </span>{" "}
                  all time
                </div>
              </div>
              {portfolio.sparkline.length > 1 && (
                <svg viewBox="0 0 180 46" width={180} height={46} className="shrink-0">
                  <polyline
                    points={sparklinePoints(portfolio.sparkline, 180, 46)}
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth={1.8}
                    strokeLinejoin="round"
                    pathLength="1"
                    strokeDasharray="1"
                    className="animate-draw"
                  />
                </svg>
              )}
            </div>
            {portfolio.topHoldings.length > 0 && (
              <div className="mt-4 flex flex-col gap-2">
                {portfolio.topHoldings.map((h) => (
                  <div key={h.symbol} className="flex items-center justify-between gap-3 text-[12.5px]">
                    <span className="text-primary">{h.symbol}</span>
                    <span className={`font-mono tabular-nums ${h.gainPct >= 0 ? "text-accent" : "text-negative"}`}>
                      {h.gainPct >= 0 ? "+" : ""}
                      {h.gainPct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </DashboardSummaryCard>
        );
      case "markets":
        return (
          <DashboardSummaryCard key={key} title={module.label} href={module.href} ctaLabel={module.cta} tint={module.tint} delay={delay} {...arrangeProps}>
            <div className="flex flex-col gap-2.5">
              {markets.top.map((r) => (
                <div key={r.symbol} className="flex items-center justify-between gap-3">
                  <span className="text-[12.5px] text-primary">{r.symbol}</span>
                  <span className="font-mono text-[12.5px] tabular-nums text-muted">
                    {r.price.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                  </span>
                  <span className={`font-mono text-xs tabular-nums ${r.changePct >= 0 ? "text-accent" : "text-negative"}`}>
                    {r.changePct >= 0 ? "+" : ""}
                    {r.changePct.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </DashboardSummaryCard>
        );
      case "watchlist":
        return (
          <DashboardSummaryCard key={key} title={module.label} href={module.href} ctaLabel={module.cta} tint={module.tint} delay={delay} {...arrangeProps}>
            <div className="mb-3 text-[12.5px] text-muted">
              {watchlist.lists} lists · {watchlist.symbols} symbols ·{" "}
              {watchlist.alertsPastThreshold > 0 ? `${watchlist.alertsPastThreshold} past an alert threshold` : "none past an alert threshold"}
            </div>
            <div className="flex flex-wrap gap-2">
              {watchlist.topMovers.map((m) => (
                <span key={m.symbol} className="inline-flex items-center gap-2 rounded-full border border-line px-2.75 py-1.5 text-xs">
                  <span className="text-primary">{m.symbol}</span>
                  <span className={`font-mono tabular-nums ${m.pct >= 0 ? "text-accent" : "text-negative"}`}>
                    {m.pct >= 0 ? "+" : ""}
                    {m.pct.toFixed(1)}%
                  </span>
                </span>
              ))}
            </div>
          </DashboardSummaryCard>
        );
      case "news":
        return (
          <DashboardSummaryCard key={key} title={module.label} href={module.href} ctaLabel={module.cta} tint={module.tint} delay={delay} {...arrangeProps}>
            {news.items.length === 0 ? (
              <div className="text-[12.5px] text-muted">No headlines yet</div>
            ) : (
              <div className="flex flex-col gap-3">
                {news.items.map((item, i) => (
                  <div key={i} className="flex gap-2.5">
                    <span className={`w-[3px] shrink-0 rounded-sm ${NEWS_TINT[item.tint]}`} />
                    <div>
                      <div className="text-[12.5px] leading-normal text-primary">{decodeEntities(item.title)}</div>
                      <div className="mt-1 text-[11px] text-dim">
                        {item.source} · {timeAgo(item.publishedAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DashboardSummaryCard>
        );
      case "assistant":
        return (
          <DashboardSummaryCard key={key} title={module.label} href={module.href} ctaLabel={module.cta} tint={module.tint} delay={delay} {...arrangeProps}>
            {assistant.latestAnalysis ? (
              <>
                <div className="text-[13px] leading-relaxed text-primary">{assistant.latestAnalysis.quote}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-line px-2.5 py-1.25 text-[11.5px] text-muted">
                    {assistant.latestAnalysis.sourceCount} sources
                  </span>
                  <span className="rounded-full border border-line px-2.5 py-1.25 text-[11.5px] text-muted">
                    {assistant.latestAnalysis.sampleSize} analogs
                  </span>
                  <span className="rounded-full border border-accent/35 px-2.5 py-1.25 text-[11.5px] text-accent capitalize">
                    {assistant.latestAnalysis.confidenceLevel} confidence
                  </span>
                </div>
              </>
            ) : (
              <div className="text-[12.5px] text-muted">{assistant.sessions} conversations · resume a thread or ask a question</div>
            )}
          </DashboardSummaryCard>
        );
      default:
        return null;
    }
  }

  return (
    <div className="animate-page-in">
      <div className="mb-5.5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">{today} · markets open</div>
          <h1 className="font-serif text-[34px] leading-[1.1] font-normal text-primary">Base Camp</h1>
          <p className="mt-1.75 max-w-[560px] text-[13.5px] text-muted text-pretty">
            Your marker for the day — portfolio, markets, and what the assistant flagged while you were away.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLive((prev) => !prev)}
            className="flex items-center gap-1.75 rounded-lg border border-line px-3 py-2 text-[12.5px] text-primary transition-colors duration-base ease-standard hover:border-[#3A3A3A]"
          >
            <span
              className={`animate-breathe h-1.5 w-1.5 rounded-full ${live ? "bg-accent" : "bg-dim"}`}
            />
            {live ? "Live" : "Paused"}
          </button>
          <form action={formAction} className="flex items-center gap-2">
            {layout.map((key) => (
              <input key={key} type="hidden" name="layout" value={key} />
            ))}
            <button
              type="button"
              onClick={() => setArranging((prev) => !prev)}
              className={`rounded-lg border border-line px-3 py-2 text-[12.5px] text-primary transition-colors duration-base ease-standard hover:border-[#3A3A3A] ${
                arranging ? "bg-active" : "bg-transparent"
              }`}
            >
              {arranging ? "Done" : "Arrange"}
            </button>
            {arranging && (
              <button
                type="submit"
                className="rounded-lg bg-accent px-3 py-2 text-[12.5px] font-semibold text-canvas transition-colors duration-base ease-standard hover:bg-accent-dark"
              >
                Save layout
              </button>
            )}
          </form>
        </div>
      </div>

      {result && result !== "saved" && <div className="mb-3.5 text-sm text-negative">{result}</div>}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3.5">
        {layout.map((key, index) => renderCard(key, index))}
      </div>

      {hidden.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-dashed border-line px-4 py-3.25">
          <span className="font-mono text-[10.5px] tracking-[0.14em] text-dim uppercase">Hidden</span>
          {hidden.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => showModule(key)}
              className="rounded-full border border-line px-2.75 py-1.25 text-xs text-muted transition-colors duration-base ease-standard hover:border-accent hover:text-primary"
            >
              + {moduleMap.get(key)?.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
