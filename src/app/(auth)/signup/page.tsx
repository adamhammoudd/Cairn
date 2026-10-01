import { betaPremiumUntil, formatBetaUntil } from "@/lib/billing";
import { inviteAllowed } from "@/lib/public-paths";
import { InviteInvalid } from "./invite-invalid";
import { SignupForm } from "./signup-form";

// Beta sign-up is invite-only: /signup?invite=<code>. The proxy keeps /signup
// closed without a valid code, and signUp() re-checks it; this page only
// decides what to show for the value it was given:
//   - a valid code: the sign-up form, inside the same card as /waitlist
//   - anything else (reachable when signed in, or if a code is withdrawn
//     between the link and the visit): "This invite can't be used", with a way
//     back to the waitlist - never a blank page.
// SignupForm takes `invitedEmail` for a personal invite that is tied to one
// address; nothing on this branch issues those yet, so it is always null here.

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string | string[] }> }) {
  const raw = (await searchParams).invite;
  const invite = (Array.isArray(raw) ? raw[0] : raw) ?? "";

  if (!inviteAllowed(invite, process.env.BETA_INVITE_CODES)) return <InviteInvalid />;

  const until = betaPremiumUntil();
  return <SignupForm invite={invite} invitedEmail={null} betaUntil={until ? formatBetaUntil(until) : null} />;
}
