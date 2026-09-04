// Fixed-window in-memory rate limiter.
//
// Per server instance. On serverless the effective ceiling is therefore
// (warm instances x limit), which is the right trade here: the threat this
// addresses (audit 2026-09-04 #12) is ONE session looping /api/chat to drain
// the shared daily model budget for everyone - and that session's requests
// land on a small number of warm instances. It is deliberately not a
// distributed limiter; if abuse ever arrives from many IPs at once, that needs
// an edge/WAF rule, not this.
//
// No dependency, no schema, no external store - which is why it is in-memory.

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window resets - for a Retry-After header. */
  retryAfterSec: number;
  /** Requests left in the current window (0 when blocked). */
  remaining: number;
}

/**
 * Consume one unit against `key`. Returns `allowed: false` once `limit`
 * requests have been made inside the current `windowMs`.
 */
export function rateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  const existing = windows.get(key);

  if (!existing || now >= existing.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0, remaining: limit - 1 };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)), remaining: 0 };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSec: 0, remaining: limit - existing.count };
}

/** Drop expired windows. Called opportunistically so the Map cannot grow without bound. */
export function sweepRateLimits(now: number = Date.now()): void {
  for (const [key, w] of windows) {
    if (now >= w.resetAt) windows.delete(key);
  }
}

/** Test-only: forget all windows. */
export function _resetRateLimits(): void {
  windows.clear();
}
