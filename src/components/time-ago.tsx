"use client";

import { useEffect, useState } from "react";

export function formatTimeAgo(ms: number) {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Relative timestamps drift between the SSR render and hydration (different minute -> mismatch).
 * Keep the server's text through hydration, then resync to the client clock on mount.
 */
export function TimeAgo({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  // ponytail: one 30s tick per timestamp; swap for a shared store if a page ever renders hundreds.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return <span suppressHydrationWarning>{formatTimeAgo(now - new Date(iso).getTime())}</span>;
}
