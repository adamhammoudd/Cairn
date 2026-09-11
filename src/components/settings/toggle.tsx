interface ToggleProps {
  name: string;
  defaultChecked?: boolean;
}

// Transcribed from Cairn Settings.dc.html: 38x22 track, 16px knob, knob travels
// translateX(2px) -> translateX(16px), 180ms alongside the track colour. Track
// on = rgba(47,198,133,0.22) / border rgba(47,198,133,0.5); off = #1C1C1C /
// #2A2A2A. Knob on = accent gradient; off = #3A3A3A.
export function Toggle({ name, defaultChecked }: ToggleProps) {
  return (
    <label className="relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="absolute inset-0 rounded-full border border-line bg-active transition-colors duration-base ease-standard peer-checked:border-[rgba(47,198,133,0.5)] peer-checked:bg-[rgba(47,198,133,0.22)]" />
      <span className="absolute top-0.5 left-0 h-4 w-4 translate-x-0.5 rounded-full bg-line-strong transition-[transform,background] duration-base ease-standard peer-checked:translate-x-4 peer-checked:bg-gradient-to-br peer-checked:from-accent-light peer-checked:to-accent-dark" />
    </label>
  );
}
