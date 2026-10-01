import { EYEBROW } from "@/components/front-door/styles";

// Shared chrome for the auth screens: mono eyebrow, serif heading, muted
// blurb. The not-advice line and legal links live in the page footer
// (components/front-door/footer.tsx), shared with /welcome and /waitlist.
export function AuthHeader({ eyebrow, title, blurb }: { eyebrow: string; title: string; blurb: string }) {
  return (
    <div className="mb-6">
      <div className={EYEBROW}>{eyebrow}</div>
      <h1 className="mt-2 font-serif text-h1 font-normal text-primary">{title}</h1>
      <p className="mt-2 text-lead leading-relaxed text-muted text-pretty">{blurb}</p>
    </div>
  );
}

export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mb-4 rounded-panel border border-warning/40 bg-warning/8 px-3 py-2.5 text-body text-warning">
      {children}
    </p>
  );
}
