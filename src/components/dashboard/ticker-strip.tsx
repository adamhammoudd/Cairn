import Link from "next/link";

export interface TickerStripItem {
  symbol: string;
  changePct: number;
}

interface TickerStripProps {
  items: TickerStripItem[];
}

/**
 * The moving band of symbols under the header on Base Camp.
 *
 * It is decoration with a job: the page's first tier is one account's total,
 * which says nothing about whether the market moved. The strip answers that in
 * peripheral vision, without spending a card on it.
 *
 * Two rules it has to keep. The figures are the same stored daily closes every
 * other number on this page reads - a strip that scrolls implies a live tape,
 * so the page footer says plainly that it is not one. And the track renders
 * the list twice: the animation slides by 50%, so the second copy is what the
 * eye is on when the loop restarts, and there is no visible seam.
 */
export function TickerStrip({ items }: TickerStripProps) {
  if (items.length === 0) return null;

  // Roughly a constant scroll speed regardless of how many symbols are
  // tracked: more symbols means a longer track, which needs proportionally
  // longer to cross. A fixed duration would make a 4-symbol strip crawl and a
  // 20-symbol strip sprint.
  const durationSeconds = Math.max(30, items.length * 6);

  return (
    <div
      className="relative overflow-hidden border-b border-line bg-panel"
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
            {items.map((item) => (
              <Link
                key={`${copy}-${item.symbol}`}
                href={`/ticker/${item.symbol}`}
                className="flex items-center gap-2 px-4 py-2 transition-colors duration-fast ease-standard hover:bg-active"
                tabIndex={-1}
              >
                <span className="font-mono text-micro text-muted uppercase">{item.symbol}</span>
                <span
                  className={`font-mono text-micro tabular-nums ${
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
  );
}
