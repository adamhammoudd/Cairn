import Link from "next/link";
import { Logo } from "@/components/logo";
import { LEGAL_NOTICE_LIVE } from "@/lib/site";

// These pages had zero className attributes - raw unstyled text on a white
// background, reachable from the footer of a dark product. The content was
// already written; only the presentation was missing.
export function LegalShell({
  eyebrow,
  title,
  updated,
  // The draft banner belongs on the policies awaiting legal review. The
  // accessibility statement is a factual account of what was tested, not a
  // legal draft, and labelling it "not legal advice" would be noise that
  // teaches readers to skip the banner where it does matter.
  draft = true,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  draft?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[760px] items-center justify-between px-6 py-5">
          <Link href="/" className="tap inline-flex min-h-11 items-center gap-2.5">
            <Logo size={26} />
          </Link>
          <Link
            href="/"
            className="tap inline-flex min-h-11 items-center text-body text-muted transition-colors duration-base ease-standard hover:text-accent"
          >
            Back to Cairn
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-6 py-12">
        {/*
          The banner used to read "first-pass draft ... not launch-ready",
          which was accurate while four sections were explicitly blank. Those
          sections are now written against Belgian and EU consumer law. What
          still has not happened is review by a qualified lawyer, so the notice
          narrows to exactly that rather than disappearing.

          TO REMOVE IT: once a Belgian lawyer has reviewed these documents, set
          `draft = false` as the default in the props above. That one flip is
          the counsel sign-off gate for every page using this shell. Do not flip
          it because the pages look finished - looking finished with no review
          behind it is what makes a consumer contract dangerous rather than safe.
        */}
        {draft ? (
          <div className="mb-6 rounded-panel border border-warning/40 bg-warning/8 px-3.5 py-3 text-body leading-[1.55] text-warning">
            <strong className="font-semibold">Pending legal review.</strong> These documents are
            complete and written to apply Belgian and EU consumer law, but they have not yet been
            reviewed by a qualified lawyer. Nothing here is legal advice.
          </div>
        ) : null}

        <div className="font-mono text-eyebrow text-muted uppercase">{eyebrow}</div>
        <h1 className="mt-2 font-serif text-display leading-[1.15] font-normal text-primary">{title}</h1>
        <p className="mt-2 font-mono text-eyebrow text-dim uppercase">Last updated {updated}</p>

        <div className="legal-prose mt-9">{children}</div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[760px] flex-wrap items-center gap-4 px-6 py-6 text-caption text-dim">
          <Link href="/terms" className="tap inline-flex min-h-11 items-center transition-colors duration-base ease-standard hover:text-accent">
            Terms
          </Link>
          <Link href="/privacy" className="tap inline-flex min-h-11 items-center transition-colors duration-base ease-standard hover:text-accent">
            Privacy
          </Link>
          <Link href="/refunds" className="tap inline-flex min-h-11 items-center transition-colors duration-base ease-standard hover:text-accent">
            Cancellation &amp; refunds
          </Link>
          {LEGAL_NOTICE_LIVE ? (
            <Link href="/legal-notice" className="tap inline-flex min-h-11 items-center transition-colors duration-base ease-standard hover:text-accent">
              Legal notice
            </Link>
          ) : null}
          <Link href="/accessibility" className="tap inline-flex min-h-11 items-center transition-colors duration-base ease-standard hover:text-accent">
            Accessibility
          </Link>
          <span className="ml-auto">Cairn is informational only - not a broker and not investment advice.</span>
        </div>
      </footer>
    </div>
  );
}
