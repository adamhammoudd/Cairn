# Cairn Brand Guide

**Name:** Cairn - a trail marker that guides without dictating the exact path, mirroring the
product's stance of giving sourced context rather than personalized directives.
**Tagline:** "Finance, clearly marked"

## Logo
Three stacked stones, rendered as soft rounded gradient shapes - reads as a trail cairn and
doubles visually as an ascending bar chart. Reference: cairn-logo-concept.svg.

## Color system
- Canvas: near-black, `#0A0A0A` / `#0F0F0F` - no pure white anywhere in the UI.
- Primary accent: signature green `#2FC685` (gradient range `#5EE6A6` → `#22B573`) for CTAs
  and gain indicators.
- Red is reserved exclusively for loss/negative/destructive indicators (including delete
  actions) - never used decoratively.
- Categorical tints (non-semantic, never for gain/loss or CTAs): warning `#d9a441`,
  info `#5b8def`, violet `#9B8CE0`. Used for tagging/labeling only - e.g. category tags in
  market/screener tables (violet for crypto-type rows), watchlist-relevance flags on news
  items, and chart tints for a given watchlist. Adding further tints follows the palette
  expansion policy below.
- Text: off-white `#F5F5F5` for headings, muted gray `#8A8A8A` for secondary text.
- Borders: subtle 1px `#2A2A2A` rather than heavy dividers.

## Typography
Two display/body typefaces plus one mono face, each with a fixed role:
- **Serif (Newsreader, variable weights 400/500, opsz axis, via next/font/google)** -
  wordmark/headlines only. Warm and trustworthy, avoiding a cold, sterile fintech look.
- **Sans-serif** - body copy and UI labels/controls; the default face everywhere that isn't
  a headline or tabular/eyebrow data.
- **Mono (IBM Plex Mono)** - eyebrow/label text (e.g. "PORTFOLIO", timestamps) and tabular
  data. Reinforces the trading-terminal feel; does not replace sans for general UI copy.
Wide letter-spacing on eyebrow/label text regardless of face.

## Overall feel
High-density but calm - precise like a trading terminal, without feeling aggressive or
hype-driven. Motion should be purposeful (hover states, transitions, loading states) -
avoid decorative animation that adds latency or distracts from data.

## Palette expansion policy
Adding new colors (e.g., for warnings, neutral states, category tags) is allowed but must
go through design-lead against this file first, and must never dilute the gain=green /
loss=red semantic meaning anywhere in the product.
