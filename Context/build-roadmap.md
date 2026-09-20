Please execute a complete, enterprise-grade build of a brand-new finance platform from scratch, built with Next.js 16 (Turbopack) + Tailwind CSS, backed entirely by Supabase for user storage, auth, and preferences. This is a high-density, dark-themed web app whose core product is an AI analysis engine that reads market news, cross-references historical market trends, and surfaces probability-weighted context on what's happening and why - wrapped in a portfolio dashboard, market/news viewer, and conversational assistant. There is no brokerage integration and no trade execution anywhere in this app.

**Critical framing, true throughout every phase:** the AI engine analyzes markets, sectors, and tickers - it never analyzes or advises on a specific user's personal position or tells them what to individually do. A probability output like "elevated volatility likelihood for semiconductor stocks given current earnings-season news flow, based on similar historical patterns" is in scope. Anything that resolves to "so you should buy/hold/sell" is out of scope, permanently, regardless of how it's phrased. Every probability or analytical output must show the inputs and reasoning that produced it - no bare scores, ever. Build in the following phases, in order.

### PHASE 1: Project Foundation, UI Frame & Core Settings
- **Project Setup:** Initialize Next.js 16 (Turbopack) + Tailwind CSS, connect Supabase for auth, database, and storage.
- **Layout & Alignment:** Strict dark canvas (`bg-black`/`bg-neutral-950`). Header (title, search bar, avatar) vertically centered on one line.
- **Search Bar:** Horizontally centered, transparent background (`bg-transparent`), dark border (`border-neutral-800`), dark placeholder text, search icon.
- **Settings Page (Supabase Synced):** Default chart view, refresh rate, currency selector, metric style toggle, compact mode, extended hours toggle, auth/password management, notification thresholds, data export/delete.

### PHASE 2: Multi-Source Market & News Data Layer
Build this before the AI engine - it's the fuel the engine runs on, not an afterthought bolted onto the chatbot.
- **Provider Config Table:** Supabase-managed table of news/market data providers (name, endpoint, weight/priority, enabled flag) so sources can be added or re-weighted without a code deploy.
- **Ingestion Pipeline:** Scheduled Supabase Edge Function pulling from multiple reputable sources (wire services, financial news APIs, exchange/company filings), deduplicating near-identical stories, and tagging each item with source, timestamp, and reliability weight.
- **Historical Trend Store:** A structured historical price/volume/event dataset (not just live quotes) that the Phase 4 engine can query for pattern comparison - this is a separate concern from the real-time quote layer and needs its own schema.

### PHASE 3: Portfolio Tracking & Timeline-Aligned Charting
- **Holding CRUD:** Add/edit/delete, custom `purchaseDate`, "Edit Asset" modal.
- **Dynamic X-Axis Charting:** Recharts container hidden when `holdings.length === 0`; X-axis scales to the selected timeline filter (hourly for 1D through quarterly/yearly markers for ALL) with zero overlap bugs.
- **Portfolio Analytics:** Gain/loss, % return, cost basis, allocation breakdown by sector/asset class/geography.

### PHASE 4: AI Analysis & Probability Engine - CORE PRODUCT
This is the phase the rest of the product exists to support. Build it deliberately, not quickly.
- **Pattern-Matching Core:** Given a ticker or sector, cross-reference current news sentiment/volume (Phase 2) against historical price/event patterns (Phase 2's trend store) to produce a probability-weighted analysis (e.g., likelihood of elevated volatility, likelihood of a pattern consistent with past post-earnings moves) at the **market or sector or ticker level only** - never at the level of "your position."
- **Methodology Transparency (non-negotiable):** Every probability output is stored and rendered with: the specific news items/sources that fed it, the historical analog(s) it's pattern-matching against, and a plain-language explanation of the reasoning - never a bare number or score.
- **Confidence & Uncertainty Handling:** Outputs must express uncertainty honestly (confidence ranges, sample size of historical analogs used) rather than false precision - flag low-confidence outputs explicitly rather than suppressing the caveat.
- **Structured Storage:** Every analysis is stored as a structured Supabase record (not just chat text) so it can be rendered as a rich card, referenced later by the conversational assistant in Phase 5, and audited later if needed.
- **Explicit Scope Guard:** Build a server-side validation layer that rejects/flags any generated output resolving to a personal directive ("you should sell X") before it's ever stored or shown - this is a hard technical gate, not just a prompt instruction.

### PHASE 5: Conversational AI Assistant, Daily Briefing & Chat Interface
- **Persistent Chat Panel:** Collapsible dark-mode chat (docked + full-page), streamed responses (SSE/streaming fetch).
- **Daily Briefing Generator:** Runs daily per user (scheduled Edge Function) and on demand. Personalizes using the user's watchlist/portfolio as *context for relevance ranking only* - surfaces Phase 4 analyses relevant to their held/watched tickers, plus upcoming calendar events. Stored as structured JSON so it renders as both a card UI and conversational reference.
- **Conversational Layer on Top of the Engine:** The chatbot answers questions ("what's moving tech stocks?", "explain this earnings pattern") by querying Phase 4's stored analyses and Phase 2's news store - it does not freelance new probability claims outside the engine's validated pipeline.
- **Per-User Chat History:** Supabase-persisted, paginated.

### PHASE 6: Compliance, Disclosure & Methodology Transparency Framework
Elevated to its own phase because Phase 4's output type (probability/pattern analysis) carries materially more regulatory weight than a news summary would.
- **Disclosure UI Component:** A reusable, clearly legible (not buried) disclaimer component attached to every probability output and chat response touching market analysis - states the content is market-level analytical output, not personalized financial advice.
- **Methodology Display Component:** The UI pattern (built once, reused everywhere) that renders Phase 4's sources/historical-analogs/confidence data alongside any probability output - this is the same component whether shown in the dashboard, the briefing, or the chat.
- **Terms of Service & Privacy Policy:** First-pass drafts, explicitly labeled as requiring licensed legal review before this phase is considered launch-ready - do not treat as final.
- **Jurisdictional Checklist:** Document open questions (e.g., US investment-adviser-adjacent rules, EU data handling) that need professional legal review specifically because of the probability-engine feature, flagged as higher priority than it would be for a pure news-summary product.

### PHASE 7: Screeners, Watchlists & Calendars
- **Screener Module:** Multi-asset filters (market cap, P/E, dividend yield, volume, % change), real-time debounced results.
- **Saved Screens & Watchlists (Supabase Synced):** Multiple named watchlists, drag-to-reorder, inline sparklines, saved filter combinations.
- **Unified Calendar Module:** Earnings, economic releases, dividends, IPOs, splits - filterable, date-sorted, feeding relevant events into Phase 4's pattern analysis where applicable (e.g., surfacing an upcoming earnings date next to a related probability output).

### PHASE 8: Alerts & Notifications
- **Alert Types:** Price/% change/volume-spike/technical-crossover, plus a new type: "notify me when the AI engine's confidence on [ticker/sector] crosses a threshold."
- **Delivery & Management:** In-app, push, email; Supabase-synced management table; cooldown-based rate limiting.

### PHASE 9: Crypto & Multi-Asset Support
- **Asset-Type Routing:** Ticker detail page branches by asset type (equity, ETF, crypto, forex, futures).
- **Crypto Market Overview:** Ranked by market cap, 24h volume, circulating supply, % change.
- **Engine Extension:** Confirm Phase 4's pattern-matching approach extends sensibly to crypto's different volatility/historical-data profile rather than assuming equity-style patterns transfer directly.

### PHASE 10: Community, Comparison & ESG Tools
- **Comparison View:** Up to 4 tickers, synchronized mini-charts, key-stat comparison table.
- **Sector Heat Map:** Treemap colored by daily % change.
- **Discussion Threads (Supabase Synced):** Per-ticker comments, upvote/downvote, spam filtering.
- **ESG Score Panel:** On the Company Profile tab.

### PHASE 11: Developer Layer
- **Data Export & API Layer:** CSV/JSON export, documented `/api/v1/...` routes.
- **Admin/Dev Utilities:** Role-gated route for data refresh status, rate-limit usage, error logs - extend to include Phase 4 engine health (analog-match rates, confidence distribution over time) since that's now the core product to monitor.

### PHASE 12: Subscription & Billing Infrastructure with AI Tiering
- **Plan Model:** Free and Premium in a Supabase `subscriptions` table.
- **Payment Integration:** Stripe checkout, customer portal, webhook sync.
- **Feature Gating:** Shared `getUserPlan()` helper.
- **AI-Specific Tiering:** Free tier gets a capped number of daily chat messages and access to lower-depth probability summaries (e.g., top-line output only); Premium unlocks unlimited chat plus full methodology depth (extended historical analog sets, more granular confidence data) on every analysis. The depth difference must never mean the free tier gets a *less transparent* or *less honestly caveated* output - only a less detailed one. Downgrade gracefully on payment failure/expiry.

---

Please provide modular, production-ready TSX components using clean, dark-mode Tailwind utility classes throughout. Confirm the full Supabase schema (market/news data, historical trend store, portfolio holdings, AI analysis records, chat history, watchlists, alerts, saved screens, subscriptions) before generating any component code, and confirm the Phase 4 scope-guard validation logic specifically before building anything downstream of it. Let's start by implementing Phase 1.
