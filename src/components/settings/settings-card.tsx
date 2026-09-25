import type { ReactNode } from "react";

// Shared primitives for the Settings panels, transcribed from
// Cairn Settings.dc.html. One card per group: 14px radius, #0F0F0F on a
// #2A2A2A border; header 16px 18px on a #1E1E1E hairline with a 19px serif
// title; rows 16px 18px on a #171717 hairline. #6A6A6A in the mockup is
// rendered as `text-dim` (#7B7B7B) here - the codebase bumped it for contrast
// (scripts/tests/contrast.ts), and a11y wins over the swatch.

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="animate-rise-in overflow-hidden rounded-card border border-line bg-panel">{children}</div>
  );
}

// The mock tints each panel header with its section's accent, fading to
// nothing over the header's own height, so a tab change reads as a change of
// place and not just of content.
const HEADER_TINT: Record<string, string> = {
  accent: "bg-gradient-to-b from-accent/[0.06] to-transparent",
  warning: "bg-gradient-to-b from-warning/[0.07] to-transparent",
  violet: "bg-gradient-to-b from-violet/[0.07] to-transparent",
  none: "",
};

export function CardHeader({
  title,
  note,
  tint = "none",
}: {
  title: string;
  note?: string;
  tint?: "accent" | "warning" | "violet" | "none";
}) {
  return (
    <div
      className={`flex flex-wrap items-baseline justify-between gap-3 border-b border-line-soft px-4.5 py-4 ${HEADER_TINT[tint]}`}
    >
      <span className="font-serif text-h3 text-primary">{title}</span>
      {note && <span className="text-caption text-dim">{note}</span>}
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
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line-soft px-4.5 py-4 transition-colors duration-base ease-standard last:border-b-0 hover:bg-active">
      <div className="min-w-0 max-sm:w-full">
        <div className={`text-body ${labelClassName}`}>{label}</div>
        {desc && (
          <div className="mt-1 max-w-[460px] text-caption leading-[1.5] text-muted text-pretty">{desc}</div>
        )}
      </div>
      {children}
    </div>
  );
}

/** The mockup's dark footer strip (Display card's "Reset to defaults" row). */
export function CardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3.5 bg-canvas px-4.5 py-4">{children}</div>
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
      className={`flex gap-1 rounded-panel border border-line p-[3px] ${wrap ? "flex-wrap justify-end" : "shrink-0"}`}
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
          <span className="block cursor-pointer rounded-control px-3 py-2 text-caption text-muted transition-colors duration-fast ease-standard peer-checked:bg-active peer-checked:text-primary hover:text-primary">
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
      className="shrink-0 rounded-panel border border-line bg-active px-3 py-2.5 text-body text-primary outline-none transition-colors duration-fast ease-standard hover:border-line-strong focus:border-accent disabled:opacity-50"
    >
      {children}
    </select>
  );
}

/**
 * The mock's checkable card - a bordered button with a label, a status note,
 * and a tick box on the right, used where a plain checkbox row would not carry
 * the "live now" / "coming soon" distinction the copy needs to make. Wraps a
 * real checkbox so it still submits with the form and is still reachable and
 * announced as a checkbox.
 */
export function CheckCard({
  name,
  value,
  label,
  note,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  note?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="group flex cursor-pointer items-center justify-between gap-2.5 rounded-panel border border-line bg-active px-3 py-2.5 transition-colors duration-base ease-standard has-[:checked]:border-accent/45 has-[:checked]:bg-accent/[0.09] has-[:focus-visible]:border-accent">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="flex flex-col items-start leading-[1.3]">
        <span className="text-body text-muted peer-checked:group-[]:text-primary">{label}</span>
        {note && <span className="font-mono text-eyebrow text-dim uppercase">{note}</span>}
      </span>
      <span
        aria-hidden
        className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-xs border border-line-strong text-eyebrow text-canvas transition-colors duration-base ease-standard peer-checked:border-accent peer-checked:bg-accent"
      >
        <span className="opacity-0 peer-checked:group-[]:opacity-100">✓</span>
      </span>
    </label>
  );
}

/**
 * The mock's chip form of the same control, for the long news-category list
 * where a stack of cards would be taller than the panel.
 */
export function CheckChip({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="group flex cursor-pointer items-center gap-2 rounded-control border border-line bg-active px-2.5 py-1.5 text-body text-muted transition-colors duration-base ease-standard has-[:checked]:border-accent/45 has-[:checked]:bg-accent/10 has-[:checked]:text-primary has-[:focus-visible]:border-accent">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <span aria-hidden className="w-2.5 shrink-0 text-eyebrow text-accent opacity-0 peer-checked:group-[]:opacity-100">
        ✓
      </span>
      {label}
    </label>
  );
}
