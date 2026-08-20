"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Makes the "Live" pill and the Settings > Display > "Refresh rate · how often
// live prices update" row true.
//
// Both were claims with nothing behind them: the pill was `useState(true)`
// wired to nothing, and `refresh_rate_seconds` was written by the settings
// form and read by no consumer anywhere in the codebase - `grep -rn
// "setInterval" src/` returned zero results. Prices changed on page load and
// never again, under a breathing green dot.
//
// Rather than delete the promise, this keeps it, with three constraints that
// stop it becoming a load problem:
//
//   1. Only while the market is actually open (src/lib/market-hours.ts). A
//      poll at 3am refetches yesterday's close and learns nothing.
//   2. Only while the tab is visible. A backgrounded tab polling every 30s for
//      a day is thousands of pointless queries per user.
//   3. Only while the user has not paused it.
//
// router.refresh() re-runs the server components and streams new data into the
// existing tree, so this is a data refresh rather than a reload - scroll
// position and local state survive.

export interface LiveRefreshState {
  /** True when the timer is actually running - what the pill should show. */
  active: boolean;
  paused: boolean;
  setPaused: (paused: boolean) => void;
  lastRefreshedAt: Date | null;
}

const MIN_INTERVAL_SECONDS = 15;

export function useLiveRefresh(refreshRateSeconds: number, marketIsOpen: boolean): LiveRefreshState {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    function onVisibility() {
      setVisible(document.visibilityState === "visible");
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const active = !paused && marketIsOpen && visible;

  useEffect(() => {
    if (!active) return;
    // Floored so a hand-edited settings row cannot ask the app to refetch
    // every second.
    const seconds = Math.max(MIN_INTERVAL_SECONDS, refreshRateSeconds || 30);
    const id = setInterval(() => {
      router.refresh();
      setLastRefreshedAt(new Date());
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [active, refreshRateSeconds, router]);

  return { active, paused, setPaused, lastRefreshedAt };
}
