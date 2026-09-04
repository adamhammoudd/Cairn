# E1 — portfolio-summary context for the AI assistant

**Date:** 2026-09-04
**Author:** dev-lead
**Decision:** `docs/decisions/2026-09-04-ai-portfolio-figures.md` — option (c)
**PR:** [#81](https://github.com/adamhammoudd/Cairn/pull/81) (draft — left open for the founder to review and merge)
**Flag:** `ENABLE_PORTFOLIO_CONTEXT` — **defaults to OFF, and is unset in every environment.**

---

## What changed

Implements option (c) of the decision memo: the chat assistant is given real,
**code-computed** portfolio figures to restate, and is structurally prevented
from producing its own. One feature, gated off. No other refactors.

| File | Change |
|---|---|
| `src/lib/ai/portfolio-summary.ts` (new) | `portfolioContextEnabled()` (only the exact string `"true"` enables it). `buildPortfolioSummary(userId, namedTickers, client?)` — reuses `computeTotals` / `computeHoldingMetrics` from `lib/portfolio.ts`, **does not reimplement the math**. Default output: total value, today's $ change, today's % change. Per-holding cost basis + unrealized P&L% **only** for a ticker in `namedTickers` the user actually holds. `renderPortfolioSummaryBlock()` / `portfolioSummaryFigures()` share one set of formatters. |
| `src/lib/ai/context.ts` | `ChatContext` gains `portfolio: PortfolioSummary \| null`. `buildChatContext` computes it only when `usePortfolioContext && portfolioContextEnabled()`; `mentioned` (the existing `detectTickers` / `TRACKED` result) is the ticker match, so "which holding did they ask about" uses the same detection as analysis relevance. A compute failure is caught and the block is dropped — the turn never fails because of it. |
| `src/lib/ai/chat-generate.ts` | `buildContextBlock` appends the `PORTFOLIO_SUMMARY` block when present. `SYSTEM_PROMPT` gains a hard rule: restate figures from that block verbatim only, never compute / estimate / extrapolate / round / infer a number that isn't in it; when no block is present the model has no portfolio figures at all. The worked-example note was adjusted to match. `runChatTurn` runs `checkPortfolioFigureDrift` alongside the existing `checkScopeGuard` / `checkNoFreelancedProbability` — only when `context.portfolio` is non-null. |
| `src/lib/ai/scope-guard.ts` | New `checkPortfolioFigureDrift(text, allowedFigures)` + `normalizePortfolioFigure()`. Deterministic, fail-closed. Flags any `$` dollar figure anywhere in the model output, or any percentage inside a clause about the reader's own position/portfolio/return, that is not one of the verbatim summary values. Empty `allowedFigures` (no block this turn) → no-op. **The advice-language detection above it is untouched.** |
| `.env.local.example` | Documents `ENABLE_PORTFOLIO_CONTEXT` with the legal/vendor precondition. |
| `scripts/tests/portfolio-figure-drift.ts` (new) | See below. Wired into `run-all.ts`; `npm run test:portfolio-figure-drift`. |

## The test proving figures can't drift from the computed source

`scripts/tests/portfolio-figure-drift.ts` — scope-guard-probe style, pure, no
network. A fixed `PortfolioSummary` stands in for one `buildChatContext` would
compute; `portfolioSummaryFigures()` and `renderPortfolioSummaryBlock()` are the
exact functions `runChatTurn` uses. A canned conversation of model replies is run
through `checkPortfolioFigureDrift`:

- **MUST-PASS** — restating the block verbatim; top-line only; sector percentages
  (`"semiconductors gave back 4.2%"`); a reply with no figures.
- **MUST-FLAG** — rounding the total (`$128,451` vs `$128,450.75`); extrapolating
  a new figure (`"down $9,032.80 over a week"`); inventing a position return
  (`"up 42.00%"`); inventing a cost basis; false precision on today's percent
  (`0.987%` vs `0.99%`).
- The rendered block **parses back to exactly the allow-list** (both directions).
- **Flag OFF** (empty allow-list) → the check is inert, i.e. PR #58 behaviour.

Result: **12/12**. `scope-guard-probe` 25/25 · 40/40 · 24/24 (no regression),
`scope-classifier` 20/20, `tsc --noEmit` clean.

Because the allow-list is derived from the same formatters that render the block,
"restate the block verbatim" is the *only* way a `$`/personal-`%` figure passes.
Anything the model computes, rounds, or invents is a different token and fails
closed; the turn is then rewritten to safe boilerplate before display.

## Flag status — explicit

`ENABLE_PORTFOLIO_CONTEXT` **defaults to `false`** (`portfolioContextEnabled()`
returns true only for the literal string `"true"`). It is **not set in
`.env.local.example`, and this PR sets it nowhere**. With it off, `context.portfolio`
is always `null`, the summary code is never called, and the assistant is
ticker-symbol-only exactly as PR #58 shipped.

## ⚠️ Escalated to Adam — do not assume either way

**The flag must stay off in every deployed environment until you confirm Groq's
data-retention / DPA terms are settled for sending real dollar figures to
inference.** Per the decision memo §3 and §5.1, that requires:

- Groq **org-level Zero Data Retention enabled and confirmed in writing**;
- Groq's DPA, retention terms, and processing locations reviewed by privacy
  counsel.

That is a vendor-account check outside dev-lead's authority. It is **not**
decided here and **not** silently assumed. The engineering side (option (c)
compute-in-code, guard rule #4, flag default off) is done and testable; the
vendor/legal precondition is yours.

## Known limitation (for the adversarial pass the memo requires before reliance)

`checkPortfolioFigureDrift` is stricter than the memo's wording ("not present
verbatim in the turn's context block"): it only accepts figures from the
`PORTFOLIO_SUMMARY` block, not from the news/analyses JSON. So with the flag on,
a model that restates a dollar amount quoted in a news item (`"$2B buyback"`)
would be flagged and its turn rewritten. This is the intended fail-closed
direction, but it is over-broad and should be exercised by the paraphrase suite
the memo names as a precondition before the flag is relied on.
