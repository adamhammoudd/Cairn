# Cairn - Company Memory

## Product
Dark-themed financial dashboard (Next.js 16 + Tailwind + Supabase). Portfolio tracking,
multi-source market/news aggregation, watchlists, screeners, alerts, calendars, and an AI
research assistant with a probability/pattern-analysis engine at its core. NO brokerage or
trade execution - informational only. Freemium: limited daily AI chat + basic analysis depth
on Free, unlimited chat + full methodology depth on Premium (Stripe-billed).

## Non-negotiable guardrails
- The AI engine analyzes markets, sectors, and tickers - it NEVER analyzes or advises on a
  specific user's personal position, and never resolves to "you should buy/hold/sell."
  This is enforced by a server-side scope-guard validator, not just prompt instructions.
- Every probability or analytical output must show its sources, historical analogs, and
  confidence level - never a bare score.
- Every premium/billing feature must route through the shared `getUserPlan()` gate.
- No agent commits directly to `main` - all changes via PR, reviewed by dev-lead.
- Legal/compliance drafts are always labeled as non-lawyer first drafts requiring
  professional review - never treated as finalized.

## Tech stack
Next.js 16 (Turbopack), Tailwind CSS, Supabase (auth/db/storage/edge functions), Stripe.

## Brand
See Context/brand-guide.md. Canvas #0A0A0A/#0F0F0F, primary accent green #2FC685
(gradient #5EE6A6 → #22B573), red reserved exclusively for loss/destructive indicators,
off-white #F5F5F5 headings, muted gray #8A8A8A secondary text, serif display + sans body.
Any palette expansion must preserve gain/loss color semantics - route through design-lead.

## Roadmap
See Context/build-roadmap.md for the full 12-phase spec (AI probability engine is the core
product, built in Phase 4; billing/tiering in Phase 12). Do not reorder phases without
chief-of-staff sign-off. Current revision-pass feedback is tracked separately - ask the
founder for the latest status if unsure what's already shipped.

## Departments & agents
- chief-of-staff — cross-department sequencing, escalation point
- dev-lead (Engineering Manager) — bug-finder, bug-fixer, feature-builder, codebase-organizer
- design-lead — brand/UI consistency
- cfo-legal-advisor — economics + legal drafting
- cmo-strategist (Marketing Manager) — social-media-manager, creative-designer
