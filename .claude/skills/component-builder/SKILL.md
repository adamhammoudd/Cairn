---
name: component-builder
description: Use when building or reviewing any UI component to ensure it follows Cairn's dark-mode design tokens from Context/brand-guide.md, rather than re-deriving colors/spacing ad hoc.
---

## Design tokens
- Canvas: `#0A0A0A` / `#0F0F0F` - no pure white anywhere.
- Primary accent (CTAs, gains): `#2FC685`, gradient range `#5EE6A6` → `#22B573`.
- Loss/destructive (including delete actions): red - used ONLY for negative/destructive
  states, never decoratively.
- Text: `#F5F5F5` headings, `#8A8A8A` secondary/labels.
- Borders: 1px `#2A2A2A`, not heavy dividers.
- Typography: serif display for wordmark/headlines, sans-serif for body/UI copy, wide
  letter-spacing on eyebrow/label text.

## Process
1. Check Context/brand-guide.md for the current token set before styling anything new.
2. Reuse existing components/patterns where one already exists for the same purpose
   (e.g., the methodology-display component from Phase 6 must be the same component
   whether it renders in the dashboard, the daily briefing, or the chat panel).
3. Any new color introduced outside the existing token set must be flagged to design-lead
   before merging - don't add ad hoc hex values inline.
4. Icon-based actions (e.g., edit/delete on portfolio rows) follow the same semantic color
   rules as everything else - delete is red because it's destructive, not because red is
   generically "for icons."
