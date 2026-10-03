"use client";

import Link from "next/link";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { currencyNoteText } from "@/components/layout/currency-note";

export interface TickerStripItem {
  symbol: string;
  changePct: number;
}

interface TickerStripProps {
  items: TickerStripItem[];
}

// Enough symbols per copy to overrun a 2560px window at ~100px a symbol.
const MIN_SLOTS_PER_COPY = 28;
// Constant speed: every slot takes the same time to cross, so a page with a
// longer list does not scroll faster or slower than another.
const SECONDS_PER_SLOT = 6;

/**
 * The moving band of symbols under the header on Base Camp and Markets.
 *
 * It is decoration with a job: the page's first tier is one account's total,
 * which says nothing about whether the market moved. The strip answers that in
 * peripheral vision, without spending a card on it.
 *
 * The figures are the same stored daily closes every other number on the page
 * reads - a strip that scrolls implies a live tape, so the page footer says
 * plainly that it is not one. The track renders the list twice: the animation
 * slides by 50%, so the second copy is what the eye is on when the loop
 * restarts, and there is no visible seam.
 *
 * Spacing is fixed per symbol, not spread to fill the window. The old
 * `justify-around` over a viewport-wide floor made the gap a function of how
 * many symbols a page passed (12 on Markets, up to 18 on Base Camp), so the
 * two strips looked different. A short list is instead repeated inside each
 * copy until it outgrows any realistic window, which keeps the gap and the
 * scroll speed identical wherever the strip appears.
 *
 * It also owns its placement. Each page used to break out of the shell with
 * its own negative margin, which left a gap under the header whenever the
 * shell's currency note rendered first. The band now cancels the shell's top
 * padding itself, and the shell's note is hidden while the band is on the page
 * (globals.css, `.cn-ticker-band`) and re-rendered below it, so nothing can
 * sit between the header and the strip.
 */
export function TickerStrip({ items }: TickerStripProps) {
  const prefs = useDisplayPrefs();
  if (items.length === 0) return null;

  const note = currencyNoteText(prefs);
  const repeats = Math.ceil(MIN_SLOTS_PER_COPY / items.length);
  const slots = Array.from({ length: repeats }, (_, rep) => items.map((item) => ({ ...item, rep }))).flat();
  const durationSeconds = slots.length * SECONDS_PER_SLOT;

  return (
    <div className="cn-ticker-band mb-6.5">
      {/* Edge to edge, escaping the shell's px-5.5 and pt-6.5. The width is
          `100vw - --sbw`, not `100vw`: the latter includes the scrollbar
          gutter and overshoots both edges. See layout/scrollbar-width-var.tsx. */}
      <div
        className="relative left-1/2 -mt-6.5 w-[calc(100vw-var(--sbw,0px))] -translate-x-1/2 overflow-hidden border-b border-active bg-canvas"
        // Not a live region: it repeats on a loop and would be announced over
        // and over. The same figures are reachable as real content on /markets.
        aria-hidden="true"
      >
        <div
          className="animate-ticker flex w-max"
          style={{ ["--ticker-duration" as string]: `${durationSeconds}s` }}
        >
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0">
              {slots.map((item) => (
                <Link
                  key={`${copy}-${item.rep}-${item.symbol}`}
                  href={`/ticker/${item.symbol}`}
                  className="tap flex shrink-0 items-center gap-1.5 px-4 py-[7px] transition-colors duration-fast ease-standard hover:bg-active"
                  tabIndex={-1}
                >
                  <span className="font-mono text-[11px] tracking-[0.04em] text-muted uppercase">{item.symbol}</span>
                  <span
                    className={`font-mono text-[11px] tracking-[0.04em] tabular-nums ${
                      item.changePct >= 0 ? "text-accent" : "text-negative"
                    }`}
                  >
                    {item.changePct >= 0 ? "+" : ""}
                    {item.changePct.toFixed(1)}%
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
      {note && <p className="mt-3 text-right text-caption text-muted text-pretty">{note}</p>}
    </div>
  );
}
