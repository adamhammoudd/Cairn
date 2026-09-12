"use client";

import { usePathname } from "next/navigation";

/**
 * The two radial washes in a page's top corners.
 *
 * These used to live as an inline `backgroundImage` on each page's own root,
 * which is inside the shell's `<main>` - a 1560px-max, centred, `px-5.5`
 * `pt-6.5` column. So the wash started 22px in and 26px down and was clipped
 * to the column on any wide screen: measured at 1920px it ran 195 -> 1711
 * starting 61px down, when the design anchors it to the page's own corners.
 *
 * Rendering it here, as an absolutely-positioned child of the shell root,
 * attaches it to the real edges with no viewport maths: the root is the
 * full-width element, so `inset-inline: 0` is exactly the usable width and
 * cannot overshoot into the scrollbar the way `100vw` does.
 *
 * Keyed by route rather than passed down, because the wash is page identity
 * and every page that wants one would otherwise thread a prop through its
 * panel component to reach the shell.
 */

/** Longest prefix wins, so `/watchlists/new` inherits the watchlists wash. */
const WASHES: [prefix: string, gradient: string][] = [
  [
    "/markets",
    "radial-gradient(900px 420px at 8% -6%, rgba(47,198,133,.10), transparent 70%), radial-gradient(760px 400px at 96% 2%, rgba(91,141,239,.08), transparent 72%)",
  ],
  [
    "/portfolio",
    "radial-gradient(900px 420px at 10% -8%, rgba(217,108,108,.09), transparent 70%), radial-gradient(760px 400px at 95% 0%, rgba(47,198,133,.08), transparent 72%)",
  ],
  ["/screener", "radial-gradient(880px 400px at 10% -8%, rgba(91,141,239,.09), transparent 70%)"],
  ["/sector-map", "radial-gradient(900px 400px at 50% -10%, rgba(47,198,133,.07), transparent 70%)"],
  [
    "/comparison",
    "radial-gradient(880px 420px at 8% -6%, rgba(91,141,239,.10), transparent 70%), radial-gradient(700px 380px at 94% 0%, rgba(47,198,133,.08), transparent 72%)",
  ],
  [
    "/news",
    "radial-gradient(880px 420px at 6% -6%, rgba(217,164,65,.08), transparent 70%), radial-gradient(760px 400px at 96% 2%, rgba(47,198,133,.08), transparent 72%)",
  ],
  [
    "/watchlists",
    "radial-gradient(880px 420px at 8% -8%, rgba(155,140,224,.10), transparent 70%), radial-gradient(720px 380px at 96% 0%, rgba(47,198,133,.07), transparent 72%)",
  ],
  [
    "/alerts",
    "radial-gradient(880px 420px at 10% -8%, rgba(217,164,65,.09), transparent 70%), radial-gradient(700px 380px at 94% 0%, rgba(47,198,133,.07), transparent 72%)",
  ],
  [
    "/calendar",
    "radial-gradient(880px 420px at 10% -8%, rgba(91,141,239,.10), transparent 70%), radial-gradient(700px 380px at 94% 0%, rgba(217,164,65,.07), transparent 72%)",
  ],
  [
    "/research",
    "radial-gradient(880px 420px at 8% -8%, rgba(155,140,224,.10), transparent 70%), radial-gradient(720px 380px at 95% 0%, rgba(47,198,133,.07), transparent 72%)",
  ],
  [
    "/ticker",
    "radial-gradient(900px 420px at 8% -6%, rgba(47,198,133,.09), transparent 70%), radial-gradient(740px 390px at 95% 0%, rgba(91,141,239,.07), transparent 72%)",
  ],
  [
    "/crypto",
    "radial-gradient(880px 420px at 8% -8%, rgba(155,140,224,.10), transparent 70%), radial-gradient(720px 380px at 95% 0%, rgba(47,198,133,.07), transparent 72%)",
  ],
  [
    "/calculators",
    "radial-gradient(880px 420px at 10% -8%, rgba(91,141,239,.09), transparent 70%), radial-gradient(700px 380px at 94% 0%, rgba(217,164,65,.07), transparent 72%)",
  ],
  [
    "/onboarding",
    "radial-gradient(900px 440px at 12% -8%, rgba(47,198,133,.11), transparent 70%), radial-gradient(740px 400px at 94% 0%, rgba(91,141,239,.07), transparent 72%)",
  ],
  // Account surfaces stay quieter than the data ones: a single faint wash, no
  // second corner. Settings and Billing are somewhere you go to change a
  // thing, not somewhere to be impressed.
  ["/settings", "radial-gradient(860px 380px at 10% -8%, rgba(47,198,133,.06), transparent 70%)"],
  ["/billing", "radial-gradient(860px 380px at 10% -8%, rgba(47,198,133,.07), transparent 70%)"],
  ["/admin", "radial-gradient(860px 380px at 10% -8%, rgba(217,164,65,.06), transparent 70%)"],
  [
    "/assistant",
    "radial-gradient(900px 440px at 12% -8%, rgba(47,198,133,.11), transparent 70%), radial-gradient(740px 400px at 94% 0%, rgba(155,140,224,.08), transparent 72%)",
  ],
];

/** Base Camp. Exact-matched, so it cannot swallow every other route. */
const BASE_CAMP =
  "radial-gradient(900px 420px at 12% -8%, rgba(47,198,133,.10), transparent 70%), radial-gradient(700px 380px at 92% 0%, rgba(91,141,239,.07), transparent 70%)";

function washFor(pathname: string): string | null {
  if (pathname === "/") return BASE_CAMP;
  const match = WASHES.filter(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`)).sort(
    (a, b) => b[0].length - a[0].length,
  )[0];
  return match?.[1] ?? null;
}

export function PageWash() {
  const wash = washFor(usePathname());
  if (!wash) return null;

  return (
    <div
      aria-hidden
      // Responsive by construction: the gradients are sized in px but placed
      // at percentages, so each stays in its corner as the viewport narrows.
      // The height is capped in vh as well as px so a short viewport does not
      // get a wash taller than the screen.
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[min(560px,62vh)]"
      style={{ backgroundImage: wash }}
    />
  );
}
