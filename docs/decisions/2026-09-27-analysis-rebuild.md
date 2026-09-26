# Decision: how an analysis is generated and shown (the rebuild)

**Owner:** Adam · **Raised by:** dev-lead · **Date:** 2026-09-27
**Status:** `[DECISION: Adam]` **awaiting sign-off.** Sections 1 (engine) and 2 (generation) are built against this record; section 2 does not ship until it is approved.
**Supersedes:** the earlier "directional analysis" brief (no branch for it existed, so nothing is folded in). **Builds on:** `2026-09-26-free-vs-premium.md` (whose table this adopts) and `2026-08-20-volatility-regime-as-analog.md` (Option B).

## Why
Beta feedback from an everyday investor: "chance of a ≥5% move either way within 10 sessions" doesn't help him understand or decide, nobody opens the full breakdown, and it only speaks to finance-savvy users. The analysis has to say **what's going on with the share, how it behaved before in similar moments, and what to watch**, well enough for the reader to make their own decision. It also has to give something Google or ChatGPT can't: figures computed from Cairn's own stored prices, filings and past cases.

## Guardrails (unchanged, from CLAUDE.md)
1. No buy/hold/sell, and never telling the reader what to do.
2. Never advice on a user's own position.
3. Every analytical output shows its sources, its historical cases and a confidence level. Never a bare score.
4. Premium goes through `getUserPlan()`.
5. All of this is enforced on the server, not just in the prompt or the UI.

## Audience
Everyday investors first. Every screen must make sense **without clicking anything**. Trader detail stays one click down and is never removed.

## The answer's shape, top to bottom (every surface)
1. **In plain words:** a one-sentence headline and 3–4 bullets.
2. **What history says:** "Higher 2 weeks later in 9 of 14 similar moments", a dots row, "usually between −3% and +6%", and confidence in words.
3. **Scorecard:** the six existing tiles.
4. **What to watch:** 1–3 items, each tied to a dated event or a cited source.
5. **What this means for you:** only if the reader holds the share. Code-computed exposure only. Stays behind `ENABLE_EXPOSURE_FIGURES` until the CLAUDE.md wording is approved.
6. **Full breakdown** (collapsed): sources · every historical case · company numbers · trader indicators (the ±5% band, RSI, volatility, drawdown) · how it was calculated.
7. Footer: "Cairn explains what the numbers say. Whether to buy, hold or sell is your call. Not investment advice."

## Numbers
- Every number a user sees is **computed in code** from stored prices, SEC filings and analog rows.
- The model only writes words around numbers it was handed. A code check proves that every number in its text appears in the computed inputs, written the same way. If the check fails twice, the stored text is Cairn's **code template** (labelled `template`). Unchecked text is never stored.
- **"Similar moments"** are the factor-derived cases from the symbol's own price history (same state as today, measured 10 sessions ahead). Derived volatility-regime rows stay labelled "derived" and are **left out of the headline count** (Option B).
- **Direction:** the higher/lower count, with a Wilson interval on the up-rate. Confidence uses the existing rule: under 5 cases is always low, and a wide interval is never high.
- **Typical outcome:** the 25th, 50th and 75th percentile of the signed 10-session moves, plus the worst and best case seen.
- The ±5% move probability is still computed and stored, as a **trader figure only**. It never appears in a headline.

### Rule for adding a "similar moment" condition (fixed before measuring)
Each candidate condition (earnings within 7 sessions; scorecard trend level; valuation vs its own history) is tested on its own, on top of the base set, for NVDA, MSFT and BTC. A condition is **kept** only if it leaves **≥5 cases for most of the symbols it applies to**. At run time, if a kept condition would leave fewer than 5 cases for a particular symbol, it is dropped for that symbol and the methodology says so. Thresholds are never tuned to make the results look better. Coins and funds get no company conditions and no company figures, and never zeros.

## Free vs Premium (enforced on the server)
| | Free | Premium |
|---|---|---|
| Summary, scorecard, history headline (count, range, confidence, dots), what to watch, daily briefing | ✓ | ✓ |
| Every historical case (dates, moves, notes) | closest one only | ✓ |
| Trader indicators (±5% band, RSI, volatility, drawdown, factor readings) | – | ✓ |
| Quarterly company table | – | ✓ |
| Analyses per month | 5 | 100 |

"Enforced on the server" means the Free payload does not contain the Premium fields. Hiding them in the UI is not enforcement. The analog rows stay private (migration 0051).

## Open decisions for Adam
1. **Sign-off on this record.** Section 2 waits for it.
2. **Classifier posture for stored analyses.** Recommended: `strict`. If the classifier is down, don't store model text; store the template.
3. **"What this means for you" wording in CLAUDE.md.** The box stays flagged off until then.
4. **Regenerating the stored analyses.** Dry run first; the real run only on Adam's OK. Old rows are marked superseded, never deleted.
