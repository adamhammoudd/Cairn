import type { InputHTMLAttributes } from "react";
import { FIELD_LABEL } from "@/components/field-label";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Field({ label, id, ...inputProps }: FieldProps) {
  return (
    <div className="mb-3.5 last:mb-0">
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <input
        id={id}
        {...inputProps}
        className="w-full rounded-panel border border-line bg-canvas px-3 py-2.5 text-body text-primary transition-colors duration-base ease-standard outline-none placeholder:text-dim focus:border-accent"
      />
    </div>
  );
}
