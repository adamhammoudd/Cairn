import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import type { Candidate, InviteRow, InviteStats, InviteStore, RunRecord, SendOutcome } from "./store";

// Service-role implementation of InviteStore over the migration 0064 tables.
// Every table here has RLS on with no policies; nothing in this file is
// reachable from a client component (server-only above).

type Row = Database["public"]["Tables"]["beta_invites"]["Row"];

const CLAIM_RESERVATION_MINUTES = 5;

function toInvite(row: Row, email: { email: string; email_normalized: string } | undefined): InviteRow {
  return {
    id: row.id,
    waitlistId: row.waitlist_id,
    email: email?.email ?? "",
    emailNormalized: email?.email_normalized ?? "",
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    emailedAt: row.emailed_at,
    expiresAt: row.expires_at,
    remindedAt: row.reminded_at,
    emailsSent: row.emails_sent,
    sendAttempts: row.send_attempts,
    claimStartedAt: row.claim_started_at,
    claimedAt: row.claimed_at,
    revokedAt: row.revoked_at,
  };
}

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`beta-invites: ${what} failed${error ? `: ${error.message}` : ""}`);
}

export function createSupabaseInviteStore(): InviteStore {
  const db = createAdminClient();

  async function withEmails(rows: Row[]): Promise<InviteRow[]> {
    if (rows.length === 0) return [];
    const { data, error } = await db
      .from("waitlist")
      .select("id, email, email_normalized")
      .in("id", rows.map((r) => r.waitlist_id));
    if (error) fail("waitlist email read", error);
    const byId = new Map((data ?? []).map((w) => [w.id, w]));
    return rows.map((r) => toInvite(r, byId.get(r.waitlist_id)));
  }

  async function one(query: PromiseLike<{ data: Row | null; error: { message: string } | null }>): Promise<InviteRow | null> {
    const { data, error } = await query;
    if (error) fail("invite read", error);
    return data ? (await withEmails([data]))[0] : null;
  }

  const reservationCutoff = () => new Date(Date.now() - CLAIM_RESERVATION_MINUTES * 60_000).toISOString();

  return {
    async startRun() {
      const { data, error } = await db.rpc("beta_invite_start_run");
      if (error) fail("start run", error);
      return typeof data === "number" ? data : null;
    },

    async finishRun(runId, outcome, detail) {
      const { error } = await db
        .from("beta_invite_runs")
        .update({ finished_at: new Date().toISOString(), outcome, detail })
        .eq("id", runId);
      if (error) fail("finish run", error);
    },

    async lastRun(): Promise<RunRecord | null> {
      const { data, error } = await db
        .from("beta_invite_runs")
        .select("started_at, finished_at, outcome, detail")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) fail("last run", error);
      return data ? { startedAt: data.started_at, finishedAt: data.finished_at, outcome: data.outcome, detail: data.detail } : null;
    },

    async stats(): Promise<InviteStats> {
      const { data, error } = await db.rpc("beta_invite_stats");
      const s = Array.isArray(data) ? data[0] : null;
      if (error || !s) fail("stats", error);
      return {
        confirmedWaitlist: s.confirmed_waitlist,
        sent: s.sent,
        claimed: s.claimed,
        expired: s.expired,
        revoked: s.revoked,
        pending: s.pending,
        unsent: s.unsent,
        outstanding: s.outstanding,
        activeUsers: s.active_users,
      };
    },

    async nextInLine(limit): Promise<Candidate[]> {
      if (limit <= 0) return [];
      const { data, error } = await db.rpc("beta_invite_next_in_line", { p_limit: limit });
      if (error) fail("next in line", error);
      return (data ?? []).map((r) => ({
        waitlistId: r.waitlist_id,
        email: r.email,
        position: r.waitlist_position,
        founding: r.founding_member,
      }));
    },

    async listUnsent(now, limit) {
      if (limit <= 0) return [];
      const { data, error } = await db
        .from("beta_invites")
        .select("*")
        .is("emailed_at", null)
        .is("claimed_at", null)
        .is("revoked_at", null)
        .gt("expires_at", now.toISOString())
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) fail("list unsent", error);
      return withEmails(data ?? []);
    },

    async listDueReminders(cutoff, now, limit) {
      const { data, error } = await db
        .from("beta_invites")
        .select("*")
        .not("emailed_at", "is", null)
        .lte("emailed_at", cutoff.toISOString())
        .is("reminded_at", null)
        .is("claimed_at", null)
        .is("revoked_at", null)
        .gt("expires_at", now.toISOString())
        .lt("emails_sent", 2)
        .order("emailed_at", { ascending: true })
        .limit(limit);
      if (error) fail("list reminders", error);
      return withEmails(data ?? []);
    },

    async createInvite(waitlistId, tokenHash, expiresAt, source) {
      const { data, error } = await db
        .from("beta_invites")
        .insert({ waitlist_id: waitlistId, token_hash: tokenHash, expires_at: expiresAt.toISOString(), source })
        .select("*")
        .single();
      if (error?.code === "23505") return null; // this waitlist row already has an invite
      if (error || !data) fail("create invite", error);
      return (await withEmails([data]))[0];
    },

    async rotateCode(inviteId, expectedHash, newHash, set) {
      const { data, error } = await db
        .from("beta_invites")
        .update({
          token_hash: newHash,
          expires_at: set.expiresAt.toISOString(),
          revoked_at: set.revokedAt,
          reminded_at: set.remindedAt,
        })
        .eq("id", inviteId)
        .eq("token_hash", expectedHash)
        .is("claimed_at", null)
        .or(`claim_started_at.is.null,claim_started_at.lt.${reservationCutoff()}`)
        .select("id");
      if (error) fail("rotate code", error);
      return (data ?? []).length === 1;
    },

    async recordSend(invite, outcome: SendOutcome) {
      const update: Database["public"]["Tables"]["beta_invites"]["Update"] = outcome.ok
        ? {
            ...(outcome.kind === "reminder" ? { reminded_at: outcome.at.toISOString() } : { emailed_at: outcome.at.toISOString() }),
            emails_sent: invite.emailsSent + 1,
            send_attempts: invite.sendAttempts + 1,
            last_send_error: null,
          }
        : { send_attempts: invite.sendAttempts + 1, last_send_error: outcome.reason.slice(0, 80) };
      const { error } = await db.from("beta_invites").update(update).eq("id", invite.id);
      if (error) fail("record send", error);
    },

    async findByHash(tokenHash) {
      return one(db.from("beta_invites").select("*").eq("token_hash", tokenHash).maybeSingle());
    },

    async beginClaim(tokenHash, email) {
      const { data, error } = await db.rpc("beta_invite_begin_claim", { p_token_hash: tokenHash, p_email: email });
      if (error) fail("begin claim", error);
      const row = Array.isArray(data) ? data[0] : null;
      return row ? { inviteId: row.invite_id, email: row.email } : null;
    },

    async finishClaim(inviteId, userId) {
      const { data, error } = await db.rpc("beta_invite_finish_claim", { p_invite_id: inviteId, p_user_id: userId });
      if (error) {
        console.error("[cairn] beta-invites: finish claim failed", error.message);
        return false;
      }
      return data === true;
    },

    async abortClaim(inviteId) {
      const { error } = await db.rpc("beta_invite_abort_claim", { p_invite_id: inviteId });
      if (error) console.error("[cairn] beta-invites: abort claim failed", error.message);
    },

    async getInvite(inviteId) {
      return one(db.from("beta_invites").select("*").eq("id", inviteId).maybeSingle());
    },

    async getInviteForWaitlist(waitlistId) {
      return one(db.from("beta_invites").select("*").eq("waitlist_id", waitlistId).maybeSingle());
    },

    async getConfirmedWaitlistRow(waitlistId) {
      const { data, error } = await db
        .from("waitlist")
        .select("id, email, waitlist_position, founding_member")
        .eq("id", waitlistId)
        .eq("status", "confirmed")
        .maybeSingle();
      if (error) fail("waitlist read", error);
      return data ? { waitlistId: data.id, email: data.email, position: data.waitlist_position, founding: data.founding_member } : null;
    },

    async revoke(inviteId, now) {
      const { data, error } = await db
        .from("beta_invites")
        .update({ revoked_at: now.toISOString() })
        .eq("id", inviteId)
        .is("claimed_at", null)
        .is("revoked_at", null)
        .select("id");
      if (error) fail("revoke", error);
      return (data ?? []).length === 1;
    },

    async audit(entry) {
      const { error } = await db.from("beta_invite_audit").insert({
        actor: entry.actor,
        action: entry.action,
        invite_id: entry.inviteId,
        waitlist_id: entry.waitlistId,
        outcome: entry.outcome,
      });
      // An admin action without its audit row is not acceptable - surface it.
      if (error) fail("audit insert", error);
    },
  };
}
