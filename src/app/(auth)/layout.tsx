import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CenteredCard, FrontDoorShell } from "@/components/front-door/shell";

// The auth screens sit inside the front door's frame - the same header,
// footer and card as /welcome and /waitlist - so the route from the waitlist
// email to the invite page to the dashboard never changes look. The card is
// the one the app already used here: raised-to-panel gradient with the accent
// glow, 420px wide.
// Sign-in / sign-up / password reset: not something to index or preview.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <FrontDoorShell>
      <CenteredCard>{children}</CenteredCard>
    </FrontDoorShell>
  );
}
