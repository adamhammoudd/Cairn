interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  wordmarkColor?: string;
}

// The Cairn mark: three stacked stones that also read as an ascending bar
// chart. The geometry here is the source of truth - `public/cairn-mark.svg`
// mirrors it exactly (kept trivial: three rounded-xs rects) and is what
// `scripts/gen-icons.mjs` rasterises into the favicon / app-icon set (plus the
// cairn-mark.png / cairn-lockup.png exports). The stones sit on equal 3-unit
// gaps with equal 10-unit top/bottom padding, so they read as evenly stacked.
// Rendered inline (not an <img>) so it scales perfectly and the accent glow can
// ride on a CSS filter.
function CairnMark({ size }: { size: number }) {
  // Suffixed by size so the common case (two Logos of different sizes on one
  // page) doesn't emit duplicate ids. Same-size repeats reference an identical
  // gradient, so the visual result is correct regardless.
  const gradientId = `cairn-stone-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className="shrink-0"
      aria-hidden="true"
      style={{ filter: `drop-shadow(0 0 ${Math.round(size / 4)}px rgba(47,198,133,0.28))` }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-accent-light)" />
          <stop offset="1" stopColor="var(--color-accent-dark)" />
        </linearGradient>
      </defs>
      <rect x="30" y="10" width="40" height="21" rx="10.5" fill={`url(#${gradientId})`} />
      <rect x="21" y="34" width="58" height="25" rx="12.5" fill={`url(#${gradientId})`} />
      <rect x="12" y="62" width="76" height="28" rx="14" fill={`url(#${gradientId})`} />
    </svg>
  );
}

export function Logo({ size = 32, showWordmark = true, wordmarkColor = "var(--color-primary)" }: LogoProps) {
  return (
    <div className="flex items-center" style={{ gap: Math.round(size * 0.375) }}>
      <CairnMark size={size} />
      {showWordmark && (
        <span
          className="font-serif leading-none tracking-[0.01em] [transform:translateY(0.055em)]"
          style={{ fontSize: Math.round(size * 0.833), color: wordmarkColor }}
        >
          Cairn
        </span>
      )}
    </div>
  );
}
