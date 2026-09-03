"use client";

import { useLiveRefresh } from "@/components/use-live-refresh";
import { getMarketStatus } from "@/lib/market-hours";
import { resolveQuotePollSeconds } from "@/lib/live-refresh";

// Drives periodic price revalidation on the ticker and portfolio pages: while
// the market is open and this tab is in the foreground, it re-runs the page's
// server components on an interval (router.refresh()), so a live quote on
// screen updates without a manual reload. Off outside market hours - the
// number would not change - and pausable.
//
// The label next to it (DataFreshness) already states "Live" vs
// "Delayed · close of <date>" from the price's actual source, so this only
// adds the "when it last checked" / pause affordance, and only when a poll is
// actually possible.
export function LivePricePoll({ refreshRateSeconds }: { refreshRateSeconds: number | null }) {
  const market = getMarketStatus();
  const seconds = resolveQuotePollSeconds(refreshRateSeconds);
  const { active, paused, setPaused, lastRefreshedAt } = useLiveRefresh(seconds, market.isOpen);

  if (!market.isOpen) return null;

  const time = lastRefreshedAt
    ? lastRefreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] whitespace-nowrap text-dim uppercase">
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${active ? "bg-accent" : "bg-dim"}`}
      />
      {paused ? "Updates paused" : time ? `Updated ${time}` : `Updates every ${Math.round(seconds / 60) || 1} min`}
      <button
        type="button"
        onClick={() => setPaused(!paused)}
        className="ml-1 rounded border border-line px-1.5 py-0.5 text-[9px] tracking-normal text-muted normal-case transition-colors hover:border-[#3A3A3A] hover:text-primary"
      >
        {paused ? "Resume" : "Pause"}
      </button>
    </span>
  );
}
