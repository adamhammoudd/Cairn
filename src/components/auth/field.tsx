import type { InputHTMLAttributes } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Field({ label, id, ...inputProps }: FieldProps) {
  return (
    <div>
      <label htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        {...inputProps}
 />
    </div>
  );
}
