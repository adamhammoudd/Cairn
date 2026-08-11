"use client";

import { useState } from "react";
import { useActionState } from "react";
import { updateDashboardLayout } from "@/lib/actions/dashboard";
import { DashboardSummaryCard } from "@/components/dashboard/dashboard-summary-card";

export type ModuleKey = "portfolio" | "markets" | "watchlist" | "news" | "assistant";
export const MODULE_KEYS: ModuleKey[] = ["portfolio", "markets", "watchlist", "news", "assistant"];

interface DashboardHomeProps {
  initialLayout: ModuleKey[];
  portfolio: {
    totalValue: string;
    totalGain: string;
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

const MODULES: { key: ModuleKey; label: string; description: string }[] = [
  { key: "portfolio", label: "Portfolio", description: "Holdings, value, and performance at a glance." },
  { key: "markets", label: "Markets", description: "Tracked symbols, top market type, and broad market context." },
  { key: "watchlist", label: "Watchlist", description: "Your watchlists, symbols, and quick status." },
  { key: "news", label: "News", description: "Trending headlines prioritized for your holdings and sectors." },
  { key: "assistant", label: "AI Assistant", description: "Your latest briefing and conversation history." },
];

const DEFAULT_LAYOUT: ModuleKey[] = ["portfolio", "markets", "watchlist", "news", "assistant"];

export function DashboardHome({ initialLayout, portfolio, markets, watchlist, news, assistant }: DashboardHomeProps) {
  const [layout, setLayout] = useState<ModuleKey[]>(initialLayout.length ? initialLayout : DEFAULT_LAYOUT);
  const [result, formAction] = useActionState(updateDashboardLayout, null);

  const moduleMap = new Map(MODULES.map((module) => [module.key, module]));

  function moveModule(key: ModuleKey, direction: -1 | 1) {
    setLayout((current) => {
      const next = [...current];
      const index = next.indexOf(key);
      if (index === -1) return current;
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function toggleModule(key: ModuleKey) {
    setLayout((current) =>
      current.includes(key) ? current.filter((module) => module !== key) : [...current, key],
    );
  }

  function renderCard(key: ModuleKey) {
    switch (key) {
      case "portfolio":
        return (
          <DashboardSummaryCard
            key={key}
            title="Portfolio"
            subtitle={`${portfolio.positions} positions`}
            value={portfolio.totalValue}
            detail={`Unrealized gain/loss: ${portfolio.totalGain}`}
            tone={portfolio.totalGain.startsWith("-") ? "negative" : "positive"}
          />
        );
      case "markets":
        return (
          <DashboardSummaryCard
            key={key}
            title="Markets"
            subtitle={`${markets.trackedSymbols} tracked symbols`}
            value={markets.featuredType}
            detail="Filtered by assets you care about, including equities, ETFs, crypto, and forex."
            tone="info"
          />
        );
      case "watchlist":
        return (
          <DashboardSummaryCard
            key={key}
            title="Watchlist"
            subtitle={`${watchlist.lists} lists`}
            value={`${watchlist.symbols} symbols`}
            detail={`Top list: ${watchlist.topListName}`}
            tone="primary"
          />
        );
      case "news":
        return (
          <DashboardSummaryCard
            key={key}
            title="News"
            subtitle={`${news.articles} recent articles`}
            value={news.headline || "No headlines yet"}
            detail="Prioritized by your holdings, watchlist, and sectors."
            tone="info"
          />
        );
      case "assistant":
        return (
          <DashboardSummaryCard
            key={key}
            title="AI Assistant"
            subtitle={`${assistant.sessions} conversations`}
            value={assistant.briefingDate ?? "No briefing today"}
            detail="Resume a thread or review the latest market briefing."
            tone="primary"
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-card border border-line bg-panel p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-serif text-primary">Dashboard</h1>
            <p className="mt-1 text-sm text-muted">
              One place for your portfolio performance, market context, watchlist status, news, and AI research.
            </p>
          </div>
          <div className="rounded-full border border-line bg-active px-4 py-2 text-[13px] text-muted">
            Click Save to persist your dashboard module selections and order.
          </div>
        </div>

        <form action={formAction} className="grid gap-4">
          <div className="grid gap-4 rounded-card border border-line bg-canvas p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm text-primary">Dashboard layout</div>
                <p className="text-[13px] text-muted">Show or hide modules, then reorder them to match your workflow.</p>
              </div>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-canvas transition hover:bg-accent-dark"
              >
                Save layout
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {MODULES.map((module) => {
                const selectedIndex = layout.indexOf(module.key);
                const selected = selectedIndex !== -1;

                return (
                  <div
                    key={module.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3"
                  >
                    <div>
                      <label className="flex items-center gap-2 text-sm text-primary">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleModule(module.key)}
                          className="accent-accent"
                        />
                        {module.label}
                      </label>
                      <div className="text-[12.5px] text-muted">{module.description}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveModule(module.key, -1)}
                        className="rounded-md border border-line px-2 py-1 text-xs text-muted transition hover:border-accent hover:text-primary"
                        disabled={!selected || selectedIndex === 0}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveModule(module.key, 1)}
                        className="rounded-md border border-line px-2 py-1 text-xs text-muted transition hover:border-accent hover:text-primary"
                        disabled={!selected || selectedIndex === layout.length - 1}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden">
              {layout.map((key) => (
                <input key={key} type="hidden" name="layout" value={key} />
              ))}
            </div>

            {result && result !== "saved" && <div className="text-sm text-negative">{result}</div>}
            {result === "saved" && <div className="text-sm text-accent">Layout saved.</div>}
          </div>
        </form>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {layout.map((module) => renderCard(module)).filter(Boolean)}
      </div>
    </div>
  );
}
