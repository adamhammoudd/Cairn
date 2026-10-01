import type { ReactNode } from "react";
import { FrontDoorFooter } from "./footer";
import { FrontDoorHeader } from "./header";
import { CARD, GUTTER } from "./styles";

/** Page frame for every logged-out page: canvas ground, shared header and footer. */
export function FrontDoorShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <FrontDoorHeader />
      <div className="flex flex-1 flex-col">{children}</div>
      <FrontDoorFooter />
    </div>
  );
}

/**
 * The sign-in card: raised-to-panel gradient with the accent glow, 420px wide.
 * The waitlist form, the confirm page and the invite pages use it too, so the
 * whole route from waitlist to account reads as one surface.
 */
export function AuthCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`cn-accent-glow overflow-hidden px-5 py-7 sm:px-7 sm:py-8 ${CARD} ${className}`}>{children}</div>
  );
}

/** One AuthCard centred on the page at any width. */
export function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <main className={`flex flex-1 items-center justify-center py-12 sm:py-16 ${GUTTER}`}>
      <div className="w-full max-w-105">
        <AuthCard>{children}</AuthCard>
      </div>
    </main>
  );
}

/** "Private beta" pill. The green dot means live; its ring is the only looping motion. */
export function LivePill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center gap-2 rounded-full border border-line bg-panel px-3 font-mono text-eyebrow text-muted uppercase">
      <span aria-hidden className="relative size-1.5">
        <span className="absolute inset-0 rounded-full bg-accent" />
        <span className="animate-ping-ring absolute inset-0 rounded-full bg-accent" />
      </span>
      {children}
    </span>
  );
}
