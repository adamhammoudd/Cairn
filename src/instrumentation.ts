// Runs once when the server starts. Checks configuration that must exist for
// the app to be safe to serve, so a missing value stops the deploy loudly
// instead of surfacing as a degraded sign-in later (audit 2026-10-02, item 2.4).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Only where real traffic is served. `next build` and local dev are not blocked.
  const serving = process.env.VERCEL_ENV ? process.env.VERCEL_ENV === "production" : process.env.NODE_ENV === "production";
  if (!serving) return;
  const { requireAuthHashSalt } = await import("@/lib/auth-rate-limit");
  requireAuthHashSalt();
}
