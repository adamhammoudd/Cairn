import { addDays, generateInviteCode, hashInviteCode, INVITE_EXPIRY_DAYS } from "./codes";
import { deliverInvite, type DeliverDeps } from "./job";

// Admin actions on invites: send one now, revoke, resend. Every call writes a
// beta_invite_audit row, whatever the outcome. Pure over the store and mailer
// so the tests run them with no database and no mail.
//
// These are manual overrides: "send now" ignores the queue order and the cap
// (Adam picked this person), and a resend is a deliberate extra email. They
// still never email an unconfirmed address, never touch a claimed invite, and
// never send from a non-production deploy.

export interface AdminDeps extends DeliverDeps {
  sendingAllowed: boolean;
}

export type AdminResult = { ok: true; message: string } | { ok: false; message: string };

function refuseSend(deps: AdminDeps): string | null {
  if (!deps.sendingAllowed) return "Sending is off on this deployment (not production).";
  if (!deps.origin) return "NEXT_PUBLIC_SITE_URL is not set, so there is no safe link to send.";
  return null;
}

export async function adminSendNow(deps: AdminDeps, actor: string, waitlistId: number): Promise<AdminResult> {
  const { store } = deps;
  const audit = (outcome: string, inviteId: number | null) =>
    store.audit({ actor, action: "send_now", inviteId, waitlistId, outcome });

  const refused = refuseSend(deps);
  if (refused) {
    await audit("refused-not-production", null);
    return { ok: false, message: refused };
  }
  const person = await store.getConfirmedWaitlistRow(waitlistId);
  if (!person) {
    await audit("refused-not-confirmed", null);
    return { ok: false, message: "That waitlist entry isn't confirmed, so no invite was sent." };
  }

  const now = deps.now();
  const existing = await store.getInviteForWaitlist(waitlistId);
  if (existing?.claimedAt) {
    await audit("refused-already-claimed", existing.id);
    return { ok: false, message: "This person already has an account." };
  }

  let result;
  let inviteId: number | null;
  if (existing) {
    // Expired, revoked or still pending: reissue the one invite this person
    // has (new link, new 14 days). Never a second row.
    inviteId = existing.id;
    result = await deliverInvite(deps, existing, "invite", { expiresAt: addDays(now, INVITE_EXPIRY_DAYS), reissue: true });
  } else {
    const code = generateInviteCode();
    const created = await store.createInvite(waitlistId, hashInviteCode(code), addDays(now, INVITE_EXPIRY_DAYS), "admin");
    if (!created) {
      await audit("refused-race", null);
      return { ok: false, message: "An invite was created for this person a moment ago. Refresh and try again." };
    }
    inviteId = created.id;
    result = await deliverInvite(deps, created, "invite", { freshCode: code });
  }

  await audit(result.ok ? "sent" : `failed:${result.reason}`, inviteId);
  return result.ok
    ? { ok: true, message: "Invite sent." }
    : { ok: false, message: `The mail provider didn't accept it (${result.reason}). Nothing was marked sent.` };
}

export async function adminResend(deps: AdminDeps, actor: string, inviteId: number): Promise<AdminResult> {
  const { store } = deps;
  const invite = await store.getInvite(inviteId);
  const audit = (outcome: string) =>
    store.audit({ actor, action: "resend", inviteId, waitlistId: invite?.waitlistId ?? null, outcome });

  const refused = refuseSend(deps);
  if (refused) {
    await audit("refused-not-production");
    return { ok: false, message: refused };
  }
  if (!invite) {
    await audit("refused-not-found");
    return { ok: false, message: "No such invite." };
  }
  if (invite.claimedAt) {
    await audit("refused-already-claimed");
    return { ok: false, message: "This invite was already used." };
  }

  const result = await deliverInvite(deps, invite, "invite", { expiresAt: addDays(deps.now(), INVITE_EXPIRY_DAYS), reissue: true });
  await audit(result.ok ? "sent" : `failed:${result.reason}`);
  return result.ok
    ? { ok: true, message: "Sent a new link. The previous link no longer works." }
    : { ok: false, message: `The mail provider didn't accept it (${result.reason}). The previous link still works.` };
}

export async function adminRevoke(deps: Pick<DeliverDeps, "store" | "now">, actor: string, inviteId: number): Promise<AdminResult> {
  const { store } = deps;
  const invite = await store.getInvite(inviteId);
  const ok = invite ? await store.revoke(inviteId, deps.now()) : false;
  await store.audit({ actor, action: "revoke", inviteId, waitlistId: invite?.waitlistId ?? null, outcome: ok ? "revoked" : "refused" });
  return ok
    ? { ok: true, message: "Revoked. The link no longer works." }
    : { ok: false, message: "Nothing to revoke - the invite was already used or revoked." };
}
