// What the invite job, the sign-up claim and the admin page need from the
// database. The production implementation (supabase-store.ts) is service-role
// only; the tests run the same orchestration against an in-memory store and a
// mock mailer, so no test can send mail or create an account.

export interface InviteRow {
  id: number;
  waitlistId: number;
  /** waitlist.email - the address as typed, for the To: line. */
  email: string;
  /** waitlist.email_normalized - what sign-up is checked against. */
  emailNormalized: string;
  tokenHash: string;
  createdAt: string;
  emailedAt: string | null;
  expiresAt: string;
  remindedAt: string | null;
  emailsSent: number;
  sendAttempts: number;
  claimStartedAt: string | null;
  claimedAt: string | null;
  revokedAt: string | null;
}

export interface Candidate {
  waitlistId: number;
  email: string;
  position: number | null;
  founding: boolean;
}

export interface InviteStats {
  confirmedWaitlist: number;
  sent: number;
  claimed: number;
  expired: number;
  revoked: number;
  /** Emailed, usable, not yet used. */
  pending: number;
  /** Created but the provider has not accepted it yet (failed send awaiting retry). */
  unsent: number;
  /** Every invite still holding a place under the cap (pending + unsent). */
  outstanding: number;
  activeUsers: number;
}

export interface RunRecord {
  startedAt: string;
  finishedAt: string | null;
  outcome: string | null;
  detail: Record<string, unknown>;
}

export type SendOutcome =
  | { ok: true; at: Date; kind: "invite" | "reminder" }
  | { ok: false; reason: string };

export interface InviteStore {
  // ---- job ----
  /** Takes the run lock; null when another run is in progress. */
  startRun(): Promise<number | null>;
  finishRun(runId: number, outcome: string, detail: Record<string, number | string>): Promise<void>;
  lastRun(): Promise<RunRecord | null>;
  stats(): Promise<InviteStats>;
  nextInLine(limit: number): Promise<Candidate[]>;
  /** Created, never accepted by the provider, still usable - oldest first. */
  listUnsent(now: Date, limit: number): Promise<InviteRow[]>;
  /** Emailed at or before `cutoff`, never reminded, unclaimed, usable. */
  listDueReminders(cutoff: Date, now: Date, limit: number): Promise<InviteRow[]>;
  /** Inserts the invite; null when that waitlist row already has one. */
  createInvite(waitlistId: number, tokenHash: string, expiresAt: Date, source: "job" | "admin"): Promise<InviteRow | null>;
  /**
   * Compare-and-swap the code hash on an unclaimed invite with no live claim
   * reservation. False when the row changed underneath (claimed, reserved, or
   * already rotated by someone else) - the caller must not send.
   */
  rotateCode(
    inviteId: number,
    expectedHash: string,
    newHash: string,
    set: { expiresAt: Date; revokedAt: string | null; remindedAt: string | null },
  ): Promise<boolean>;
  /** Records a provider result. Only `ok: true` sets emailed_at / reminded_at. */
  recordSend(invite: InviteRow, outcome: SendOutcome): Promise<void>;

  // ---- sign-up ----
  findByHash(tokenHash: string): Promise<InviteRow | null>;
  /** The atomic reservation (migration 0064 beta_invite_begin_claim). */
  beginClaim(tokenHash: string, email: string): Promise<{ inviteId: number; email: string } | null>;
  finishClaim(inviteId: number, userId: string): Promise<boolean>;
  abortClaim(inviteId: number): Promise<void>;

  // ---- admin ----
  getInvite(inviteId: number): Promise<InviteRow | null>;
  getInviteForWaitlist(waitlistId: number): Promise<InviteRow | null>;
  getConfirmedWaitlistRow(waitlistId: number): Promise<Candidate | null>;
  revoke(inviteId: number, now: Date): Promise<boolean>;
  audit(entry: {
    actor: string;
    action: "send_now" | "revoke" | "resend";
    inviteId: number | null;
    waitlistId: number | null;
    outcome: string;
  }): Promise<void>;
}

/** What the job and the admin actions send mail through. */
export type Mailer = (
  to: string,
  message: { subject: string; text: string; html: string },
) => Promise<{ sent: boolean; reason?: string }>;
