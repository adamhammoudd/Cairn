interface ToggleProps {
  name: string;
  defaultChecked?: boolean;
}

export function Toggle({ name, defaultChecked }: ToggleProps) {
  return (
    <label>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      <span />
      <span />
    </label>
  );
}
