import Link from "next/link";
import { AuthHeader } from "@/components/auth/auth-chrome";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/components/front-door/styles";

/** /signup with an invite that cannot be used: a way back, never a blank page. */
export function InviteInvalid() {
  return (
    <>
      <AuthHeader
        eyebrow="Invite"
        title="This invite can't be used."
        blurb="It has expired or was already used. Reply to our email and we'll send a new one, or check that you opened the newest link."
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
