import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Shared logic for the pre-launch waitlist. The server action
// (src/lib/actions/waitlist.ts) and the confirmation route
// (src/app/waitlist/confirm) both go through here; nothing waitlist-related
// touches the database from a client component.

export const FOUNDING_LIMIT = 50;

// Soft rate limit: a household or an office sharing one NAT address will
// legitimately produce two or three signups close together, so the first few
// pass. A script hammering the form produces dozens - past this many from one
// IP inside the window, the form asks them to wait rather than hard-blocking.
const RATE_LIMIT_MAX = 4;
const RATE_LIMIT_WINDOW_MINUTES = 10;

// Manual-review signal: two signups within this window that share BOTH an IP
// and a user-agent string are worth a human glance before the founding list is
// finalised. Flagged, never auto-rejected.
const CLUSTER_WINDOW_MINUTES = 60;

export interface WaitlistRow {
  id: number;
  email: string;
  email_normalized: string;
  status: "pending" | "confirmed";
  confirmation_token: string;
  waitlist_position: number | null;
  founding_member: boolean;
}

/**
 * Real number of founding-member places left. Never padded, never fabricated -
 * this is the confirmed founding-member count subtracted from the cap. Returns
 * FOUNDING_LIMIT when the table is empty and 0 once it is full. Falls back to
 * `null` (render nothing) if the count can't be read, rather than guessing.
 */
export async function foundingSlotsRemaining(): Promise<number | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("waitlist_founding_slots_remaining");
    if (error || typeof data !== "number") return null;
    return data;
  } catch {
    return null;
  }
}

export interface RateVerdict {
  allowed: boolean;
  message?: string;
}

/**
 * Counts this IP's signups in the recent window. Fails OPEN: a transient DB
 * error must not wall off a legitimate signup on a pre-launch marketing page.
 */
export async function checkSignupRate(ip: string | null): Promise<RateVerdict> {
  if (!ip) return { allowed: true };
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
    const { count } = await admin
      .from("waitlist")
      .select("*", { count: "exact", head: true })
      .eq("signup_ip", ip)
      .gte("created_at", since);

    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      return {
        allowed: false,
        message: "We've had a lot of signups from your network. Give it a few minutes and try again.",
      };
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

/**
 * Flags this row - and any it clusters with - for manual review when another
 * recent signup shares the same IP *and* the same user agent. Best-effort:
 * a failure here is logged and swallowed, never surfaced to the signup.
 */
export async function flagIfClustered(
  rowId: number,
  ip: string | null,
  userAgent: string | null,
): Promise<void> {
  if (!ip || !userAgent) return;
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - CLUSTER_WINDOW_MINUTES * 60_000).toISOString();
    const { data: siblings } = await admin
      .from("waitlist")
      .select("id")
      .eq("signup_ip", ip)
      .eq("user_agent", userAgent)
      .gte("created_at", since);

    const ids = (siblings ?? []).map((r) => r.id);
    if (ids.length > 1) {
      await admin.from("waitlist").update({ review_flag: true }).in("id", ids);
    }
  } catch (err) {
    console.error("[cairn] waitlist cluster-flag failed", err);
  }
}

// ---------------------------------------------------------------------------
// Confirmation email.
//
// There is no email provider wired into this project yet (see
// supabase/README.md - alert `email` deliveries are written `unconfigured` for
// the same reason). This sends via Resend's HTTP API when RESEND_API_KEY and
// WAITLIST_EMAIL_FROM are set, and otherwise logs the confirmation URL to the
// server console so local testing and pre-provider staging still work.
//
// BEFORE THIS PAGE GOES LIVE: set both env vars. Until then, no one can
// confirm, so the founding-50 list cannot be finalised.
// ---------------------------------------------------------------------------
export interface EmailResult {
  sent: boolean;
  reason?: string;
}

export async function sendConfirmationEmail(to: string, confirmUrl: string): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.WAITLIST_EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn(
      `[cairn] waitlist: no email provider configured (set RESEND_API_KEY + WAITLIST_EMAIL_FROM). ` +
        `Confirmation link for ${to}: ${confirmUrl}`,
    );
    return { sent: false, reason: "no-provider" };
  }

  const text = [
    "Confirm your spot on the Cairn waitlist.",
    "",
    "Cairn is a pre-launch, portfolio-aware market research assistant. The app",
    "is not open yet - confirming this address holds your place in line, and",
    "your founding-member status if you're among the first 50 to confirm.",
    "",
    confirmUrl,
    "",
    "If you didn't sign up, ignore this email and nothing happens.",
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: "Confirm your spot on the Cairn waitlist",
        text,
      }),
    });
    if (!res.ok) {
      console.error(`[cairn] waitlist email send failed: ${res.status} ${await res.text()}`);
      return { sent: false, reason: `provider-${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error("[cairn] waitlist email send threw", err);
    return { sent: false, reason: "network" };
  }
}

/** Absolute base URL for links in the confirmation email. */
export function siteUrl(originHeader: string | null): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (originHeader) return originHeader.replace(/\/$/, "");
  return "http://localhost:3000";
}
