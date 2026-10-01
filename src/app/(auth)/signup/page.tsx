import Link from "next/link";
import { AuthFooter, AuthHeader } from "@/components/auth/auth-chrome";
import { INVITE_INVALID_MESSAGE } from "@/lib/beta-invites/codes";
import { resolveSignupInvite } from "@/lib/beta-invites/resolve";
import { SignupForm } from "./signup-form";

// Beta sign-up is invite-only. The proxy only lets /signup through with an
// ?invite= value; this page decides what that value is worth:
//   - a personal invite: "You've been invited", email locked to the invited
//     address (src/lib/beta-invites)
//   - a BETA_INVITE_CODES shared code (manual override): the open form, as before
//   - anything else: one plain line and a way back to the waitlist - never a
//     blank page and never a redirect.
// The signUp action re-checks all of this; this page is not the gate.

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string | string[] }> }) {
  const raw = (await searchParams).invite;
  const invite = Array.isArray(raw) ? raw[0] : raw;
  const resolved = await resolveSignupInvite(invite);

  if (resolved.kind === "invalid") {
    return (
      <>
        <AuthHeader eyebrow="Beta invite" title="This link can't be used" blurb={INVITE_INVALID_MESSAGE} />
        <Link
          href="/waitlist"
          className="inline-block rounded-panel border border-line px-4 py-2.5 text-body text-primary transition-colors duration-base ease-standard hover:border-line-strong hover:bg-active"
        >
          Back to the waitlist
        </Link>
        <AuthFooter />
      </>
    );
  }

  return <SignupForm invite={invite ?? ""} invitedEmail={resolved.kind === "personal" ? resolved.email : null} />;
}
