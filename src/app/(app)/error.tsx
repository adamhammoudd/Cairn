"use client";

import { useEffect } from "react";
import Link from "next/link";

// Before this existed, a failed server-side read had nowhere to land: the pages
// swallowed the error and rendered an empty table or a $0 total, which is a
// wrong answer presented as a real one. Reads now throw (lib/supabase/read.ts)
// and this is where they surface.
//
// Amber, not red: the brand reserves red exclusively for loss and destructive
// indicators, and "we could not load this" is neither. A red panel on a
// portfolio screen reads as money lost.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[cairn] page failed to render:", error);
  }, [error]);

  // Set by DataReadError for a missing table/function, i.e. a database that is
  // behind the deployed code. Worth calling out separately because the fix is
  // an unapplied migration, not a retry.
  const migrationHint = /missing supabase\/migrations\//.test(error.message);

  return (
    <div className="animate-page-in flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-card border border-line bg-panel p-6">
        <p className="font-mono text-[10px] tracking-[0.12em] text-warning uppercase">Data unavailable</p>
        <h1 className="mt-2 text-xl text-primary">This page could not load its data</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {migrationHint
            ? "The database is missing objects this build depends on, so prices, holdings and market listings cannot be read. Nothing is lost - the page is refusing to show placeholder values rather than reporting a zero it cannot stand behind."
            : "A required read failed, so this page has no figures to show. It is deliberately blank rather than displaying values it could not verify."}
        </p>

        <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-dim">
          {error.message}
        </pre>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-canvas transition-colors duration-base ease-standard hover:bg-accent-dark"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-line px-4 py-2 text-sm text-muted transition-colors duration-base ease-standard hover:text-primary"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
