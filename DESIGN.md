# Cairn Design System

The visual contract for every surface in the product. `Context/brand-guide.md` says
*what Cairn feels like*; this file says *what you type*. Where they disagree, the brand
guide wins and this file is wrong.

Tokens live in `src/app/globals.css`. This document explains them; it is not a second
source of truth.

---

## Why this file exists

Before it, Cairn had a design system on paper that its components did not use. An audit
of the 117 components found:

| | Before | Now |
|---|---|---|
| Font sizes | 25 arbitrary values (8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5…) | 12-step scale (but see below: ~200 `text-[Npx]` remain) |
| Border radii | 20 distinct values, incl. `rounded-[14px]` hardcoded beside the 14px token | 5-step scale |
| Eyebrow tracking | 8 values across the same mono-uppercase label | 1, bound to the token |
| Off-grid spacing | 268 `.25`/`.75` values | 0 |
| Near-black greys | ~12 undeclared literals | 4 named surfaces |
| Hex literals in components | ~230 | 0, enforced by `scripts/tests/design-a11y.ts` (2026-10-02: the last 157 were moved to tokens; a few near-greys were snapped to the nearest named surface) |
| Files with a focus style | 1 of 117 | global |

None of that was visible as a bug. It was visible as the app not feeling like one app.

**The rule that keeps it fixed:** if a value is not expressible in the tokens below,
that is a gap in the system to be discussed - not a licence to write a literal.

---

## Type scale

Twelve steps (ten for the app, two front-door heroes), named for the job rather than a size, because in a data product "the eyebrow
above a stat" is a role that must not drift, while "small" is an invitation to invent
12.5px.

| Token | Size | Line-height | Use |
|---|---|---|---|
| `text-eyebrow` | 10px | 1.3 | Mono uppercase labels: `PORTFOLIO`, timestamps, column heads |
| `text-micro` | 11px | 1.3 | Dense secondary metadata |
| `text-caption` | 12px | 1.35 | Captions, helper text, chart labels |
| `text-body` | 13px | 1.45 | **Default.** UI copy, table cells, list rows |
| `text-lead` | 14px | 1.5 | Emphasised body, intro paragraphs |
| `text-title` | 16px | 1.35 | Card titles, section heads |
| `text-h3` | 20px | 1.25 | Sub-section headings |
| `text-h2` | 24px | 1.2 | Page section headings |
| `text-h1` | 30px | 1.15 | Page titles |
| `text-display` | 34px | 1.1 | Hero figures, headline stats |
| `text-hero` | 48-58px, fluid | 1.08 | **Front door only.** The h1 on /welcome and /waitlist from 640px up |
| `text-hero-sm` | 40px | 1.1 | **Front door only.** That h1 on phones |

The two `hero` steps exist because a marketing headline needs more than the app ever
does; they carry their own `-0.02em` tracking. They are not for app screens - an app
heading that wants to be bigger than `text-display` is a design question, not a token.

**Known gap (2026-10-02):** 206 `text-[Npx]` arbitrary sizes still sit in components beside this scale (for example `ticker-hero.tsx`). They are not new drift - they pre-date the scale - and moving them to the nearest step is a follow-up, listed in the audit report, because several sit between two steps and need a design call.

**`text-eyebrow` carries its own `letter-spacing: 0.12em`.** Do not add `tracking-*`
beside it - that one binding is what collapsed eight competing tracking values, and
re-adding one reopens the drift.

Line heights stay tight deliberately. Tailwind's inherited 1.5 stretched every table row
taller than the design; `body` sets `line-height: normal` and each token supplies its own.
Prose opts into `leading-relaxed` where it needs air.

### Faces

Three, each with a fixed role - unchanged from the brand guide:

- **`font-serif`** (Newsreader) - wordmark and headlines only.
- **`font-sans`** (default) - body copy, UI labels, controls.
- **`font-mono`** (IBM Plex Mono) - eyebrows, timestamps, tabular figures. Reinforces the
  terminal feel; never general UI copy.

---

## Surfaces

A four-step elevation ramp. Every near-black resolves to one of these.

| Token | Value | Use |
|---|---|---|
| `bg-canvas` | `#0A0A0A` | Page ground |
| `bg-panel` | `#0F0F0F` | Cards, panels, table bodies |
| `bg-raised` | `#151515` | Menus, popovers, sheets, tooltips - above a panel |
| `bg-active` | `#171717` | Interactive fill: hover, pressed, selected |

`bg-active` was `#141414`, one step off the canvas, which read as dead under a pointer -
which is precisely why call sites kept substituting `#171717`/`#191919`/`#1C1C1C` by hand.

## Borders

Three weights, because a dense UI genuinely needs three.

| Token | Value | Use |
|---|---|---|
| `border-line-soft` | `#1E1E1E` | Row dividers, internal splits |
| `border-line` | `#2A2A2A` | Default 1px border |
| `border-line-strong` | `#3A3A3A` | Hover, focus, emphasis |

## Text colours

| Token | Value | Contrast on canvas |
|---|---|---|
| `text-primary` | `#F5F5F5` | 18.1:1 |
| `text-muted` | `#8A8A8A` | 4.6:1 |
| `text-dim` | `#7B7B7B` | 4.68:1 - the floor. Nothing recedes further. |

`#6A6A6A` measured 3.66:1 and is **retired**. If a value needs to look fainter than
`text-dim`, the answer is less weight or more space, not less contrast.

---

## Semantic colour

The one non-negotiable in the product:

- **Green `--color-accent` = gain, and CTAs.** Never anything else.
- **Red `--color-negative` = loss and destructive.** Never decorative, never a brand accent.
- `--gradient-gain` / `--gradient-loss` are the paired gradients. One definition each -
  they were copy-pasted literals in five components, and a pair that can drift can swap.

Categorical tints - `warning` (amber), `info` (blue), `violet` - are for tagging and chart
series only. They never encode gain or loss and never become a CTA.

Adding a colour goes through `Context/brand-guide.md` and design-lead first.

---

## Radius

Five steps, keyed to what the shape *is*. Deliberately **not** an override of Tailwind's
`rounded-sm/md/lg`, so a stray default utility stays visibly off-system instead of
silently inheriting a new meaning.

| Token | Size | Use |
|---|---|---|
| `rounded-xs` | 3px | Bars, tags, progress tracks |
| `rounded-control` | 8px | Buttons, inputs, menu items |
| `rounded-panel` | 10px | Inner panels, list rows, tiles |
| `rounded-card` | 14px | Cards, modals |
| `rounded-sheet` | 18px | Full sheets, hero surfaces |
| `rounded-full` | - | Avatars, pills, dots |

---

## Spacing

Tailwind's native scale, **whole and `.5` steps only** (4px and 2px granularity).
`.25` and `.75` are off-grid and were removed from all 268 call sites.

Vertical rhythm tiers: `2` (8px) within a group, `4` (16px) between groups, `6`–`8`
(24–32px) between sections.

Density: `[data-density="compact"]` tightens `.cn-row` padding only. Mark data rows with
`cn-row` so the Settings toggle reaches them - one rule keyed off one attribute, rather
than a conditional at every call site.

---

## Focus

One global rule in `globals.css`: a 2px `--color-accent` ring at 2px offset on
`:focus-visible`, yielding to any component that defines its own, and switching to
`Highlight` under `forced-colors`.

Exactly one file of 117 styled focus before this existed. **Do not remove a focus ring.**
If it collides with a layout, offset it - never delete it.

---

## Motion

Tokens: `--duration-fast` (120ms), `--duration-base` (200ms), `--ease-standard`.

Purposeful only - hover, state change, entry, loading. Named keyframes live in
`globals.css` (`animate-page-in`, `animate-rise-in`, `animate-menu-in`, `animate-sheet-in`,
`animate-grow-x`…). All motion is disabled under `prefers-reduced-motion`, globally.

Animate `transform` and `opacity`. Never `width`, `height`, `top`, or `left`.

---

## Charts

All Recharts styling comes from `src/lib/chart-theme.ts` - `CHART_TOOLTIP`,
`CHART_AXIS_TICK`, `CHART_GRID`, `CHART_SERIES`. Recharts takes style objects rather than
classes, so tokens are referenced there as `var(--color-…)`.

- **Axis labels are text** and carry the 4.5:1 floor. They use `--color-axis`
  (= `--color-muted`). The `#5A5A5A` they shipped with measured **2.4:1** on every chart.
- Grid lines are non-text furniture and stay recessive.
- `CHART_SERIES` deliberately excludes accent green and negative red: reusing the
  gain/loss pair for "series 3" is how that meaning erodes.

---

## Notice idioms

Two shapes, two meanings - do not mix them:

- **A rule beside content** (`Disclosure` variant `callout`: a self-stretching 4px warning
  bar inside a bordered panel) means *this is a caveat on the content next to it*.
- **A fully tinted card** (border and heading wash in the semantic tone) means *this whole
  region behaves differently* - e.g. the Settings danger zone.

Compliance copy renders through `components/compliance/disclosure.tsx`. It exists so the
wording cannot drift; do not retype it.

---

## The front door

`/welcome`, `/waitlist` and its confirm page, the auth pages and the invite sign-up are
built from these same tokens - there is no marketing palette. Their shared pieces live in
`src/components/front-door/`: the header and footer, `AuthCard` (the raised-to-panel card
with the accent glow, `.cn-accent-glow` in `globals.css`), and the button and input classes
in `styles.ts`. Green on these pages is the main action, the live dot and the confidence
bars, nothing else. `scripts/tests/front-door-tokens.ts` fails on any hex, `rgba()`,
`text-[Npx]` or arbitrary tracking in them.

Breakpoints are Tailwind's defaults: phone below `sm` (640px), tablet `sm` to `lg`
(640-1023px), desktop `lg` (1024px) and up. Gutters 18 / 32 / 48px.

---

## Checklist before shipping UI

- [ ] No hex literal in a component. No `text-[Npx]`, `rounded-[Npx]`, `.25`/`.75` spacing.
- [ ] No `tracking-*` beside `text-eyebrow`.
- [ ] Interactive elements keep a visible focus ring.
- [ ] Gain is green, loss is red, and neither is used for anything else.
- [ ] Every probability output shows sources, analogs and confidence - never a bare score.
- [ ] Reads at 375px with no horizontal scroll.
- [ ] `node .claude/skills/impeccable/scripts/detect.mjs --json <changed files>` is clean.
