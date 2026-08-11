As dev-lead, build the Cairn AI assistant subsystem from scratch — the data pipeline, the probability/analysis engine, the conversational layer, the compliance framework, and the automated test suite that proves it actually behaves. Read CLAUDE.md and Context/build-roadmap.md first; this consolidates and rebuilds Phases 2, 4, 5, and 6 of that spec as one coherent subsystem rather than four disconnected passes. If any of this already exists in src/, audit it against every requirement below and fix what's missing or wrong — don't assume prior work is correct.

## 1. Data Foundation
- **Provider config table (Supabase):** name, endpoint, weight/priority, enabled flag — sources must be addable/adjustable without a code deploy.
- **Ingestion pipeline:** scheduled Edge Function pulling from multiple reputable sources, deduplicating near-identical stories, tagging every item with source, timestamp, and reliability weight.
- **Historical trend store:** structured historical price/volume/event data, separate from the live quote layer, queryable for pattern comparison.

## 2. Probability & Analysis Engine (core product — build this carefully)
- **Pattern-matching core:** given a ticker/sector, cross-reference current news sentiment/volume against historical patterns to produce a probability-weighted analysis — market/sector/ticker-level only, never at the level of a user's personal position.
- **Mandatory methodology output:** every result stores and renders the specific sources it drew from, the historical analog(s) it's matching against, and a plain-language reasoning explanation. No bare scores, ever — reject any code path that would allow one.
- **Honest uncertainty handling:** confidence ranges and sample size of historical analogs used, with low-confidence outputs flagged explicitly rather than hidden or smoothed over.
- **Structured storage:** every analysis is a Supabase record (not just chat text), so it can render as a card, feed the conversational layer, and be audited later.

## 3. Hard Scope Guard (non-negotiable, build as code — not a prompt instruction)
- A server-side validation layer that inspects every generated output before it's stored or shown, and **rejects or rewrites** anything that resolves to a personal directive ("you should buy/sell/hold your position," "now is a good time for you to...").
- This must be a deterministic gate the engine cannot talk its way around — test it adversarially per Section 6 before considering it done.
- Log every rejected/rewritten output (with the original and the corrected version) to a Supabase audit table so this is inspectable later, not just silently patched.

## 4. Conversational Layer
- Persistent, streamed chat (SSE/streaming fetch), docked panel + full-page mode.
- Daily briefing: scheduled per user, also on-demand, using watchlist/portfolio as relevance-ranking context only — surfaces Section 2's stored analyses relevant to the user, plus upcoming calendar events. Stored as structured JSON.
- The chatbot answers by querying the stored analyses and news store from Sections 1-2 — it does not freelance new probability claims outside the validated pipeline in Section 3.
- Per-user, Supabase-persisted, paginated chat history.

## 5. Compliance & Disclosure UI
- One reusable disclosure component, attached to every probability output and every chat response touching market analysis — states clearly this is market-level analytical output, not personalized financial advice. Same component everywhere it's used, not a re-implementation per surface.
- One reusable methodology-display component rendering sources/analogs/confidence, used identically across dashboard, briefing, and chat.
- Neither component is optional or dismissible-and-forgotten — confirm it actually renders on every relevant surface, not just the primary one.

## 6. Tiered Access (tie into existing billing)
- Confirm `getUserPlan()` gates: Free gets a capped daily message count and top-line-only analysis depth; Premium gets unlimited messages and full methodology depth (extended analogs, granular confidence).
- Confirm the depth difference never reduces caveat honesty — Free tier outputs must be exactly as transparent about uncertainty as Premium, just less detailed.

## 7. Automated Test Suite — build this as part of the deliverable, not an afterthought
- **Adversarial scope-guard tests:** a script that runs 20+ varied prompts designed to elicit personal advice ("should I sell my position in X," "what should I buy right now," "is now a good time for me to buy X") against the assistant, and asserts every single response is rejected/rewritten by Section 3's guard. Zero tolerance for a pass rate under 100% — a failing case blocks this task from being marked done.
- **Methodology substance check (semi-automated):** for a sample of 10-15 generated analyses, assert that cited sources exist and are relevant, and flag (for human review) any analysis whose confidence framing looks uniformly high rather than honestly varied.
- **Citation freshness check:** for a sample of tickers, assert cited news timestamps are within an expected recency window and not stale/hallucinated.
- Output a single readable report (pass/fail per test, with the actual model output attached for anything that failed) rather than a bare pass count — this report is what gets reviewed by a human before this subsystem is considered launch-ready.

## Order of work
Build Sections 1-3 first and get the scope-guard test suite passing before building Section 4 on top of it — the conversational layer should never be built against an unvalidated engine. Sections 5-6 can proceed in parallel with 4. Confirm the full schema for all of this before writing component code, and flag anything from Context/build-roadmap.md this conflicts with to chief-of-staff before proceeding.