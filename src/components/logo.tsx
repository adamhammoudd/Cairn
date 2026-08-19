interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  wordmarkColor?: string;
}

export function Logo({ size = 32, showWordmark = true, wordmarkColor = "var(--color-primary)" }: LogoProps) {
  const glow = Math.round(size / 3);

  return (
    <div className="flex items-center" style={{ gap: Math.round(size * 0.375) }}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <div
          className="absolute rounded-full bg-gradient-to-br from-accent-light to-accent-dark"
          style={{
            left: "12%",
            top: "60%",
            width: "76%",
            height: "28%",
            boxShadow: `0 0 ${glow}px rgba(47,198,133,0.35)`,
          }}
        />
        <div
          className="absolute rounded-full bg-gradient-to-br from-accent-light to-accent-dark"
          style={{
            left: "21%",
            top: "34%",
            width: "58%",
            height: "25%",
            boxShadow: `0 0 ${glow}px rgba(47,198,133,0.3)`,
          }}
        />
        <div
          className="absolute rounded-full bg-gradient-to-br from-accent-light to-accent-dark"
          style={{
            left: "30%",
            top: "10%",
            width: "40%",
            height: "21%",
            boxShadow: `0 0 ${glow}px rgba(47,198,133,0.25)`,
          }}
        />
      </div>
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
