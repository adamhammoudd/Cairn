import type { InputHTMLAttributes } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Field({ label, id, ...inputProps }: FieldProps) {
  return (
    <div className="mb-[18px] last:mb-0">
      <label htmlFor={id} className="mb-1.5 block text-[13px] text-muted">
        {label}
      </label>
      <input
        id={id}
        {...inputProps}
        className="w-full rounded-lg border border-line bg-active px-3.5 py-3 text-sm text-primary outline-none"
      />
    </div>
  );
}
