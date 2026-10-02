import Link from "next/link";
import { legalNoticeLive } from "@/lib/operator";
import { GUTTER } from "./styles";

const LINK =
  "tap inline-flex min-h-11 items-center transition-colors duration-base ease-standard hover:text-primary";

// The not-advice line and the legal links, the same on every logged-out page.
// The second sentence carries the AI and probability caveat the old marketing
// footers spelled out at length. /refunds stays linked: the cancellation terms
// have to be reachable before anyone is bound (see lib/public-paths.ts). The
// legal notice 404s until the operator identity is set in the environment
// (lib/operator.ts), so it is linked only where it is served.
export function FrontDoorFooter() {
  return (
    <footer className="border-t border-line-soft pb-[env(safe-area-inset-bottom)]">
      <div
        className={`flex flex-col gap-3 py-6 text-caption text-muted lg:flex-row lg:items-start lg:justify-between lg:gap-8 ${GUTTER}`}
      >
        <div className="flex max-w-xl flex-col gap-1.5">
          <p>Cairn explains markets. It never tells you to buy or sell. Not investment advice.</p>
          <p className="leading-relaxed text-dim text-pretty">
            Answers are written by AI and can be wrong. Probability figures are estimates from small
            sets of past cases, not predictions.
          </p>
        </div>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-5">
          <Link href="/privacy" className={LINK}>
            Privacy
          </Link>
          <Link href="/terms" className={LINK}>
            Terms
          </Link>
          {legalNoticeLive() && (
            <Link href="/legal-notice" className={LINK}>
              Legal notice
            </Link>
          )}
          <Link href="/refunds" className={LINK}>
            Cancellation &amp; refunds
          </Link>
          <Link href="/data-sources" className={LINK}>
            Data sources
          </Link>
          <Link href="/accessibility" className={LINK}>
            Accessibility
          </Link>
        </nav>
      </div>
    </footer>
  );
}
