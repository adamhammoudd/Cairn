"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-role";
import { readInviteJobConfig } from "@/lib/beta-invites/config";
import { adminResend, adminRevoke, adminSendNow, type AdminResult } from "@/lib/beta-invites/admin-actions";
import { productionInviteDeps } from "@/lib/beta-invites/server";
import type { Candidate, InviteStats, RunRecord } from "@/lib/beta-invites/store";

// Admin page for beta invites (/admin/invites). Every export re-checks the
// admin role on its own: a server action is a public POST endpoint, so the
// page's gate is not enough. Read-mostly - no bulk delete, no export.

async function currentAdminId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return (await isAdminUser(supabase, user.id)) ? user.id : null;
}

export interface InviteListItem {
  id: number;
  waitlistId: number;
  email: string;
  position: number | null;
  status: "claimed" | "revoked" | "expired" | "pending" | "unsent";
  emailedAt: string | null;
  expiresAt: string;
  emailsSent: number;
  lastSendError: string | null;
}

export interface BetaInviteAdminView {
  stats: InviteStats;
  lastRun: RunRecord | null;
  nextInLine: Candidate[];
  invites: InviteListItem[];
  config: { enabled: boolean; maxActiveUsers: number; invitesPerRun: number; sendingAllowed: boolean };
}

export async function getBetaInviteAdminView(): Promise<BetaInviteAdminView | null> {
  if (!(await currentAdminId())) return null;
  const { store } = productionInviteDeps();
  const [stats, lastRun, nextInLine] = await Promise.all([store.stats(), store.lastRun(), store.nextInLine(5)]);

  const db = createAdminClient();
  const { data: rows } = await db
    .from("beta_invites")
    .select("id, waitlist_id, emailed_at, expires_at, claimed_at, revoked_at, emails_sent, last_send_error")
    .order("created_at", { ascending: false })
    .limit(50);
  const ids = (rows ?? []).map((r) => r.waitlist_id);
  const { data: people } = ids.length
    ? await db.from("waitlist").select("id, email, waitlist_position").in("id", ids)
    : { data: [] };
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  const now = Date.now();

  const invites: InviteListItem[] = (rows ?? []).map((r) => ({
    id: r.id,
    waitlistId: r.waitlist_id,
    email: byId.get(r.waitlist_id)?.email ?? "",
    position: byId.get(r.waitlist_id)?.waitlist_position ?? null,
    status: r.claimed_at
      ? "claimed"
      : r.revoked_at
        ? "revoked"
        : new Date(r.expires_at).getTime() <= now
          ? "expired"
          : r.emailed_at
            ? "pending"
            : "unsent",
    emailedAt: r.emailed_at,
    expiresAt: r.expires_at,
    emailsSent: r.emails_sent,
    lastSendError: r.last_send_error,
  }));

  const c = readInviteJobConfig();
  return {
    stats,
    lastRun,
    nextInLine,
    invites,
    config: { enabled: c.enabled, maxActiveUsers: c.maxActiveUsers, invitesPerRun: c.invitesPerRun, sendingAllowed: c.sendingAllowed },
  };
}

function idFrom(formData: FormData, key: string): number | null {
  const n = Number(formData.get(key));
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function run(fn: (actor: string) => Promise<AdminResult>): Promise<AdminResult> {
  const actor = await currentAdminId();
  if (!actor) return { ok: false, message: "Not allowed." };
  const result = await fn(actor);
  revalidatePath("/admin/invites");
  return result;
}

function adminDeps() {
  return { ...productionInviteDeps(), sendingAllowed: readInviteJobConfig().sendingAllowed };
}

export async function sendInviteNowAction(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const waitlistId = idFrom(formData, "waitlistId");
  if (!waitlistId) return { ok: false, message: "Missing waitlist entry." };
  return run((actor) => adminSendNow(adminDeps(), actor, waitlistId));
}

export async function resendInviteAction(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const inviteId = idFrom(formData, "inviteId");
  if (!inviteId) return { ok: false, message: "Missing invite." };
  return run((actor) => adminResend(adminDeps(), actor, inviteId));
}

export async function revokeInviteAction(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const inviteId = idFrom(formData, "inviteId");
  if (!inviteId) return { ok: false, message: "Missing invite." };
  return run((actor) => adminRevoke(adminDeps(), actor, inviteId));
}
