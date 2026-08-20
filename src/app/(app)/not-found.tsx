import Link from "next/link";

// Had no className attributes at all - it rendered as raw black-on-white body
// text with "Go to MarketsDashboard" running together as one line, which is
// what a beta tester hit after typing a ticker Cairn does not track. The
// message itself was already honest; it just did not look like the product.
export default function NotFound() {
  return (
    <div className="animate-page-in mx-auto flex max-w-[520px] flex-col items-center px-6 py-24 text-center">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-panel">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A8A8A" strokeWidth="1.75">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>

      <div className="font-mono text-[10px] tracking-[0.16em] text-muted uppercase">Not found</div>
      <h1 className="mt-2 font-serif text-[28px] leading-[1.15] font-normal text-primary">Nothing here</h1>
      <p className="mt-2.5 text-[13.5px] leading-[1.6] text-muted text-pretty">
        That ticker or market route doesn&apos;t exist, or Cairn doesn&apos;t cover it yet. Cairn tracks a defined
        set of symbols rather than the whole market - try another symbol, or browse what&apos;s covered.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
        <Link
          href="/markets"
          className="rounded-lg bg-gradient-to-br from-accent-light to-accent-dark px-4 py-2.5 text-[13px] font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_22px_rgba(47,198,133,0.35)]"
        >
          Browse markets
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-line px-4 py-2.5 text-[13px] text-primary transition-colors duration-base ease-standard hover:border-[#3A3A3A] hover:bg-active"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
