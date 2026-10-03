import type { Metadata } from "next";
import Link from "next/link";
import { CenteredCard, FrontDoorShell } from "@/components/front-door/shell";
import { BUTTON_SECONDARY, EYEBROW } from "@/components/front-door/styles";
import { isRemovalToken } from "@/lib/waitlist-removal";
import { RemoveForm } from "./remove-form";

export const metadata: Metadata = {
  title: "Remove me from the waitlist - Cairn",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

// Opening the link does NOT remove anyone. Mail scanners and link previews fetch
// every URL in a message, so a GET that deleted would remove people who never
// clicked. The person confirms with a button, which posts to a server action.
export default async function RemovePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  return (
    <FrontDoorShell>
      <CenteredCard>
        <div className={EYEBROW}>Waitlist</div>
        {isRemovalToken(token) ? (
          <>
            <h1 className="mt-2 font-serif text-h1 font-normal text-primary">Remove me from the waitlist</h1>
            <p className="mt-3 text-lead leading-relaxed text-muted text-pretty">
              This deletes your place on the Cairn waitlist and your email address from it. We won&apos;t
              email you again. If you change your mind you can join again, but you would go to the back of
              the line.
            </p>
            <RemoveForm token={token} />
          </>
        ) : (
          <>
            <h1 className="mt-2 font-serif text-h1 font-normal text-primary">This link isn&apos;t valid</h1>
            <p className="mt-3 text-lead leading-relaxed text-muted text-pretty">
              The removal link is incomplete or no longer valid. Open it again from the email, or reply STOP to
              that email and we&apos;ll take you off the list.
            </p>
            <Link href="/waitlist" className={`${BUTTON_SECONDARY} mt-6 w-full`}>
              Back to the waitlist
            </Link>
          </>
        )}
      </CenteredCard>
    </FrontDoorShell>
  );
}
