import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Shared logic for the pre-launch waitlist. The server action
// (src/lib/actions/waitlist.ts) and the confirmation route
// (src/app/waitlist/confirm) both go through here; nothing waitlist-related
// touches the database from a client component.

export const FOUNDING_LIMIT = 50;

/**
 * Normalises the client-reported IANA timezone from the signup form into what
 * gets written to `waitlist.client_timezone`. Pure and exported so it can be
 * tested without a form or a DB.
 *
 * Returns `null` - not `""` - for anything missing, blank, or implausible, so a
 * row that never got a real value reads as "unknown" rather than as an empty
 * string. Every row before 2026-09-03 has `client_timezone = ''` because the
 * form wrote the value through a hidden `<input>` populated in a mount effect
 * and the effect's value never made it into the submitted FormData; the form
 * now stamps it at submit time and this guards the column.
 */
export function parseClientTimezone(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const tz = raw.trim();
  if (!tz || tz.length > 64) return null;
  // "Area/Location", "Area/Location/Sub", or a bare "UTC"/"GMT". Never trusted
  // for logic - this is a manual-review signal only - so the check is just a
  // sanity filter against a hand-crafted POST stuffing the column.
  if (!/^(UTC|GMT|[A-Za-z][A-Za-z_+-]*\/[A-Za-z0-9_+-]+(\/[A-Za-z0-9_+-]+)?)$/.test(tz)) return null;
  return tz;
}

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
// Provider precedence, highest priority first:
//   1. Resend HTTP API   - when RESEND_API_KEY + WAITLIST_EMAIL_FROM are set.
//                          This is the launch setup.
//   2. Gmail SMTP bridge - when GMAIL_SMTP_USER + GMAIL_SMTP_APP_PASSWORD are
//                          set. TEMPORARY - see the banner on sendViaGmailSmtp()
//                          below. Only fires when Resend is NOT configured.
//   3. Console log        - neither configured: the confirmation URL is written
//                          to the server log so local dev and pre-provider
//                          staging still work.
//
// Resend always wins when configured, so setting the real Resend vars later
// retires the Gmail bridge automatically, with no code change.
//
// BEFORE THIS PAGE GOES LIVE: configure one of the two real providers. Until
// then no one can confirm and the founding-50 list cannot be finalised.
// ---------------------------------------------------------------------------
export interface EmailResult {
  sent: boolean;
  /** Which path handled (or would have handled) this message. */
  via: "resend" | "gmail" | "none";
  reason?: string;
}

export interface ConfirmationMessage {
  subject: string;
  text: string;
  html: string;
}

const EMAIL_SUBJECT = "Confirm your spot on the Cairn waitlist";

/**
 * Resolves which sender handles a confirmation email, given the environment.
 * Pure and exported so the precedence (Resend beats the Gmail bridge beats
 * console) is unit-testable without a live send.
 */
export function selectEmailProvider(
  env: Record<string, string | undefined> = process.env,
): "resend" | "gmail" | "none" {
  if (env.RESEND_API_KEY && env.WAITLIST_EMAIL_FROM) return "resend";
  if (env.GMAIL_SMTP_USER && env.GMAIL_SMTP_APP_PASSWORD) return "gmail";
  return "none";
}

export async function sendConfirmationEmail(to: string, confirmUrl: string): Promise<EmailResult> {
  const message = buildConfirmationEmail(confirmUrl);

  switch (selectEmailProvider()) {
    case "resend":
      return sendViaResend(
        process.env.RESEND_API_KEY!,
        process.env.WAITLIST_EMAIL_FROM!,
        to,
        message,
      );
    case "gmail":
      return sendViaGmailSmtp(
        process.env.GMAIL_SMTP_USER!,
        process.env.GMAIL_SMTP_APP_PASSWORD!,
        to,
        message,
      );
    default:
      console.warn(
        `[cairn] waitlist: no email provider configured (set RESEND_API_KEY + ` +
          `WAITLIST_EMAIL_FROM for launch, or the temporary GMAIL_SMTP_* pair as a ` +
          `bridge). Confirmation link for ${to}: ${confirmUrl}`,
      );
      return { sent: false, via: "none", reason: "no-provider" };
  }
}

export function buildConfirmationEmail(confirmUrl: string): ConfirmationMessage {
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
    "Cairn is informational only - not a broker and not investment advice.",
  ].join("\n");

  return { subject: EMAIL_SUBJECT, text, html: confirmationEmailHtml(confirmUrl) };
}

/**
 * Light-background transactional template. Deliberately NOT a copy of Cairn's
 * dark product UI - a dark email renders unpredictably across clients and trips
 * spam heuristics. Table layout, inline styles, hosted PNG logo, one CTA, plain
 * copy. The button uses the exact brand accent (#2FC685) with near-black text
 * so it stays on-brand AND clears WCAG AA contrast (white-on-green would not).
 */
function confirmationEmailHtml(confirmUrl: string): string {
  const origin = safeOrigin(confirmUrl);
  const logo = `${origin}/cairn-lockup.png`;
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;">
          <tr>
            <td style="padding:32px 32px 0;">
              <img src="${logo}" alt="Cairn" width="148" height="50" style="display:block;border:0;outline:none;text-decoration:none;">
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;color:#18181b;">
              Confirm your spot on the waitlist
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#3f3f46;">
              Cairn is a pre-launch, portfolio-aware market research assistant. The app isn&rsquo;t open yet - confirming this address holds your place in line, and your founding-member status if you&rsquo;re among the first 50 to confirm.
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px;background:#2FC685;">
                    <a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#0A0A0A;text-decoration:none;border-radius:8px;">
                      Confirm my email
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#71717a;">
              Or paste this link into your browser:<br>
              <a href="${confirmUrl}" style="color:#18181b;text-decoration:underline;word-break:break-all;">${confirmUrl}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 32px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#a1a1aa;">
              If you didn&rsquo;t sign up for Cairn, ignore this email and nothing happens.<br>
              Cairn is informational only - not a broker and not investment advice.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Origin of a URL we built ourselves; falls back to the deployed site. */
function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  }
}

async function sendViaResend(
  apiKey: string,
  from: string,
  to: string,
  message: ConfirmationMessage,
): Promise<EmailResult> {
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
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!res.ok) {
      console.error(`[cairn] waitlist email send failed: ${res.status} ${await res.text()}`);
      return { sent: false, via: "resend", reason: `provider-${res.status}` };
    }
    return { sent: true, via: "resend" };
  } catch (err) {
    console.error("[cairn] waitlist email send threw", err);
    return { sent: false, via: "resend", reason: "network" };
  }
}

// ===========================================================================
// TEMPORARY - Gmail SMTP bridge. DELETE this block (and the nodemailer
// dependency, the GMAIL_SMTP_* env vars, and migration 0036's table) once a
// real domain is verified on Resend and WAITLIST_EMAIL_FROM points at it.
//
// What it does: sends waitlist confirmation email through a personal Gmail
// account over authenticated SMTP (smtp.gmail.com:587, STARTTLS), using a
// 16-character Google "app password" in GMAIL_SMTP_APP_PASSWORD - never the
// real account password.
//
// Why it is a BRIDGE and not the launch setup:
//   - Volume. A normal Gmail account is capped at ~500 messages/day; exceed it
//     and Google can suspend outbound sending on the account for up to 24h.
//     reserveGmailSlot() stops at GMAIL_SMTP_DAILY_CAP (default 400) to keep
//     headroom - it is a ceiling for a pre-launch trickle, nothing more.
//   - Deliverability. Mail leaves as the gmail.com address, not a Cairn domain.
//     There is no SPF / DKIM / DMARC alignment for Cairn, so a meaningful share
//     of these land in spam or are rejected outright by strict receivers.
//   - Reputation. Bursts of transactional mail from a consumer Gmail account is
//     precisely the pattern Google's abuse heuristics flag.
//
// The real fix is a verified sending domain on Resend (RESEND_API_KEY +
// WAITLIST_EMAIL_FROM). The instant those are set, sendConfirmationEmail()
// routes to Resend and never calls this function.
// ===========================================================================

const GMAIL_SMTP_DAILY_CAP = Number(process.env.GMAIL_SMTP_DAILY_CAP) || 400;

async function sendViaGmailSmtp(
  user: string,
  appPassword: string,
  to: string,
  message: ConfirmationMessage,
): Promise<EmailResult> {
  // Claimed BEFORE the send. If the send then throws, the slot is still spent -
  // deliberately conservative, since Gmail counts attempts too.
  const slot = await reserveGmailSlot();
  if (!slot.ok) {
    console.error(
      `[cairn] waitlist: Gmail SMTP bridge is at or over its daily cap ` +
        `(${GMAIL_SMTP_DAILY_CAP}). Confirmation email for ${to} was NOT sent. ` +
        `Configure Resend (RESEND_API_KEY + WAITLIST_EMAIL_FROM) to remove this ceiling.`,
    );
    return { sent: false, via: "gmail", reason: "daily-cap" };
  }

  try {
    // Dynamic import: nodemailer is only pulled in on the bridge path, and this
    // keeps it out of any bundle that never sends mail.
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // STARTTLS is negotiated on 587
      auth: { user, pass: appPassword },
    });
    await transport.sendMail({
      from: `Cairn <${user}>`,
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { sent: true, via: "gmail" };
  } catch (err) {
    console.error("[cairn] waitlist Gmail SMTP send threw", err);
    return { sent: false, via: "gmail", reason: "smtp-error" };
  }
}

/**
 * Atomically claims one send against today's Gmail cap (migration 0036).
 *
 * Fails CLOSED, unlike checkSignupRate() above: if we cannot read the counter
 * we assume we are near the cap and skip the send rather than risk the account.
 * The signup row is already written by this point, so the cost of a miss is a
 * delayed confirmation the user can re-request - not a lost signup.
 */
async function reserveGmailSlot(): Promise<{ ok: boolean }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("record_email_send", { p_cap: GMAIL_SMTP_DAILY_CAP });
    if (error) {
      console.error("[cairn] waitlist: could not read Gmail send counter", error);
      return { ok: false };
    }
    return { ok: data === true };
  } catch (err) {
    console.error("[cairn] waitlist: Gmail send counter threw", err);
    return { ok: false };
  }
}

/** Absolute base URL for links in the confirmation email. */
export function siteUrl(originHeader: string | null): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (originHeader) return originHeader.replace(/\/$/, "");
  return "http://localhost:3000";
}
