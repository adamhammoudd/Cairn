import Link from "next/link";

export default function NotFound() {
  return (
    <div>
      <div>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A8A8A" strokeWidth="1.75">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <div>
        <h1>Nothing here</h1>
        <p>
          That ticker or market route doesn&apos;t exist, or we don&apos;t track it yet. Try
          another symbol, or head back to the markets overview.
        </p>
      </div>
      <div>
        <Link
          href="/markets"

 >
          Go to Markets
        </Link>
        <Link
          href="/"

 >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
