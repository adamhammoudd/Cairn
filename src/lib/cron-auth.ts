import { createHash, timingSafeEqual } from "node:crypto";

// Shared Authorization check for Vercel Cron routes (src/app/api/cron/*).
// Vercel sends `Authorization: Bearer $CRON_SECRET` itself - but only when a
// CRON_SECRET env var exists on the project. When it does not, every call is
// anonymous, and the route used to answer a bare 401 and log nothing. That is
// how the beta-invite job could sit on "Last run: never" with no sign of why
// (audit 2026-10-02, item 1.7). A missing or too-short secret is now reported
// as its own state, so the route can say so and log it.

export type CronAuth = "ok" | "misconfigured" | "unauthorized";

export const MIN_CRON_SECRET_LENGTH = 16;

export function checkCronAuth(header: string | null, secret: string | undefined): CronAuth {
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) return "misconfigured";
  if (!header) return "unauthorized";
  // Hash both sides so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b) ? "ok" : "unauthorized";
}

/** Null when the caller may proceed, else the response status and a message safe to return. */
export function cronRejection(job: string, auth: CronAuth): { status: number; error: string } | null {
  if (auth === "ok") return null;
  if (auth === "misconfigured") {
    console.error(
      `[cairn] cron ${job}: CRON_SECRET is not set (or shorter than ${MIN_CRON_SECRET_LENGTH} characters) on this deployment, so Vercel cannot authenticate the job and it will never run. Set CRON_SECRET in the Vercel project's environment variables.`,
    );
    return { status: 503, error: "cron secret not configured" };
  }
  console.warn(`[cairn] cron ${job}: rejected a call without a valid Authorization header`);
  return { status: 401, error: "unauthorized" };
}
