import { buildInviteEmail } from "./email";
import { addDays, generateInviteCode, hashInviteCode, INVITE_EXPIRY_DAYS, INVITE_REMINDER_AFTER_DAYS } from "./codes";
import { newInviteSlots, type InviteJobConfig } from "./config";
import type { InviteRow, InviteStore, Mailer, SendOutcome } from "./store";

// The send-beta-invites job and the delivery step it shares with the admin
// actions. No I/O of its own: the store, the mailer and the clock are passed
// in, so the tests drive exactly this code with an in-memory store and a mock
// mailer.

/** The job stops retrying an invite the provider has refused this many times. */
export const MAX_SEND_ATTEMPTS = 5;
/** The job never emails one person more than this many times (invite + one reminder). */
export const MAX_JOB_EMAILS_PER_PERSON = 2;
const REMINDERS_PER_RUN = 50;

export interface DeliverDeps {
  store: InviteStore;
  mailer: Mailer;
  /** Site origin, e.g. https://cairn.example - the invite link is `${origin}/signup?invite=<code>`. */
  origin: string;
  /** Formatted BETA_PREMIUM_UNTIL, or null. Read from the env by the caller, never hard-coded. */
  premiumUntil: string | null;
  now: () => Date;
}

export function inviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/signup?invite=${code}`;
}

export type DeliverResult = SendOutcome | { ok: false; reason: "changed" };

/**
 * Emails an invite with a fresh code. The code exists only in this function's
 * scope and in the message handed to the mailer.
 *
 * - `fresh`: the invite was just created with this code's hash - send as is.
 * - otherwise the stored hash is swapped (compare-and-swap) for a new code
 *   first, because the database never held the old code to resend it. If the
 *   provider then refuses, the previous hash, expiry, revoked and reminded
 *   state are put back, so a link already sitting in the person's inbox keeps
 *   working and nothing is marked sent.
 */
export async function deliverInvite(
  deps: DeliverDeps,
  invite: InviteRow,
  kind: "invite" | "reminder",
  opts: { freshCode?: string; expiresAt?: Date; reissue?: boolean } = {},
): Promise<DeliverResult> {
  const { store } = deps;
  let code = opts.freshCode;
  let current = invite;

  if (!code) {
    code = generateInviteCode();
    const newHash = hashInviteCode(code);
    const expiresAt = opts.expiresAt ?? new Date(invite.expiresAt);
    const swapped = await store.rotateCode(invite.id, invite.tokenHash, newHash, {
      expiresAt,
      revokedAt: opts.reissue ? null : invite.revokedAt,
      remindedAt: opts.reissue ? null : invite.remindedAt,
    });
    if (!swapped) return { ok: false, reason: "changed" };
    current = { ...invite, tokenHash: newHash, expiresAt: expiresAt.toISOString(), revokedAt: opts.reissue ? null : invite.revokedAt };
  }

  const message = buildInviteEmail({
    kind,
    link: inviteLink(deps.origin, code),
    expiresAt: new Date(current.expiresAt),
    premiumUntil: deps.premiumUntil,
    origin: deps.origin.replace(/\/$/, ""),
  });

  let result: { sent: boolean; reason?: string };
  try {
    result = await deps.mailer(invite.email, message);
  } catch {
    result = { sent: false, reason: "mailer-threw" };
  }

  if (result.sent) {
    const outcome: SendOutcome = { ok: true, at: deps.now(), kind };
    await store.recordSend(current, outcome);
    return outcome;
  }

  if (!opts.freshCode) {
    await store.rotateCode(invite.id, current.tokenHash, invite.tokenHash, {
      expiresAt: new Date(invite.expiresAt),
      revokedAt: invite.revokedAt,
      remindedAt: invite.remindedAt,
    });
  }
  const outcome: SendOutcome = { ok: false, reason: result.reason ?? "unknown" };
  await store.recordSend(invite, outcome);
  // Invite id and a short reason only - never the address, never the code.
  console.error(`[cairn] beta-invites: ${kind} for invite ${invite.id} not sent (${outcome.reason}); left for the next run`);
  return outcome;
}

export interface JobResult {
  outcome: "disabled" | "refused-non-production" | "misconfigured" | "locked" | "ok" | "error";
  detail: Record<string, number | string>;
}

export async function runInviteJob(deps: DeliverDeps & { config: InviteJobConfig }): Promise<JobResult> {
  const { store, config } = deps;

  // Both refusals are recorded as a finished run so the admin page shows the
  // cron is firing and why it did nothing.
  const refusal: JobResult["outcome"] | null = !config.enabled
    ? "disabled"
    : !config.sendingAllowed
      ? "refused-non-production"
      : !deps.origin
        ? "misconfigured" // no NEXT_PUBLIC_SITE_URL: nowhere safe to point the link
        : null;

  const runId = await store.startRun();
  if (runId === null) return { outcome: "locked", detail: {} };

  if (refusal) {
    await store.finishRun(runId, refusal, {});
    return { outcome: refusal, detail: {} };
  }

  const detail = {
    cap: config.maxActiveUsers,
    batch: config.invitesPerRun,
    retried: 0,
    retriedSent: 0,
    activeUsers: 0,
    outstanding: 0,
    slots: 0,
    invited: 0,
    invitedSent: 0,
    reminders: 0,
    remindersSent: 0,
    failed: 0,
  };

  try {
    const now = deps.now();

    // 1. Earlier failures first: they already hold a place under the cap.
    const unsent = (await store.listUnsent(now, config.invitesPerRun)).filter(
      (i) => i.sendAttempts < MAX_SEND_ATTEMPTS && i.emailsSent < MAX_JOB_EMAILS_PER_PERSON,
    );
    for (const invite of unsent) {
      detail.retried++;
      // The person never received the earlier code, so the clock restarts.
      const r = await deliverInvite(deps, invite, "invite", { expiresAt: addDays(now, INVITE_EXPIRY_DAYS) });
      if (r.ok) detail.retriedSent++;
      else detail.failed++;
    }

    // 2. New invites, as many as the cap and the batch allow.
    const stats = await store.stats();
    detail.activeUsers = stats.activeUsers;
    detail.outstanding = stats.outstanding;
    detail.slots = newInviteSlots({
      maxActiveUsers: config.maxActiveUsers,
      invitesPerRun: config.invitesPerRun,
      activeUsers: stats.activeUsers,
      outstandingInvites: stats.outstanding,
      retriesThisRun: detail.retried,
    });

    for (const candidate of await store.nextInLine(detail.slots)) {
      const code = generateInviteCode();
      const invite = await store.createInvite(candidate.waitlistId, hashInviteCode(code), addDays(now, INVITE_EXPIRY_DAYS), "job");
      // null: this waitlist row got an invite between the read and the insert
      // (the unique waitlist_id). Never a second invite for one person.
      if (!invite) continue;
      detail.invited++;
      const r = await deliverInvite(deps, invite, "invite", { freshCode: code });
      if (r.ok) detail.invitedSent++;
      else detail.failed++;
    }

    // 3. One reminder, a week after the invite, while it is still unused.
    const due = (await store.listDueReminders(addDays(now, -INVITE_REMINDER_AFTER_DAYS), now, REMINDERS_PER_RUN)).filter(
      (i) => i.emailsSent < MAX_JOB_EMAILS_PER_PERSON && i.remindedAt === null,
    );
    for (const invite of due) {
      detail.reminders++;
      const r = await deliverInvite(deps, invite, "reminder");
      if (r.ok) detail.remindersSent++;
      else detail.failed++;
    }

    await store.finishRun(runId, "ok", detail);
    return { outcome: "ok", detail };
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "unknown";
    console.error("[cairn] beta-invites: job failed", message);
    await store.finishRun(runId, "error", { ...detail, error: message }).catch(() => {});
    return { outcome: "error", detail: { ...detail, error: message } };
  }
}
