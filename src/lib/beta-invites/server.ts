import "server-only";
import { betaPremiumUntil, formatBetaUntil } from "@/lib/billing";
import { sendEmail } from "@/lib/waitlist";
import { createSupabaseInviteStore } from "./supabase-store";
import type { DeliverDeps } from "./job";
import type { Mailer } from "./store";

// Production wiring for the job route and the admin actions: the service-role
// store, the existing waitlist mailer (Resend, then the Gmail bridge and its
// email_send_log counter), and BETA_PREMIUM_UNTIL read from the env.

const realMailer: Mailer = async (to, message) => {
  const r = await sendEmail(to, message);
  return { sent: r.sent, reason: r.reason };
};

/**
 * The origin invite links point at. Deliberately NEXT_PUBLIC_SITE_URL only -
 * no request-header fallback and no localhost default - so a cron run can
 * never email a link to a preview host or to localhost. Empty when unset; the
 * job refuses to run without it.
 */
export function inviteOrigin(env: Record<string, string | undefined> = process.env): string {
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch {
    return "";
  }
}

export function productionInviteDeps(): DeliverDeps {
  const until = betaPremiumUntil();
  return {
    store: createSupabaseInviteStore(),
    mailer: realMailer,
    origin: inviteOrigin(),
    premiumUntil: until ? formatBetaUntil(until) : null,
    now: () => new Date(),
  };
}
