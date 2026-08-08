interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  wordmarkColor?: string;
}

export function Logo({ size = 32, showWordmark = true, wordmarkColor = "#F5F5F5" }: LogoProps) {
  const glow = Math.round(size * 0.2);

  return (
    <div className="inline-flex items-center" style={{ gap: Math.round(size * 0.28) }}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <div
          className="absolute rounded-full"
          style={{
            left: "12%",
            top: "60%",
            width: "76%",
            height: "30%",
            background: "linear-gradient(135deg, #5EE6A6, #22B573)",
            boxShadow: `0 0 ${glow}px rgba(47,198,133,0.35)`,
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            left: "21%",
            top: "34%",
            width: "58%",
            height: "27%",
            background: "linear-gradient(135deg, #5EE6A6, #22B573)",
            boxShadow: `0 0 ${glow}px rgba(47,198,133,0.3)`,
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            left: "30%",
            top: "10%",
            width: "40%",
            height: "22%",
            background: "linear-gradient(135deg, #5EE6A6, #22B573)",
            boxShadow: `0 0 ${glow}px rgba(47,198,133,0.25)`,
          }}
        />
      </div>
      {showWordmark && (
        <span
          className="font-serif leading-none tracking-[0.01em]"
          style={{ fontSize: Math.round(size * 0.72), color: wordmarkColor }}
        >
          Cairn
        </span>
      )}
    </div>
  );
}
