interface ToggleProps {
  name: string;
  defaultChecked?: boolean;
}

export function Toggle({ name, defaultChecked }: ToggleProps) {
  return (
    <label className="relative inline-flex h-[22px] w-9.5 shrink-0 cursor-pointer items-center">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="absolute inset-0 rounded-full border border-line bg-active transition-colors duration-base ease-standard peer-checked:border-accent/50 peer-checked:bg-accent/22" />
      <span className="absolute left-0.5 h-4 w-4 rounded-full bg-dim transition-[transform,background] duration-base ease-standard peer-checked:translate-x-[18px] peer-checked:bg-gradient-to-br peer-checked:from-accent-light peer-checked:to-accent-dark" />
    </label>
  );
}
