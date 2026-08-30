"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateEmail } from "@/lib/validation";
import {
  checkSignupRate,
  flagIfClustered,
  sendConfirmationEmail,
  siteUrl,
  type WaitlistRow,
} from "@/lib/waitlist";

// State returned to the client form (useActionState). A discriminated union
// rather than a bare error string, because a successful signup has a rendered
// state of its own - the form is replaced by a "check your email" panel, or by
// the standing status of an address that had already signed up.
export type JoinState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "pending"; email: string; resent: boolean; emailDelivered: boolean }
  | { status: "already-confirmed"; position: number | null; founding: boolean };

// Same forwarded-header handling as the auth actions: behind a proxy the
// socket address is the proxy's, so the first entry of x-forwarded-for is the
// only thing that identifies the caller.
async function requestSignals(): Promise<{ ip: string | null; userAgent: string | null; origin: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]?.trim() || null : h.get("x-real-ip");
  return { ip, userAgent: h.get("user-agent"), origin: h.get("origin") };
}

export async function joinWaitlist(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const emailCheck = validateEmail(formData.get("email"));
  if (!emailCheck.ok) return { status: "error", message: emailCheck.error ?? "Enter a valid email address." };
  const email = emailCheck.value; // already trimmed + lower-cased

  // The client sends its IANA timezone (e.g. "Europe/London") purely as a
  // manual-review signal. It is never trusted for anything and is capped so a
  // hand-crafted POST can't stuff the column.
  const tzRaw = formData.get("tz");
  const clientTimezone = typeof tzRaw === "string" && tzRaw.length <= 64 ? tzRaw : null;

  const { ip, userAgent, origin } = await requestSignals();

  const rate = await checkSignupRate(ip);
  if (!rate.allowed) return { status: "error", message: rate.message ?? "Please try again in a few minutes." };

  const admin = createAdminClient();

  const { data: inserted, error } = await admin
    .from("waitlist")
    .insert({
      email,
      email_normalized: email,
      signup_ip: ip,
      user_agent: userAgent ? userAgent.slice(0, 500) : null,
      client_timezone: clientTimezone,
    })
    .select("id, email, email_normalized, status, confirmation_token, waitlist_position, founding_member")
    .single<WaitlistRow>();

  const row = inserted;

  if (error) {
    // 23505 = unique_violation on email_normalized: this address already signed
    // up. Not an error state for the user - resolve it to something honest.
    if (error.code === "23505") {
      const { data: existing } = await admin
        .from("waitlist")
        .select("id, email, email_normalized, status, confirmation_token, waitlist_position, founding_member")
        .eq("email_normalized", email)
        .single<WaitlistRow>();

      if (!existing) return { status: "error", message: "Something went wrong. Try again in a moment." };

      if (existing.status === "confirmed") {
        return {
          status: "already-confirmed",
          position: existing.waitlist_position,
          founding: existing.founding_member,
        };
      }

      // Still pending: re-send the same confirmation link rather than minting a
      // second row or a second token.
      const confirmUrl = `${siteUrl(origin)}/waitlist/confirm?token=${existing.confirmation_token}`;
      const delivery = await sendConfirmationEmail(existing.email, confirmUrl);
      return { status: "pending", email: existing.email, resent: true, emailDelivered: delivery.sent };
    }

    console.error("[cairn] waitlist insert failed", error);
    return { status: "error", message: "Something went wrong. Try again in a moment." };
  }

  if (!row) return { status: "error", message: "Something went wrong. Try again in a moment." };

  await flagIfClustered(row.id, ip, userAgent);

  const confirmUrl = `${siteUrl(origin)}/waitlist/confirm?token=${row.confirmation_token}`;
  const delivery = await sendConfirmationEmail(row.email, confirmUrl);

  return { status: "pending", email: row.email, resent: false, emailDelivered: delivery.sent };
}
