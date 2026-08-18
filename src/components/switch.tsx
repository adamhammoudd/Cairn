interface SwitchProps {
  checked: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}

// Controlled switch for state that persists via a server action on click.
// Visually identical to the uncontrolled, form-post variant in
// components/settings/toggle.tsx -- keep the two in step if either changes.
export function Switch({ checked, onToggle, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-[22px] w-9.5 shrink-0 cursor-pointer rounded-full border transition-colors duration-base ease-standard disabled:opacity-50 ${
        checked ? "border-accent/50 bg-accent/22" : "border-line bg-active"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full transition-[transform,background] duration-base ease-standard ${
          checked ? "translate-x-[18px] bg-gradient-to-br from-accent-light to-accent-dark" : "bg-dim"
        }`}
      />
    </button>
  );
}
