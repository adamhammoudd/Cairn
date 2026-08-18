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

 >
      <span

 />
    </button>
  );
}
