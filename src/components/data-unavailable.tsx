import type { ReactElement } from "react";
import { DataReadError } from "@/lib/supabase/read";

// Why this is server-rendered rather than left to (app)/error.tsx
// ----------------------------------------------------------------
// A server component that throws in a production build does not deliver its
// message to the browser. React replaces it with error #441 - "the specific
// message is omitted in production builds to avoid leaking sensitive details"
// - and passes only a `digest`. That is the right default, but it meant the
// one thing worth reading ("this database is missing migration 0027") never
// reached the screen, and the operator saw a minified error code instead.
//
// So the failure is caught on the server and rendered as ordinary markup. The
// text is page content, not an exception, and it survives minification intact.
// (app)/error.tsx stays as the backstop for genuinely unexpected throws.
//
// Amber, not red: red is reserved for loss and destructive indicators, and
// "this could not load" is neither.
export function DataUnavailable({ error }: { error: DataReadError }): ReactElement {
  return (
    <div className="animate-page-in mx-auto max-w-[620px] px-6 py-20">
      <div className="rounded-card border border-line bg-panel p-6">
        <p className="font-mono text-[10.5px] tracking-[0.16em] text-warning uppercase">Data unavailable</p>
        <h1 className="mt-2 font-serif text-[26px] leading-[1.15] text-primary">
          {error.missingObject ? "This deployment is ahead of its database" : "This page could not read its data"}
        </h1>

        <p className="mt-3 text-[13.5px] leading-relaxed text-muted text-pretty">
          {error.missingObject
            ? "The build is reading tables and functions the connected Supabase project does not have, so prices, holdings and market listings cannot be loaded. No figures are shown rather than a zero that would look like a real balance."
            : "A required read failed. No figures are shown rather than values that could not be verified."}
        </p>

        <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-dim">
          {error.message}
        </pre>

        {error.missingObject ? (
          <p className="mt-3 text-[12.5px] leading-relaxed text-dim text-pretty">
            Run <code className="font-mono text-muted">npm run check-db</code> to list every missing object, then apply
            the migration above in the Supabase SQL editor. Migrations are not applied by deploying - see{" "}
            <code className="font-mono text-muted">supabase/README.md</code>.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          {/* A plain anchor, not next/link, and deliberately so: this panel only
              renders when a server read failed, and a full page load re-runs
              that read from scratch where a client-side transition would reuse
              the same degraded router state. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="rounded-[10px] bg-gradient-to-br from-accent-light to-accent-dark px-4 py-2.25 text-[12.5px] font-semibold text-canvas"
          >
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Wraps a page body so a failed read renders the panel above instead of
 * throwing into a minified React error. Anything that is not a DataReadError is
 * re-thrown untouched - this is for reads that could not be served, not a
 * catch-all that would hide real bugs.
 *
 * Used as `export default async function Page() { return guardReads(PageBody); }`
 * so the page body itself stays unindented and reviewable.
 */
export async function guardReads(body: () => Promise<ReactElement>): Promise<ReactElement> {
  try {
    return await body();
  } catch (e) {
    if (e instanceof DataReadError) return <DataUnavailable error={e} />;
    throw e;
  }
}
