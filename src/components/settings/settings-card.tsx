import type { ReactNode } from "react";

// Shared primitives for the Settings panels, transcribed from
// Cairn Settings.dc.html. One card per group: 14px radius, #0F0F0F on a
// #2A2A2A border; header 16px 18px on a #1E1E1E hairline with a 19px serif
// title; rows 16px 18px on a #171717 hairline. #6A6A6A in the mockup is
// rendered as `text-dim` (#7B7B7B) here - the codebase bumped it for contrast
// (scripts/tests/contrast.ts), and a11y wins over the swatch.

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="animate-rise-in overflow-hidden rounded-[14px] border border-line bg-panel">{children}</div>
  );
}

export function CardHeader({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[#1E1E1E] px-4.5 py-4">
      <span className="font-serif text-[19px] text-primary">{title}</span>
      {note && <span className="text-[11.5px] text-dim">{note}</span>}
    </div>
  );
}

/** A settings row: label + description on the left, a control on the right. */
export function CardRow({
  label,
  desc,
  children,
  labelClassName = "text-primary",
}: {
  label: ReactNode;
  desc?: ReactNode;
  children?: ReactNode;
  labelClassName?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#171717] px-4.5 py-4 last:border-b-0">
      <div className="min-w-0 max-sm:w-full">
        <div className={`text-[13px] ${labelClassName}`}>{label}</div>
        {desc && (
          <div className="mt-1 max-w-[460px] text-[11.5px] leading-[1.5] text-muted text-pretty">{desc}</div>
        )}
      </div>
      {children}
    </div>
  );
}

/** The mockup's dark footer strip (Display card's "Reset to defaults" row). */
export function CardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3.5 bg-[#0C0C0C] px-4.5 py-3.75">{children}</div>
  );
}

const OUTLINE_BUTTON =
  "shrink-0 rounded-[9px] border border-line bg-transparent px-3.5 py-2 text-[12.5px] text-primary transition-colors duration-fast ease-standard hover:border-[#3A3A3A]";

export function OutlineButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${OUTLINE_BUTTON} disabled:opacity-50`}>
      {children}
    </button>
  );
}

/**
 * The mockup's segmented control: 3px padding on a #232323 border, 7px 13px
 * buttons, #1C1C1C behind the active one. Used for radio-group settings.
 */
export function Segmented({
  name,
  value,
  options,
  wrap = false,
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  wrap?: boolean;
}) {
  return (
    <div
      className={`flex gap-1 rounded-[10px] border border-[#232323] p-[3px] ${wrap ? "flex-wrap justify-end" : "shrink-0"}`}
    >
      {options.map((o) => (
        <label key={o.value}>
          <input
            type="radio"
            name={name}
            value={o.value}
            defaultChecked={value === o.value}
            className="peer sr-only"
          />
          <span className="block cursor-pointer rounded-[7px] px-3.25 py-1.75 text-[12px] text-muted transition-colors duration-fast ease-standard peer-checked:bg-[#1C1C1C] peer-checked:text-primary hover:text-primary">
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * The mockup's select trigger - a styled button, since a native <select> can't
 * carry the mockup's chrome. Wraps a real <select> that stays interactive and
 * submits, with the visible button layered on top via peer styling would be
 * complex; instead this is a real <select> given the mockup's box treatment.
 */
export function SelectControl({
  name,
  defaultValue,
  disabled,
  children,
  minWidth = 168,
}: {
  name: string;
  defaultValue: string | number;
  disabled?: boolean;
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      disabled={disabled}
      style={{ minWidth }}
      className="shrink-0 rounded-[10px] border border-line bg-[#0B0B0B] px-3.25 py-2.5 text-[12.5px] text-primary outline-none transition-colors duration-fast ease-standard hover:border-[#3A3A3A] focus:border-accent disabled:opacity-50"
    >
      {children}
    </select>
  );
}
