// The front door's control and surface classes - /welcome, /waitlist, the
// confirm page and the auth pages share these so a person moving from the
// waitlist email to the invite page to the dashboard meets one product.
//
// Every value is an app token (see DESIGN.md). The app has no shared Button
// component - each surface spells its own - so the two button treatments the
// front door needs are defined once here rather than retyped per page.

/** Green, 44px (48 on phones), the one main action on a screen. */
export const BUTTON_PRIMARY =
  "inline-flex h-12 items-center justify-center rounded-control bg-accent px-5.5 text-lead font-medium text-canvas transition-colors duration-base ease-standard hover:bg-accent-light disabled:opacity-60 disabled:hover:bg-accent sm:h-11";

/** Transparent with a 1px line - every other action. */
export const BUTTON_SECONDARY =
  "inline-flex h-12 items-center justify-center rounded-control border border-line px-5.5 text-lead text-primary transition-colors duration-base ease-standard hover:border-line-strong hover:bg-active sm:h-11";

/** The header's small primary. 36px drawn, 44px to a finger via `.tap`. No display
    value: the caller sets it (the header hides it on phones). */
export const BUTTON_PRIMARY_SMALL =
  "tap h-9 items-center justify-center rounded-control bg-accent px-4 text-body font-medium text-canvas transition-colors duration-base ease-standard hover:bg-accent-light";

/** 44px, strong line, canvas fill, 16px text so iOS never zooms on focus. */
export const INPUT =
  "h-11 w-full rounded-control border border-line-strong bg-canvas px-3.5 text-title text-primary transition-colors duration-base ease-standard outline-none placeholder:text-dim focus:border-accent";

export const INPUT_LABEL = "mb-2 block font-mono text-eyebrow text-dim uppercase";

/** The app's card surface: raised-to-panel gradient and a 1px line, no corners. */
export const CARD_SURFACE = "border border-line bg-gradient-to-b from-raised to-panel";

/** The app's card: that surface with 14px corners. */
export const CARD = `rounded-card ${CARD_SURFACE}`;

/** A flat panel for content blocks inside a page. */
export const PANEL = "rounded-card border border-line bg-panel";

export const EYEBROW = "font-mono text-eyebrow text-muted uppercase";

/** Page gutters: 18px on phones, 32px on tablets, 48px on desktop. */
export const GUTTER = "px-4.5 sm:px-8 lg:px-12";

/** Inline text link. Underlined so it is not told apart by colour alone. */
export const TEXT_LINK =
  "text-primary underline underline-offset-2 transition-colors duration-base ease-standard hover:text-accent-light";
