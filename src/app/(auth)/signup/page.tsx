import { betaPremiumUntil, formatBetaUntil } from "@/lib/billing";
import { resolveSignupInvite } from "@/lib/beta-invites/resolve";
import { InviteInvalid } from "./invite-invalid";
import { SignupForm } from "./signup-form";

// Beta sign-up is invite-only. The proxy only lets /signup through with an
// ?invite= value; this page decides what that value is worth:
//   - a personal invite: "You're invited", email locked to the invited
//     address (src/lib/beta-invites)
//   - a BETA_INVITE_CODES shared code (manual override): the open form, as before
//   - anything else: "This invite can't be used", with a way back to the
//     waitlist - never a blank page and never a redirect.
// The signUp action re-checks all of this; this page is not the gate.

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string | string[] }> }) {
  const raw = (await searchParams).invite;
  const invite = Array.isArray(raw) ? raw[0] : raw;
  const resolved = await resolveSignupInvite(invite);

  if (resolved.kind === "invalid") return <InviteInvalid />;

  const until = betaPremiumUntil();
  return (
    <SignupForm
      invite={invite ?? ""}
      invitedEmail={resolved.kind === "personal" ? resolved.email : null}
      betaUntil={until ? formatBetaUntil(until) : null}
    />
  );
}
