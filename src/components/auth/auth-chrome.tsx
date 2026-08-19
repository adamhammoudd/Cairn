import Link from "next/link";

// Shared chrome for the auth screens. The mock has no login page, so these
// mirror its in-app vocabulary: mono eyebrow, serif heading, muted blurb, and
// the compliance line the product carries everywhere else.
export function AuthHeader({ eyebrow, title, blurb }: { eyebrow: string; title: string; blurb: string }) {
  return (
    <div className="mb-6">
      <div className="font-mono text-[10px] tracking-[0.16em] text-muted uppercase">{eyebrow}</div>
      <h1 className="mt-2 font-serif text-[28px] leading-[1.15] font-normal text-primary">{title}</h1>
      <p className="mt-2 text-[13px] text-muted text-pretty">{blurb}</p>
    </div>
  );
}

export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 rounded-[10px] border border-negative/40 bg-negative/8 px-3 py-2.5 text-[12.5px] text-negative">
      {children}
    </p>
  );
}

export function AuthFooter() {
  return (
    <p className="mt-6 border-t border-line pt-4 text-center text-[11px] leading-[1.6] text-dim text-pretty">
      Cairn is informational only — not a broker and not investment advice.{" "}
      <Link href="/terms" className="text-muted hover:text-primary">
        Terms
      </Link>{" "}
      ·{" "}
      <Link href="/privacy" className="text-muted hover:text-primary">
        Privacy
      </Link>
    </p>
  );
}
