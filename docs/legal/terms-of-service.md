# Cairn Terms of Service

> **DRAFT - NOT LEGAL ADVICE.** This is a first-pass, non-lawyer draft written to establish
> structure and scope, not a final document. Do not treat this as launch-ready. It must be
> reviewed and revised by a licensed attorney qualified in the relevant jurisdiction(s) before
> Cairn is made available to real users, and re-reviewed whenever the AI analysis engine's scope
> or output changes materially.

_Last drafted: Phase 6 build. Effective date: not set - do not publish until legal review is complete._

## 1. What Cairn is

Cairn is a portfolio-tracking and market-research application. It aggregates market and news
data, tracks user-entered holdings, and provides an AI-generated analysis engine that surfaces
probability-weighted, market/sector/ticker-level context (e.g. "elevated volatility likelihood for
semiconductor stocks given current earnings-season news flow, based on similar historical
patterns").

## 2. What Cairn is not

- **Not a broker-dealer.** Cairn does not execute trades, hold custody of assets, or connect to
  brokerage accounts. Holdings are self-reported by the user for tracking purposes only.
- **Not investment advice.** Every output from the AI analysis engine is informational and
  analytical, scoped to a market, sector, or ticker - never to a specific user's position,
  portfolio, or personal financial situation. Cairn's AI is built with a technical guard that
  rejects any generated output resolving to a personalized directive (e.g. "you should buy/sell/
  hold"), but this guard is a best-effort filter, not a guarantee - see Section 5.
- **Not a registered investment adviser.** Cairn does not provide personalized investment advice
  and is not held out as doing so. _[Legal review required: confirm this positioning holds up
  under the jurisdiction(s) Cairn operates in - see the jurisdictional checklist.]_

## 3. Eligibility and accounts

Users must be able to form a binding contract in their jurisdiction. Account creation requires an
email and password (via Supabase Auth). Users are responsible for maintaining the confidentiality
of their credentials.

## 4. User content

Holdings, watchlists, chat messages, and settings entered by a user remain that user's data.
Cairn stores this data to provide the service (portfolio calculations, chat history, personalized
relevance ranking for the daily briefing) and does not sell it. See the Privacy Policy for full
detail.

## 5. AI analysis engine - specific disclosures

- Every probability output is accompanied by its underlying sources (news items) and historical
  analog(s) it was pattern-matched against - never a bare number. This is a structural property
  of the product, not just a policy.
- Outputs express confidence/uncertainty (confidence level, sample size of historical analogs) and
  low-confidence outputs are flagged explicitly rather than hidden.
- A server-side scope-guard rejects/logs any generated output that resolves to a personal
  directive before it is ever stored or shown to a user. This is a technical control, and like any
  automated filter it is not infallible - users should not treat the absence of a rejection as a
  guarantee of suitability for their situation.
- The AI analysis engine may be wrong, outdated, or based on an incomplete news/historical sample.
  Users should independently verify sources and consult a licensed financial advisor before making
  financial decisions.

## 6. Subscription and billing

Cairn offers a free tier and a paid Premium tier billed through Stripe on a recurring basis at the
price shown at checkout, renewing automatically until cancelled. Users can cancel from billing
settings or the Stripe customer portal; cancellation stops the next renewal and Premium features
stay available until the end of the paid period. A failed renewal payment downgrades the account
to the free tier rather than removing access to the user's own data.

_[Legal review: refund policy, proration on mid-period tier changes, price-change notice periods,
and tax treatment are NOT stated and must be drafted alongside the finalized Phase 12 billing
terms before Premium is offered for sale. First draft of the operational shape is on
`src/app/terms/page.tsx` §9, flagged as draft.]_

## 7. Disclaimers and limitation of liability

First-draft "as is / as available" disclaimer and a limitation-of-liability clause are on
`src/app/terms/page.tsx` §10, both explicitly flagged as draft.

_[Legal review, high priority: the specific liability cap, the non-excludable carve-outs (gross
negligence, fraud, death/personal injury, non-waivable EU/UK consumer rights), and the interaction
with §7's arbitration/class-waiver intent must be drafted or reviewed by counsel per target
market. The AI analysis engine's regulatory profile means generic SaaS boilerplate is not safe to
reuse here.]_

## 8. Termination

Users may delete their account and data at any time via Settings → Export & delete. Cairn may
suspend or terminate an account that violates these terms (in particular §6 content rules) or
where required by law, with notice and an export opportunity where practical and not legally
prohibited. Sections that should survive termination (4, 6, 10, 12 on the live page) continue to
apply. Full text on `src/app/terms/page.tsx` §11.

## 9. Governing law and disputes

Draft on `src/app/terms/page.tsx` §12, flagged as not-to-be-relied-on-as-written.

_[Legal review: governing law, forum, and interaction with §7 arbitration depend on the launch
jurisdiction(s), which are undecided. Must be written around mandatory local-forum consumer rights
in the EU/UK and elsewhere. Completed by counsel in the pre-launch review with the jurisdictional
checklist.]_

## 10. Changes to these terms

Cairn may update these terms; minor changes are posted with a new "last updated" date, material
changes (AI-engine scope/disclosures, billing, dispute-resolution, liability) get advance notice
through the service or by email and are flagged for legal re-review. Full text on
`src/app/terms/page.tsx` §13.

---

**Review checklist for counsel** (non-exhaustive, see `jurisdictional-checklist.md` for the full
list):
- [ ] Confirm "not investment advice" positioning is defensible given the probability-engine
      feature specifically (this is a materially different risk profile than a news-summary app)
- [ ] Draft Section 6 (billing) once Phase 12 subscription terms exist
- [ ] Draft Section 7 (liability) and Section 9 (governing law)
- [ ] Confirm arbitration/class-action-waiver clauses are wanted and enforceable in target markets
