import Link from "next/link";
import { Logo } from "@/components/logo";

// These pages had zero className attributes - raw unstyled text on a white
// background, reachable from the footer of a dark product. The content was
// already written; only the presentation was missing.
export function LegalShell({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[760px] items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={26} />
          </Link>
          <Link
            href="/"
            className="text-[12.5px] text-muted transition-colors duration-base ease-standard hover:text-accent"
          >
            Back to Cairn
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-6 py-12">
        <div className="mb-6 rounded-[10px] border border-warning/40 bg-warning/8 px-3.5 py-3 text-[12.5px] leading-[1.55] text-warning">
          <strong className="font-semibold">Draft - not legal advice.</strong> This is a first-pass, non-lawyer
          draft. It has not been reviewed by a licensed attorney and is not launch-ready.
        </div>

        <div className="font-mono text-[10px] tracking-[0.16em] text-muted uppercase">{eyebrow}</div>
        <h1 className="mt-2 font-serif text-[32px] leading-[1.15] font-normal text-primary">{title}</h1>
        <p className="mt-2 font-mono text-[11px] tracking-[0.08em] text-dim uppercase">Last updated {updated}</p>

        <div className="legal-prose mt-9">{children}</div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[760px] flex-wrap items-center gap-4 px-6 py-6 text-[12px] text-dim">
          <Link href="/terms" className="transition-colors duration-base ease-standard hover:text-accent">
            Terms
          </Link>
          <Link href="/privacy" className="transition-colors duration-base ease-standard hover:text-accent">
            Privacy
          </Link>
          <span className="ml-auto">Cairn is informational only - not a broker and not investment advice.</span>
        </div>
      </footer>
    </div>
  );
}
