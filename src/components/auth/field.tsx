import type { InputHTMLAttributes } from "react";
import { INPUT, INPUT_LABEL } from "@/components/front-door/styles";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Shown under the field and announced; the field is marked invalid. */
  error?: string | null;
}

export function Field({ label, id, error, "aria-describedby": describedBy, ...inputProps }: FieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="mb-4 last:mb-0">
      <label htmlFor={id} className={INPUT_LABEL}>
        {label}
      </label>
      <input
        id={id}
        {...inputProps}
        aria-invalid={error ? true : undefined}
        aria-describedby={[describedBy, error ? errorId : null].filter(Boolean).join(" ") || undefined}
        className={INPUT}
      />
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-caption text-warning">
          {error}
        </p>
      )}
    </div>
  );
}
