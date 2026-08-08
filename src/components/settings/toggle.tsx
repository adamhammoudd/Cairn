interface ToggleProps {
  name: string;
  defaultChecked?: boolean;
}

export function Toggle({ name, defaultChecked }: ToggleProps) {
  return (
    <label className="relative inline-flex h-[22px] w-10 shrink-0 cursor-pointer items-center">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="absolute inset-0 rounded-full bg-line transition-colors peer-checked:bg-accent" />
      <span className="absolute left-0.5 h-[18px] w-[18px] rounded-full bg-canvas transition-transform peer-checked:translate-x-[18px]" />
    </label>
  );
}
