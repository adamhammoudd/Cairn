"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { BUTTON_PRIMARY_SMALL, GUTTER } from "./styles";

// One header for every logged-out page: wordmark left, "Sign in" and the
// waitlist CTA right. Each link is dropped on the page it points at. Phones
// keep only "Sign in"; the page body carries the waitlist CTA there.
// Safe-area padding keeps it clear of a notch when the page is laid out under
// one (viewport-fit=cover); without that it resolves to 0.
export function FrontDoorHeader() {
  const pathname = usePathname();
  return (
    <header className="border-b border-line-soft pt-[env(safe-area-inset-top)]">
      <div className={`flex items-center justify-between gap-4 py-3 sm:py-4 ${GUTTER}`}>
        <Link href="/welcome" aria-label="Cairn home" className="tap">
          <Logo size={26} />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-4 sm:gap-5">
          {pathname !== "/login" && (
            <Link
              href="/login"
              className="tap inline-flex min-h-11 items-center text-lead text-muted transition-colors duration-base ease-standard hover:text-primary"
            >
              Sign in
            </Link>
          )}
          {pathname !== "/waitlist" && (
            <Link href="/waitlist" className={`hidden ${BUTTON_PRIMARY_SMALL} sm:inline-flex`}>
              Join the waitlist
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
