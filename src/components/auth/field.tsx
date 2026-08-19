import type { InputHTMLAttributes } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Field({ label, id, ...inputProps }: FieldProps) {
  return (
    <div className="mb-3.5 last:mb-0">
      <label htmlFor={id} className="mb-1.75 block font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase">
        {label}
      </label>
      <input
        id={id}
        {...inputProps}
        className="w-full rounded-[10px] border border-line bg-[#0B0B0B] px-3 py-2.5 text-[13px] text-primary transition-colors duration-base ease-standard outline-none placeholder:text-dim focus:border-accent"
      />
    </div>
  );
}
