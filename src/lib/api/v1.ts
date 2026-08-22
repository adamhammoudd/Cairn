// Shared plumbing for the documented /api/v1 surface (roadmap Phase 11,
// "Data Export & API Layer: CSV/JSON export, documented /api/v1/... routes").
//
// Read-only on purpose. The write paths are server actions with their own
// validation and scope rules, and exposing a second, thinner way to mutate the
// same tables would mean two places for an authorization mistake to live.
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export const API_VERSION = "v1";

export interface ApiMeta {
  version: string;
  generated_at: string;
  /** Where the numbers came from, restated per response rather than assumed. */
  price_basis?: string;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Account-scoped data: never cached by a shared cache.
      "cache-control": "private, no-store",
      "x-cairn-api-version": API_VERSION,
    },
  });
}

export function meta(extra: Partial<ApiMeta> = {}): ApiMeta {
  return { version: API_VERSION, generated_at: new Date().toISOString(), ...extra };
}

export function apiError(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message }, meta: meta() }, status);
}

/**
 * Authenticate the caller from the session cookie. Deliberately not an API-key
 * scheme: issuing long-lived keys is a separate design with its own rotation,
 * scoping and revocation story, and shipping half of it would be worse than
 * saying plainly that this surface is cookie-authenticated for now.
 */
export async function requireUser(): Promise<{ user: User } | { response: Response }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      response: apiError(
        401,
        "unauthenticated",
        "This endpoint reads your account data and requires a signed-in session cookie. API keys are not issued yet.",
      ),
    };
  }
  return { user };
}

/** Clamp a `limit` query parameter into a sane range. */
export function readLimit(url: URL, fallback = 100, max = 500): number {
  const raw = Number(url.searchParams.get("limit"));
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(Math.floor(raw), max);
}
