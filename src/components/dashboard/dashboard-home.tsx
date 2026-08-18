"use client";

import { useState } from "react";
import { useActionState } from "react";
import { updateDashboardLayout } from "@/lib/actions/dashboard";
import { DashboardSummaryCard } from "@/components/dashboard/dashboard-summary-card";

export type ModuleKey = "portfolio" | "markets" | "watchlist" | "news" | "assistant";
export const MODULE_KEYS: ModuleKey[] = ["portfolio", "markets", "watchlist", "news", "assistant"];

interface DashboardHomeProps {
  initialLayout: ModuleKey[];
  today: string;
  portfolio: {
    totalValue: string;
    totalGain: string;
    positive: boolean;
    positions: number;
  };
  markets: {
    trackedSymbols: number;
    featuredType: string;
  };
  watchlist: {
    lists: number;
    symbols: number;
    topListName: string;
  };
  news: {
    articles: number;
    headline: string;
  };
  assistant: {
    sessions: number;
    briefingDate: string | null;
  };
}

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
  const [wideKeys, setWideKeys] = useState<Set<ModuleKey>>(new Set());
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
          <DashboardSummaryCard
            key={key}
            title={module.label}
            href={module.href}
            ctaLabel={module.cta}
            tint={module.tint}
            value={portfolio.totalValue}
            valueTone={portfolio.positive ? "positive" : "negative"}
            detail={`${portfolio.totalGain} unrealized · ${portfolio.positions} positions`}
            delay={delay}
            {...arrangeProps}
          />
        );
      case "markets":
        return (
          <DashboardSummaryCard
            key={key}
            title={module.label}
            href={module.href}
            ctaLabel={module.cta}
            tint={module.tint}
            value={markets.featuredType}
            detail={`${markets.trackedSymbols} symbols tracked across equities, ETFs, crypto, and forex`}
            delay={delay}
            {...arrangeProps}
          />
        );
      case "watchlist":
        return (
          <DashboardSummaryCard
            key={key}
            title={module.label}
            href={module.href}
            ctaLabel={module.cta}
            tint={module.tint}
            value={`${watchlist.symbols} symbols`}
            detail={`${watchlist.lists} lists · top list: ${watchlist.topListName}`}
            delay={delay}
            {...arrangeProps}
          />
        );
      case "news":
        return (
          <DashboardSummaryCard
            key={key}
            title={module.label}
            href={module.href}
            ctaLabel={module.cta}
            tint={module.tint}
            value={news.headline || "No headlines yet"}
            detail={`${news.articles} recent articles prioritized for your holdings and sectors`}
            delay={delay}
            {...arrangeProps}
          />
        );
      case "assistant":
        return (
          <DashboardSummaryCard
            key={key}
            title={module.label}
            href={module.href}
            ctaLabel={module.cta}
            tint={module.tint}
            value={assistant.briefingDate ?? "No briefing today"}
            detail={`${assistant.sessions} conversations · resume a thread or review the briefing`}
            delay={delay}
            {...arrangeProps}
          />
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
          <h1 className="font-serif text-[34px] leading-tight font-normal text-primary">Base Camp</h1>
          <p className="mt-1.5 max-w-[560px] text-[13.5px] text-muted text-pretty">
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
