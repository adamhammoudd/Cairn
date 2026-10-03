import Link from "next/link";
import { AuthHeader } from "@/components/auth/auth-chrome";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/components/front-door/styles";

/**
 * /signup with an invite that cannot be used: a way back, never a blank page.
 *
 * `missing` is the no-invite-at-all case (someone typed /signup): it must not say
 * "expired or already used" about a link they never had (audit 2026-10-02, item
 * 5.7) - it says what Cairn actually is right now.
 */
export const NO_INVITE_BLURB = "Cairn is invite-only for now. Join the waitlist and we'll send you a personal link.";
export const BAD_INVITE_BLURB =
  "It has expired or was already used. Reply to our email and we'll send a new one, or check that you opened the newest link.";

export function InviteInvalid({ missing = false }: { missing?: boolean }) {
  return (
    <>
      <AuthHeader
        eyebrow="Invite"
        title={missing ? "Cairn is invite-only." : "This invite can't be used."}
        blurb={missing ? NO_INVITE_BLURB : BAD_INVITE_BLURB}
      />
      <div className="flex flex-col gap-3">
        <Link href="/waitlist" className={`${BUTTON_PRIMARY} w-full`}>
          Back to the waitlist
        </Link>
        <Link href="/login" className={`${BUTTON_SECONDARY} w-full`}>
          Already have an account? Sign in
        </Link>
      </div>
    </>
  );
}
