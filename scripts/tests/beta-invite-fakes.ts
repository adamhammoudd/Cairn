// In-memory InviteStore + mock mailer for the beta-invite tests and the dry
// run. Mirrors the SQL in migration 0064: unique waitlist_id, the conditional
// UPDATEs behind beginClaim / rotateCode / revoke, the cap counts. Every
// conditional write is a single synchronous step after an await, which is how
// a row-locked UPDATE behaves to two concurrent callers: both reach it, one
// wins, the other sees the winner's row.

import type { Candidate, InviteRow, InviteStats, InviteStore, Mailer, RunRecord, SendOutcome } from "@/lib/beta-invites/store";

export interface FakeWaitlist {
  id: number;
  email: string;
  status: "pending" | "confirmed";
  position: number | null;
  founding: boolean;
}

interface Stored extends Omit<InviteRow, "email" | "emailNormalized"> {
  claimedBy: string | null;
  source: "job" | "admin";
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export function createFakeStore(clock: { now: Date }) {
  const waitlist: FakeWaitlist[] = [];
  const invites: Stored[] = [];
  const runs: (RunRecord & { id: number })[] = [];
  const audits: { actor: string; action: string; inviteId: number | null; waitlistId: number | null; outcome: string }[] = [];
  /** user id -> last sign-in, for the active-user count. */
  const signIns = new Map<string, Date>();
  let nextId = 1;

  const nowMs = () => clock.now.getTime();
  const usable = (i: Stored) => !i.claimedAt && !i.revokedAt && new Date(i.expiresAt).getTime() > nowMs();
  const reservationLive = (i: Stored) => i.claimStartedAt !== null && new Date(i.claimStartedAt).getTime() >= nowMs() - 5 * 60_000;
  const view = (i: Stored): InviteRow => {
    const w = waitlist.find((x) => x.id === i.waitlistId)!;
    return {
      id: i.id, waitlistId: i.waitlistId, tokenHash: i.tokenHash, createdAt: i.createdAt, emailedAt: i.emailedAt,
      expiresAt: i.expiresAt, remindedAt: i.remindedAt, emailsSent: i.emailsSent, sendAttempts: i.sendAttempts,
      claimStartedAt: i.claimStartedAt, claimedAt: i.claimedAt, revokedAt: i.revokedAt,
      email: w.email, emailNormalized: w.email.trim().toLowerCase(),
    };
  };

  const store: InviteStore = {
    async startRun() {
      await tick();
      for (const r of runs) if (!r.finishedAt && new Date(r.startedAt).getTime() < nowMs() - 15 * 60_000) Object.assign(r, { finishedAt: clock.now.toISOString(), outcome: "abandoned" });
      if (runs.some((r) => !r.finishedAt)) return null;
      const id = nextId++;
      runs.push({ id, startedAt: clock.now.toISOString(), finishedAt: null, outcome: null, detail: {} });
      return id;
    },
    async finishRun(runId, outcome, detail) {
      const r = runs.find((x) => x.id === runId)!;
      Object.assign(r, { finishedAt: clock.now.toISOString(), outcome, detail });
    },
    async lastRun() {
      const r = runs[runs.length - 1];
      return r ? { startedAt: r.startedAt, finishedAt: r.finishedAt, outcome: r.outcome, detail: r.detail } : null;
    },
    async stats(): Promise<InviteStats> {
      const since = nowMs() - 30 * 86_400_000;
      const active = new Set<string>();
      for (const i of invites) if (i.claimedBy && new Date(i.claimedAt!).getTime() > since) active.add(i.claimedBy);
      for (const [u, at] of signIns) if (at.getTime() > since) active.add(u);
      const live = invites.filter(usable);
      return {
        confirmedWaitlist: waitlist.filter((w) => w.status === "confirmed").length,
        sent: invites.filter((i) => i.emailedAt).length,
        claimed: invites.filter((i) => i.claimedAt).length,
        expired: invites.filter((i) => !i.claimedAt && !i.revokedAt && new Date(i.expiresAt).getTime() <= nowMs()).length,
        revoked: invites.filter((i) => !i.claimedAt && i.revokedAt).length,
        pending: live.filter((i) => i.emailedAt).length,
        unsent: live.filter((i) => !i.emailedAt).length,
        outstanding: live.length,
        activeUsers: active.size,
      };
    },
    async nextInLine(limit): Promise<Candidate[]> {
      return waitlist
        .filter((w) => w.status === "confirmed" && !invites.some((i) => i.waitlistId === w.id))
        .sort((a, b) => Number(b.founding) - Number(a.founding) || (a.position ?? 1e9) - (b.position ?? 1e9) || a.id - b.id)
        .slice(0, Math.max(limit, 0))
        .map((w) => ({ waitlistId: w.id, email: w.email, position: w.position, founding: w.founding }));
    },
    async listUnsent(now, limit) {
      return invites.filter((i) => !i.emailedAt && usable(i)).slice(0, Math.max(limit, 0)).map(view);
    },
    async listDueReminders(cutoff, now, limit) {
      return invites
        .filter((i) => i.emailedAt && new Date(i.emailedAt).getTime() <= cutoff.getTime() && !i.remindedAt && usable(i) && i.emailsSent < 2)
        .slice(0, limit)
        .map(view);
    },
    async createInvite(waitlistId, tokenHash, expiresAt, source) {
      await tick();
      if (invites.some((i) => i.waitlistId === waitlistId || i.tokenHash === tokenHash)) return null;
      const row: Stored = {
        id: nextId++,
        waitlistId,
        tokenHash,
        createdAt: clock.now.toISOString(),
        emailedAt: null,
        expiresAt: expiresAt.toISOString(),
        remindedAt: null,
        emailsSent: 0,
        sendAttempts: 0,
        claimStartedAt: null,
        claimedAt: null,
        revokedAt: null,
        claimedBy: null,
        source,
      };
      invites.push(row);
      return view(row);
    },
    async rotateCode(inviteId, expectedHash, newHash, set) {
      await tick();
      const i = invites.find((x) => x.id === inviteId);
      if (!i || i.tokenHash !== expectedHash || i.claimedAt || reservationLive(i)) return false;
      Object.assign(i, { tokenHash: newHash, expiresAt: set.expiresAt.toISOString(), revokedAt: set.revokedAt, remindedAt: set.remindedAt });
      return true;
    },
    async recordSend(invite, outcome: SendOutcome) {
      const i = invites.find((x) => x.id === invite.id)!;
      if (outcome.ok) {
        if (outcome.kind === "reminder") i.remindedAt = outcome.at.toISOString();
        else i.emailedAt = outcome.at.toISOString();
        i.emailsSent = invite.emailsSent + 1;
      }
      i.sendAttempts = invite.sendAttempts + 1;
    },
    async findByHash(tokenHash) {
      const i = invites.find((x) => x.tokenHash === tokenHash);
      return i ? view(i) : null;
    },
    async beginClaim(tokenHash, email) {
      await tick();
      const i = invites.find((x) => x.tokenHash === tokenHash);
      if (!i) return null;
      const w = waitlist.find((x) => x.id === i.waitlistId)!;
      if (w.email.trim().toLowerCase() !== email.trim().toLowerCase() || !usable(i) || reservationLive(i)) return null;
      i.claimStartedAt = clock.now.toISOString();
      return { inviteId: i.id, email: w.email.trim().toLowerCase() };
    },
    async finishClaim(inviteId, userId) {
      await tick();
      const i = invites.find((x) => x.id === inviteId);
      if (!i || i.claimedAt || !i.claimStartedAt) return false;
      Object.assign(i, { claimedAt: clock.now.toISOString(), claimedBy: userId });
      return true;
    },
    async abortClaim(inviteId) {
      const i = invites.find((x) => x.id === inviteId);
      if (i && !i.claimedAt) i.claimStartedAt = null;
    },
    async getInvite(inviteId) {
      const i = invites.find((x) => x.id === inviteId);
      return i ? view(i) : null;
    },
    async getInviteForWaitlist(waitlistId) {
      const i = invites.find((x) => x.waitlistId === waitlistId);
      return i ? view(i) : null;
    },
    async getConfirmedWaitlistRow(waitlistId) {
      const w = waitlist.find((x) => x.id === waitlistId && x.status === "confirmed");
      return w ? { waitlistId: w.id, email: w.email, position: w.position, founding: w.founding } : null;
    },
    async revoke(inviteId, now) {
      await tick();
      const i = invites.find((x) => x.id === inviteId);
      if (!i || i.claimedAt || i.revokedAt) return false;
      i.revokedAt = now.toISOString();
      return true;
    },
    async audit(entry) {
      audits.push(entry);
    },
  };

  return {
    store,
    waitlist,
    invites,
    runs,
    audits,
    signIns,
    /** Adds a waitlist row; confirmed rows get the next position (first 50 founding). */
    join(email: string, confirmed = true): FakeWaitlist {
      const position = confirmed ? waitlist.filter((w) => w.status === "confirmed").length + 1 : null;
      const row: FakeWaitlist = { id: nextId++, email, status: confirmed ? "confirmed" : "pending", position, founding: position !== null && position <= 50 };
      waitlist.push(row);
      return row;
    },
    confirm(row: FakeWaitlist) {
      row.status = "confirmed";
      row.position = waitlist.filter((w) => w.status === "confirmed").length;
      row.founding = row.position <= 50;
    },
  };
}

export interface SentMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Captures every message instead of sending it. `fail` makes the next N sends refuse. */
export function createMockMailer() {
  const sent: SentMail[] = [];
  const state = { failNext: 0, attempts: 0 };
  const mailer: Mailer = async (to, message) => {
    state.attempts++;
    await tick();
    if (state.failNext > 0) {
      state.failNext--;
      return { sent: false, reason: "provider-503" };
    }
    sent.push({ to, ...message });
    return { sent: true };
  };
  return { mailer, sent, state };
}

/** Pulls the invite code out of a captured email's link. */
export function codeFrom(mail: SentMail): string | null {
  return mail.text.match(/\/signup\?invite=([A-Za-z0-9_-]+)/)?.[1] ?? null;
}
