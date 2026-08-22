import Link from "next/link";

// Root not-found. Without this, any URL that matches no route at all -
// /markets/nonexistent, /news/anything, a mistyped path - fell through to
// Next's built-in 404: raw black-on-white body text reading "404 | This page
// could not be found." The styled version under (app) only ever covered
// notFound() calls from inside that route group, so the founder-feedback item
// ("proper 404 for invalid Markets/News routes") was never actually closed.
//
// This lives at the root so it catches everything, and it deliberately does
// not use the app chrome: an unmatched route may be outside the authenticated
// layout entirely.
export default function RootNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-24">
      <div className="mx-auto flex max-w-[520px] flex-col items-center text-center">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-panel">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A8A8A" strokeWidth="1.75">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>

        <div className="font-mono text-[10px] tracking-[0.16em] text-muted uppercase">Not found</div>
        <h1 className="mt-2 font-serif text-[28px] leading-[1.15] font-normal text-primary">Nothing at this address</h1>
        <p className="mt-2.5 text-[13.5px] leading-[1.6] text-muted text-pretty">
          That page doesn&apos;t exist. If you were looking for a symbol, search for it from the header - Cairn fetches
          any ticker its data provider carries the first time it&apos;s asked for.
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
            Back to Base Camp
          </Link>
        </div>
      </div>
    </div>
  );
}
