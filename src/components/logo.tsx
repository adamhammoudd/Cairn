interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  wordmarkColor?: string;
}

export function Logo({ size = 32, showWordmark = true, wordmarkColor = "var(--color-primary)" }: LogoProps) {
  const glow = Math.round(size / 3);

  return (
    <div>
      <div>
        <div

 />
        <div

 />
        <div

 />
      </div>
      {showWordmark && (
        <span

 >
          Cairn
        </span>
      )}
    </div>
  );
}
