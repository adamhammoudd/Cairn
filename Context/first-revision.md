Apply the following revision pass to the Cairn app based on founder testing feedback. This is a polish/fix pass on the existing 12-phase build, not a new build - work within the existing schema, brand system (Context/brand-guide.md), and CLAUDE.md guardrails unless a note below says otherwise. Confirm anything flagged "CONFIRM WITH FOUNDER" before implementing it.

### Dashboard
- Add a per-page summary view to the dashboard home - a condensed card/module for each major section (Portfolio, Markets, Watchlist, News, AI Assistant) showing its key at-a-glance data, so the dashboard functions as a real landing overview rather than an empty shell.
- Add dashboard customization: let users choose which summary modules appear and in what order. Persist this per-user in Supabase (new `dashboard_preferences` table or column), and default to a sensible starter layout for new users.

### Navigation
- Redesign the nav into a compact, grouped structure: cluster related pages under a single expandable parent label based on functionality (e.g., a "Markets" group expanding to Markets, News, Compare; a "My Portfolio" group expanding to Portfolio, Watchlist, Alerts) rather than listing every page flat.
- Remove the "Settings" link from the main nav entirely - settings should be reachable from the user avatar/account menu instead, not the primary nav.
- Remove the green status dot in the top-right corner of the header.

### Portfolio
- Replace free-text stock entry in "Add Holding" with a searchable, type-ahead selector: as the user types a name or ticker, show a dropdown of matching/similar securities (pull from the existing market data layer) for them to select from, rather than accepting arbitrary text. This is both a UX and a data-integrity fix - it prevents mistyped or ambiguous tickers from ever entering the holdings table.
- Restyle the Edit and Delete actions on each holding row as icon buttons (pencil/trash-style icons instead of text buttons); Delete uses red, consistent with the brand guide's existing rule that red signals negative/destructive states.

### Markets
- Build a proper 404/empty-state page for invalid or missing ticker/market routes - currently missing.
- Source market data via a free-tier market data API where one with acceptable reliability and rate limits exists; fall back to web scraping only where no viable free API covers a needed data point, and flag any scraped source's terms of service for a quick legal check before relying on it long-term.

### Ticker Detail Page
- Add an "Add Holding" button directly on the ticker detail page, pre-filled with that ticker, so users can add a position without navigating back to Portfolio and re-searching.

### Watchlist
- Remove the action button currently sitting in the top-right next to the search/input area; relocate it below, under the main watchlist list itself.
- Turn "+ New Watchlist" into a full dedicated creation page/modal (not an inline quick-add) with configurable settings - name, description, and any per-watchlist display preferences - rather than a bare name prompt.

### Compare
- Redesign the comparison view's UI and layout for clarity and coherence - current version reads as disorganized. Align comparison rows/columns consistently across all compared tickers, and bring the visual treatment in line with the rest of the dark-mode component system rather than treating it as a one-off layout.

### News
- Build a proper 404/empty-state page - currently missing.
- Source news via a free-tier news API or scraping (same reliability/ToS caveat as Markets above), and build a relevance-ranking layer: prioritize articles connected to the user's holdings and watchlist first, then their stated preferences/interests, before generic market-wide headlines.

### Crypto
- Remove the standalone Crypto page. Fold crypto assets into the Markets page as a filterable asset type (equities/ETFs/crypto/forex/etc.), using the asset-type routing already built for the ticker detail page - this should be a UI consolidation, not a new data model.

### AI Assistant
- Add persistent chat history to the assistant UI (list/search past conversations, resume any thread) - this should already have a Supabase-backed schema from the original build; wire the UI to it if it isn't yet.
- **CONFIRM WITH FOUNDER before implementing:** "no API" for the chatbot - clarify exactly what this means before building. If it means no reliance on a third-party paid LLM API (cost/control concerns), that implies self-hosting an open-source model, which is a meaningfully larger infrastructure lift (hosting, inference cost, latency, and a likely capability tradeoff vs. hosted frontier models) than anything scoped in the original build. Get explicit confirmation of the intent and the tradeoff before starting this work - don't silently substitute an interpretation.
- Extend the assistant's analysis depth: perform calculations and cross-reference current news against historical market trend data (per the existing Phase 4 probability-engine design) to improve the accuracy and specificity of its market-level analysis. This must continue to follow the existing scope guard - market/sector/ticker-level analysis only, never a personalized directive - and every output must still show its sources and reasoning, per the existing Phase 6 methodology-transparency requirement. Don't relax either constraint while extending the analysis depth.

### Settings
- Fix the current UI/layout issues (specifics TBD - do a pass against the rest of the app's component system for consistency).
- Restructure with a clear sub-header and grouped categories (e.g., Display, Account, Notifications, Billing, AI Assistant preferences) instead of a flat list, matching the grouping pattern also being applied to the nav.

### Design (Global)
- Add motion: purposeful micro-animations (hover states, transitions between views, loading states) to make the app feel more responsive and alive - avoid decorative animation that adds latency or distracts from data.
- On color: the current brand system is intentionally tight (near-black canvas, one green accent, red reserved strictly for losses/destructive actions). Adding "more color" needs to happen without breaking that semantic meaning - introduce it through measured secondary/tertiary accents (e.g., a distinct color for neutral states, warnings, or category tagging) rather than a broad palette expansion. Route any significant palette change through design-lead against Context/brand-guide.md before applying it app-wide, so gain/loss color meaning stays unambiguous everywhere.
- General UX pass: review spacing, contrast, and information density across all pages for approachability, without abandoning the high-density, terminal-like feel that's core to the product's identity.

---

Work through these in whatever order makes sense given current dependencies, but flag anything that touches the AI Assistant's scope guard, methodology transparency, or the brand's color semantics before shipping it - those are compliance- and brand-critical, not just style preferences.