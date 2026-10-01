import type { InputHTMLAttributes } from "react";
import { INPUT, INPUT_LABEL } from "@/components/front-door/styles";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Field({ label, id, ...inputProps }: FieldProps) {
  return (
    <div className="mb-4 last:mb-0">
      <label htmlFor={id} className={INPUT_LABEL}>
        {label}
      </label>
      <input id={id} {...inputProps} className={INPUT} />
    </div>
  );
}
