import {
  hashInviteCode,
  inviteHashesMatch,
  INVITE_INVALID_MESSAGE,
  INVITE_WRONG_EMAIL_MESSAGE,
  isWellFormedInviteCode,
  normalizeEmail,
} from "./codes";
import type { InviteStore } from "./store";

// Sign-up with a personal invite: check the link, then claim it and create the
// account as one guarded step. Pure orchestration over the store, so the
// tests run the race with two real concurrent calls.

export type InviteCheck = { status: "valid"; inviteId: number; email: string } | { status: "invalid" };

/** Read-only: is this code a usable invite, and for which address? */
export async function checkInvite(store: InviteStore, code: string | null | undefined, now: Date): Promise<InviteCheck> {
  if (!isWellFormedInviteCode(code)) return { status: "invalid" };
  const hash = hashInviteCode(code);
  const row = await store.findByHash(hash);
  if (!row || !inviteHashesMatch(row.tokenHash, hash)) return { status: "invalid" };
  if (row.claimedAt || row.revokedAt || new Date(row.expiresAt).getTime() <= now.getTime()) return { status: "invalid" };
  return { status: "valid", inviteId: row.id, email: row.emailNormalized };
}

export type CreateAccount = (email: string) => Promise<{ ok: true; userId: string } | { ok: false; message: string }>;

export type ClaimResult = { ok: true; userId: string; inviteId: number } | { ok: false; message: string };

/**
 * Reserve the invite (one atomic UPDATE - exactly one concurrent caller wins),
 * create the account, then mark the invite claimed by it. If account creation
 * fails the reservation is released so the person can retry with the same
 * link. Only the reservation winner ever calls createAccount.
 */
export async function claimInviteAndCreateAccount(
  store: InviteStore,
  input: { code: string; email: string; now: Date },
  createAccount: CreateAccount,
): Promise<ClaimResult> {
  const check = await checkInvite(store, input.code, input.now);
  if (check.status === "invalid") return { ok: false, message: INVITE_INVALID_MESSAGE };
  if (normalizeEmail(input.email) !== check.email) return { ok: false, message: INVITE_WRONG_EMAIL_MESSAGE };

  const reserved = await store.beginClaim(hashInviteCode(input.code), check.email);
  // Lost the race, or the invite changed since the check: same plain message.
  if (!reserved) return { ok: false, message: INVITE_INVALID_MESSAGE };

  let account: Awaited<ReturnType<CreateAccount>>;
  try {
    account = await createAccount(reserved.email);
  } catch (err) {
    await store.abortClaim(reserved.inviteId);
    throw err;
  }
  if (!account.ok) {
    await store.abortClaim(reserved.inviteId);
    return { ok: false, message: account.message };
  }

  if (!(await store.finishClaim(reserved.inviteId, account.userId))) {
    // The account exists; the invite stays reserved. It cannot be reused -
    // only this address can claim it and the address now has an account - so
    // log for a manual tidy-up rather than failing a sign-up that worked.
    console.error(`[cairn] beta-invites: invite ${reserved.inviteId} reserved but not marked claimed for user ${account.userId}`);
  }
  return { ok: true, userId: account.userId, inviteId: reserved.inviteId };
}
