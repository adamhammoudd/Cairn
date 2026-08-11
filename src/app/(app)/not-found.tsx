import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-panel">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A8A8A" strokeWidth="1.75">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[20px] text-primary">Nothing here</h1>
        <p className="max-w-sm text-[13.5px] leading-relaxed text-muted">
          That ticker or market route doesn&apos;t exist, or we don&apos;t track it yet. Try
          another symbol, or head back to the markets overview.
        </p>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Link
          href="/markets"
          className="rounded-lg bg-accent px-4 py-2 text-[13px] text-canvas transition-colors duration-fast ease-standard hover:bg-accent-dark"
        >
          Go to Markets
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-line px-4 py-2 text-[13px] text-primary transition-colors duration-fast ease-standard hover:bg-active"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
