# Waitlist / landing copy - "What changed for what you own" (DRAFT)

> **NON-LAWYER FIRST DRAFT - NOT FOR PUBLICATION.** `[ESCALATE: cfo-legal-advisor]`
> Written by an engineering agent, not a lawyer. It needs professional review
> (financial-promotion and consumer-protection rules in every market Cairn
> launches in; see `docs/legal/jurisdictional-checklist.md`) before any of it
> goes on the waitlist or landing page. Nothing here has been published.
>
> **Depends on PRs #137-#142 being merged and deployed.** Every claim below
> is mapped to the code that backs it (right-hand column of the claims table).
> If a PR changes or is not merged, the matching claim must change or go.

## Headline options

1. **What changed for what you own, and what history says usually happens next.**
2. **Your portfolio, in plain words. Every number traced to its source.**
3. **Start from what you own. See what changed, and what the record shows.**

Sub-headline (all options):
> Cairn reads the company filings and prices behind your holdings, tells you in plain English what changed, and shows how similar moments turned out before - with the range and the sources, never a tip.

## Three feature blocks

**What changed, first.**
Open Cairn and the top of the page is about your holdings: earnings coming up, a dividend raised or cut, an unusual move, a company whose numbers changed since last week. On a quiet day it says so.

**Plain words, real numbers.**
Every stock gets a short summary and six plain scorecard tiles - price vs profit, growth, financial health, dividend, price trend, next event. Each is worked out from the company's SEC filings and daily prices, not written by an AI, and every figure links back to where it came from.

**History as evidence, not a forecast.**
"The last 14 times it looked like this, the share was higher two weeks later 9 times." Cairn shows how many cases there were, the likely range, and how confident the numbers allow it to be - including when there are too few cases to say anything.

## Footer line

> Cairn explains what the numbers say. Whether to buy, hold or sell is your call. Informational only - not investment advice.

## Claims and what backs them

| Claim in the copy | Backed by | Limits the copy must respect |
|---|---|---|
| "Starts from what you own / top of the page is about your holdings" | Daily briefing at the top of Base Camp (#141) | Needs holdings entered in Cairn; no brokerage link. |
| "Earnings coming up, dividend raised or cut, unusual move, numbers changed since last week" | The four rules in `src/lib/daily-briefing.ts` (#141) | "Changed since last week" needs a week of stored snapshots after launch; dividend dates depend on the Nasdaq calendar (terms under review). |
| "On a quiet day it says so" | Quiet-day branch, tested (#141) | - |
| "Worked out from SEC filings and daily prices, not written by an AI" | `src/lib/scorecard.ts`, `src/lib/fundamentals.ts` (#137, #138) | US companies filing under US GAAP only. Foreign filers (IFRS), funds and crypto show "not applicable" / "not available" for company figures. |
| "Every figure links back to where it came from" | Scorecard `sources` with EDGAR links; Full breakdown (#138, #140) | Price figures cite the stored daily close, not a live exchange feed. |
| "A short summary in plain English" | Plain summary with fail-closed checks (#139) | Written by an AI model, then checked in code (numbers, advice, jargon); falls back to a code template. Do **not** say the summary itself is "not written by AI". |
| "The last 14 times ..., higher two weeks later 9 times", range, confidence | "What history says" on the analog engine (#139) | Only after an analysis has been run for that symbol; a past pattern, not a prediction. Never describe it as a probability of profit. |
| "Never a tip" / "whether to buy, hold or sell is your call" | Scope guard on every generated text; no advice wording in templates (tests in #139, #141) | - |

## Words to avoid

- "Predicts", "forecast", "signal", "beat the market", "win rate", "accuracy" - nothing in the product predicts.
- "Real-time" - prices are delayed daily closes plus quotes where available.
- "Personalised advice", "recommendations", "what to buy" - the product never advises.
- "Every stock" / "all companies" - company figures cover US GAAP filers only.
- "AI-powered analysis" as the lead - the numbers are computed in code; the AI only rewrites them in plain words.

## Open for cfo-legal-advisor

1. Is "what history says usually happens next" acceptable wording for a past-pattern statistic in the EU/UK, or should it be "what happened after similar moments"?
2. Do the history examples ("higher two weeks later 9 times") need a standard past-performance warning next to them on marketing pages?
3. Is the footer line sufficient as the marketing-page disclaimer, or does the landing page need the full risk statement?
