# Decision memo: should Cairn's AI assistant ever be given the user's real portfolio dollar figures?

**Hat:** Legal & Compliance (cfo-legal-advisor)
**Status:** OPEN - decision for the founder. This memo does not decide it.
**Raised by:** 2026-09-04 full-app source review, finding #1 (`docs/audits/2026-09-04-full-app-source-review.md`)
**Related:** PR #58 (confabulation-coaching half already fixed and merged), `docs/legal/privacy-policy.md` §4/§5, `docs/decisions/2026-08-30-groq-fallback-endpoint.md`

> **NON-LAWYER FIRST DRAFT - REQUIRES PROFESSIONAL LEGAL REVIEW.**
> Written by a non-lawyer for internal decision-making. It is not legal advice, is not
> finalized, and must not be treated as launch-ready. Nothing here clears a launch. A
> licensed attorney (securities / investment-adviser-adjacent, plus privacy counsel for the
> data-transfer questions) must review before any of option (b) or (c) is built or shipped.
> Where this memo is unsure, it flags the ambiguity rather than resolving it - that is
> deliberate.

---

## 1. What the code does today

- `src/lib/ai/context.ts` `buildChatContext` / `getUserSymbols`: the assistant's context is
  built from **ticker symbol strings only** (holdings + watchlist symbols), used purely to
  rank which stored, pre-validated analyses and news items to surface. No dollar value, no
  day P/L, no cost basis, no average entry ever enters the prompt.
- `src/lib/actions/settings.ts`: `assistant_use_portfolio_context` toggles only *whether
  symbols are read for relevance ranking*. Per the code comments it "cannot change what the
  assistant is allowed to say."
- `src/lib/ai/scope-guard.ts`: server-side deterministic + optional semantic validator on
  every chat turn. `PERSONAL_POSSESSION` was recently narrowed (PR #58) so a neutral factual
  statement about a holding is not auto-rejected; evaluative language ("overexposed",
  "too concentrated" - `POSSESSION_EVALUATION`) still flags.
- `src/lib/ai/chat-generate.ts` `SYSTEM_PROMPT`: worked example no longer models answering
  with specific portfolio dollar figures (PR #58).
- `src/lib/ai/llm.ts`: inference is sent to **Groq** (hosted, third-party), OpenAI-compatible
  API. Optional fallback endpoint (Cerebras) is currently unconfigured.

`CLAUDE.md` guardrail: the AI engine "NEVER analyzes or advises on a specific user's personal
position … enforced by a server-side scope-guard validator, not just prompt instructions."

## 2. The core tension - where is the line?

Showing a user **their own data summarized back to them** (portfolio value, day P/L) is
arguably not "personalized investment advice" - it is arithmetic on data they entered, the
same figure the Portfolio page already shows. A neutral restatement ("your portfolio is up
1.24% today") is not a recommendation.

But the line is thin and one-directional. Every dollar figure the *model* sees is a figure
it can then reason *from*: value + cost basis + concentration is exactly the input set for
"you're overexposed to AMD, you should trim." The guardrail's whole design (`scope-guard.ts`
layer 1) is *structural* - a personalized recommendation is meant to be impossible to
*request*, not merely filtered after generation. Feeding the model real position economics
removes that structural protection and leaves only layers 2 and 3 (a linguistic filter the
audit shows is evadable by rephrasing, plus a semantic classifier that **fails open under
load** per audit finding #2 in the AI section). 

My assessment: the existing scope guard **cannot be relied on alone** to hold the line if
the model has the numbers. It is a linguistic filter, not a proof - its own header comment
says so. It would need a new, dedicated rule (see §5) and even then the residual risk is a
model that produces a *grounded-looking* evaluative nudge that reads as neutral.

Regulatory framing to flag for counsel (not resolve here): US investment-adviser rules turn
on whether Cairn is giving advice "as to the advisability of investing in … securities" for
compensation. A per-user, position-aware output moves toward that line in a way that
market/sector/ticker commentary does not. This is the single most important constraint in
the company and must not be softened for product appeal.

## 3. Data-exposure / privacy analysis

Portfolio value, P&L, and cost basis are **personal financial data**. Putting them in an LLM
prompt sent to Groq means transmitting them to a third-party subprocessor for processing.
Current posture (`privacy-policy.md` §4–5): Groq is disclosed as a model subprocessor;
prompts and "portfolio-derived relevance context" are already disclosed as transmitted; Groq
is stated not to retain inputs/outputs by default, with troubleshooting logs aging out ~30
days; **org-level Zero Data Retention (ZDR) is an open founder action item, not yet enabled.**

How ZDR gates this:

- **Symbol-only (today):** what leaves is a list of tickers - low sensitivity, already
  disclosed. Tolerable without ZDR, though ZDR is still recommended.
- **Dollar figures:** materially more sensitive. Sending a user's net worth proxy and
  cost basis to a vendor whose retention/training terms have *not* had legal review (the
  privacy policy flags this explicitly as unreviewed) is not defensible. ZDR being
  **confirmed enabled and contractually documented** should be a hard precondition, plus
  counsel confirming Groq's DPA, retention terms, and processing locations (cross-border
  transfer / GDPR Art. 44+ if any EU users).

Privacy policy would need to: (a) state explicitly that portfolio *figures* (value, P&L,
cost basis), not just symbols, are transmitted to Groq when the setting is on; (b) state ZDR
is in force and what it means; (c) tie the toggle to consent language; (d) update the
deletion section (§5) - the "relies on Groq non-retention" logic only holds under ZDR.

## 4. Options and compliance posture

**(a) Stay symbol-only (status quo).**
Confabulation of a figure is *structurally impossible* - the model never has one. Questions
about "your portfolio" get deflected/refused. Strongest compliance posture; lowest product
usefulness for portfolio questions. No new privacy disclosure, no new consent, no ZDR
dependency. Zero new legal surface.

**(b) Give the model portfolio figures when `assistant_use_portfolio_context` is ON, behind
explicit consent, only after Groq ZDR is confirmed.**
Medium-high risk. Puts the adviser-adjacent question and the data-transfer question both in
play. Defensible *only* if every precondition in §5 is met and counsel signs off on the
adviser-status analysis. The scope guard must be materially strengthened first. Consent must
be specific, opt-in, and revocable - not a buried default.

**(c) Compute portfolio summaries in code, render them in the UI next to chat; the model only
ever refers to "the summary above" and is never given raw figures.**
Lower risk than (b), higher usefulness than (a). The figure the user sees is always real
(computed by Cairn, not generated). The model still should not *restate* the numbers
(guard rule needed: no bare dollar figure not present in context - same rule as (b)), but it
never receives position economics, so layer-1 structural protection is largely preserved.
Still needs: privacy note that a computed summary is shown alongside chat (data stays on
Cairn infra, not sent to Groq - a genuine selling point), and a guard rule against the model
echoing figures. Does **not** strictly require ZDR because the sensitive figures never leave
Cairn, though ZDR remains independently advisable.

## 5. Recommendation (for the founder to decide - not a decision)

**Recommended: option (c) now; treat option (b) as a later, gated step, not a launch item.**
Option (c) delivers most of the user value (grounded, real figures next to the chat) while
keeping the sensitive numbers on Cairn's own infrastructure and preserving the structural
"the model cannot reason from position economics" protection that is the whole point of the
guardrail. Option (a) remains fully acceptable if (c) is more than the team wants to build
before launch - the scope choice is the founder's / chief-of-staff's call, and I am only
flagging that (a) and (c) are both low-risk while (b) is not launch-ready.

**Before option (b) could ship, all of the following must be true (and none are today):**

1. Groq **org-level ZDR enabled**, and its scope confirmed in writing; Groq DPA + retention
   terms + processing locations reviewed by privacy counsel.
2. Privacy policy updated to disclose transmission of portfolio *figures* (not just symbols),
   ZDR status, and cross-border transfer basis - reviewed by counsel, not self-published.
3. **Explicit opt-in consent UX** at the point the setting is enabled: plain-language
   statement of what is sent, to whom, and that it can be turned off; default OFF; logged.
4. A new scope-guard rule that **flags any bare dollar figure, percentage-of-cost, or
   cost-basis claim in model output that is not present verbatim in the turn's context
   block** - deterministic, fail-closed, with the same audit-log treatment as the existing
   rules. Adversarial test pass (paraphrase suite) before relying on it.
5. Counsel sign-off specifically on whether position-aware output changes Cairn's status
   under US investment-adviser-adjacent rules (and equivalent in any other target market).
6. `POSSESSION_EVALUATION` coverage re-reviewed against the new capability, and layer-3
   classifier's fail-open-under-load behaviour (audit AI-section #1) resolved or the
   feature gated off when the classifier is unavailable.

**Do not** enable option (b), or ship option (c) without rule #4, until items above are
closed and the legal review in the disclosure banner has actually happened.

---

## Jurisdictional checklist deltas this decision adds (all need licensed-lawyer review)

- US: investment-adviser / IA-adjacent analysis of per-user position-aware AI output.
- US state money-transmitter / financial-data rules - likely N/A (no custody, no execution)
  but confirm given cost-basis storage.
- GDPR/UK-GDPR: Art. 6 basis for the toggle (consent), Art. 44+ transfer basis to Groq,
  subprocessor listing / DPA, DPIA consideration for "financial data to a third-party LLM."
- CCPA/CPRA: "sensitive personal information" treatment of financial account data; disclosure
  and opt-out mechanics.
- Retention: Groq ZDR as the load-bearing control for the deletion promise in
  `privacy-policy.md` §5 - confirm it is contractual, not best-effort.

*Non-lawyer first draft. Requires professional legal review before any reliance.*
