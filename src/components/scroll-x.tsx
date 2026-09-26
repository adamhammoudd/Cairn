import type { ReactNode } from "react";

// A table that is allowed to scroll sideways on a phone (statements, options
// chains, the quarterly company figures) says so: a named, focusable region
// for keyboard and screen-reader users, and a visible hint below the width at
// which the table fits. Everything else in the app reflows instead.
export function ScrollX({
  label,
  hintClassName,
  className = "",
  children,
}: {
  /** What the table is, e.g. "Income statement". */
  label: string;
  /** Hides the hint once the table fits, e.g. "sm:hidden" for a 560px table. */
  hintClassName: string;
  /** Extra classes for the scrolling element (e.g. a max height). */
  className?: string;
  children: ReactNode;
}) {
  return (
    <>
      <div role="region" aria-label={`${label}, scrolls sideways`} tabIndex={0} className={`overflow-x-auto focus-visible:outline-1 focus-visible:outline-accent ${className}`}>
        {children}
      </div>
      <p aria-hidden className={`m-0 px-4 py-2 text-caption text-dim ${hintClassName}`}>
        Swipe sideways for more columns →
      </p>
    </>
  );
}
