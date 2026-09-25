"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/site";

// The backstop, not the main path. Failed market-data reads are caught on the
// server and rendered by components/data-unavailable.tsx, because a server
// component that throws in a production build does not deliver its message
// here - React substitutes error #441 and passes only a digest. So this
// boundary must not promise a message it will not have; in production it shows
// the digest and says where the real cause is logged.
//
// Amber, not red: the brand reserves red exclusively for loss and destructive
// indicators, and "we could not load this" is neither. A red panel on a
// portfolio screen reads as money lost.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[cairn] page failed to render:", error);
  }, [error]);

  // In production React replaces a server-render message with a generic one and
  // sets `digest`; only a development build carries the real text.
  const messageWithheld = Boolean(error.digest) && /minified react error|omitted in production/i.test(error.message);

  return (
    <div className="animate-page-in flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-card border border-line bg-panel p-6">
        <p className="font-mono text-eyebrow text-warning uppercase">Data unavailable</p>
        <h1 className="mt-2 text-h3 text-primary">This page could not load its data</h1>
        <p className="mt-3 text-lead leading-relaxed text-muted">
          A required read failed, so this page has no figures to show. It is deliberately blank rather than displaying
          values it could not verify.
        </p>

        <pre className="mt-4 overflow-x-auto rounded-control border border-line bg-canvas p-3 font-mono text-micro leading-relaxed break-words whitespace-pre-wrap text-dim">
          {messageWithheld ? `Server error, digest ${error.digest}` : error.message}
        </pre>

        {messageWithheld ? (
          <p className="mt-3 text-caption leading-relaxed text-dim">
            Please try again in a moment. If it keeps happening, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-muted underline underline-offset-2">
              {CONTACT_EMAIL}
            </a>{" "}
            and quote the code above so we can find exactly what went wrong.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-control bg-accent px-4 py-2 text-lead font-medium text-canvas transition-colors duration-base ease-standard hover:bg-accent-dark"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-control border border-line px-4 py-2 text-lead text-muted transition-colors duration-base ease-standard hover:text-primary"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
