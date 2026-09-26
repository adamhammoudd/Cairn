# Decision needed: what is Free and what is Premium in the new analysis and briefing

**Owner:** Adam · **Raised by:** dev-lead (plain-summary / scorecard / briefing build) · **Date:** 2026-09-26
**Status:** open - **no billing or gating has been changed.** Everything below ships ungated until this is decided.

## What exists now

`TIER_LIMITS` (`src/lib/billing.ts`):

| | Free | Premium |
|---|---|---|
| AI analyses per month | 5 | 100 |
| Chat messages per day | 20 | unlimited |
| Analysis depth | `top_line` | `full` |

The one content gate today is analysis depth: on Free, `attachMethodology()` (`src/lib/actions/analysis.ts`) drops every historical analog but the closest one **on the server** before the payload is serialised, because `ai_analysis_*` rows are readable by every account and hiding them in the UI would not stop a Free account reading them from the payload.

The new surfaces (#137-#141) add: the plain summary, the six-tile scorecard, "What history says", the Full breakdown (sources, all historical cases, company numbers, trader indicators, how it was calculated) and the daily briefing.

## Recommendation

| Surface | Proposed tier | Why |
|---|---|---|
| In plain words (summary) | **Free** | The core promise: what a beginner reads first. |
| Scorecard (6 tiles) | **Free** | Same. Every tile is computed in code from public filings and prices; it costs nothing per view. |
| What history says - headline, range, confidence, dots | **Free** | The honest-uncertainty story is the product's differentiator; showing it only to payers weakens the "evidence, not tips" claim. |
| Daily briefing | **Free** | "What changed for what you own" is what brings people back daily. |
| All historical cases (every analog, its note, its dates) | Premium | Already the Free/Premium line today (`analysisDepth`). |
| Trader indicators (RSI, volatility, drawdown, the 10-day move probability, chart detail) | Premium | For finance-savvy users; not needed to understand the summary. |
| Company numbers (quarterly table) | Premium | Detail behind the scorecard; the scorecard itself stays free. |
| AI analyses per month | 5 Free / 100 Premium (unchanged) | Each analysis costs a model call, and now a second for the summary. |

## How gating must be enforced (server-side, via `getUserPlan()`)

Everything goes through the shared `getUserPlan()` gate (CLAUDE.md). And, as with analogs, **hiding a section in the UI is not gating**:

1. **All historical cases.** Keep the existing server-side analog truncation in `attachMethodology()`. The page's history dots are built from an aggregate (counts and up/down per case, no dates or notes), which is what the recommendation leaves free.
2. **Trader indicators.** Omit the probability line and the per-factor readings from the server payload on Free (`TickerWorkspace` props), not just the rendered row.
3. **Company numbers.** `company_financials_quarterly` / `_annual` / `earnings_releases` are **public read** today (migration 0048, same as `fundamentals` and `financial_statements`). If the table becomes Premium, a Free account could still read it from PostgREST with the anon key. So gating it means: **revoke the public read** (service-role only), and serve the table through a server action that checks `getUserPlan()`. The scorecard keeps working because it reads through the server loader.
4. **Summary, scorecard, history headline, briefing.** Free: nothing to change.

None of this is implemented. It is a small follow-up once the tiers are approved.

## Questions for Adam

1. Approve the table above (summary, scorecard, history headline and briefing free; all cases, trader indicators and company numbers Premium)?
2. If company numbers become Premium: approve revoking public read on the three SEC tables (a migration), with the table served through a plan-checked server action?
3. Keep 5 / 100 analyses per month now that each analysis also writes a plain summary (one extra model call)?
