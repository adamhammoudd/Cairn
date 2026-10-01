import "server-only";
import { inviteAllowed } from "@/lib/public-paths";
import { checkInvite } from "./claim";
import { createSupabaseInviteStore } from "./supabase-store";

export type SignupInvite =
  | { kind: "personal"; email: string }
  /** MANUAL OVERRIDE: a shared BETA_INVITE_CODES code - the old open form. */
  | { kind: "shared" }
  | { kind: "invalid" };

/** What the /signup page shows for this ?invite= value. */
export async function resolveSignupInvite(code: string | undefined): Promise<SignupInvite> {
  const value = (code ?? "").trim();
  if (!value) return { kind: "invalid" };
  if (inviteAllowed(value, process.env.BETA_INVITE_CODES)) return { kind: "shared" };
  try {
    const check = await checkInvite(createSupabaseInviteStore(), value, new Date());
    return check.status === "valid" ? { kind: "personal", email: check.email } : { kind: "invalid" };
  } catch (err) {
    console.error("[cairn] beta-invites: invite lookup failed", err instanceof Error ? err.message : err);
    return { kind: "invalid" };
  }
}
