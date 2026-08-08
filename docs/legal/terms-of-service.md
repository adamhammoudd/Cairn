# Cairn Terms of Service

> **DRAFT — NOT LEGAL ADVICE.** This is a first-pass, non-lawyer draft written to establish
> structure and scope, not a final document. Do not treat this as launch-ready. It must be
> reviewed and revised by a licensed attorney qualified in the relevant jurisdiction(s) before
> Cairn is made available to real users, and re-reviewed whenever the AI analysis engine's scope
> or output changes materially.

_Last drafted: Phase 6 build. Effective date: not set — do not publish until legal review is complete._

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
  analytical, scoped to a market, sector, or ticker — never to a specific user's position,
  portfolio, or personal financial situation. Cairn's AI is built with a technical guard that
  rejects any generated output resolving to a personalized directive (e.g. "you should buy/sell/
  hold"), but this guard is a best-effort filter, not a guarantee — see Section 5.
- **Not a registered investment adviser.** Cairn does not provide personalized investment advice
  and is not held out as doing so. _[Legal review required: confirm this positioning holds up
  under the jurisdiction(s) Cairn operates in — see the jurisdictional checklist.]_

## 3. Eligibility and accounts

Users must be able to form a binding contract in their jurisdiction. Account creation requires an
email and password (via Supabase Auth). Users are responsible for maintaining the confidentiality
of their credentials.

## 4. User content

Holdings, watchlists, chat messages, and settings entered by a user remain that user's data.
Cairn stores this data to provide the service (portfolio calculations, chat history, personalized
relevance ranking for the daily briefing) and does not sell it. See the Privacy Policy for full
detail.

## 5. AI analysis engine — specific disclosures

- Every probability output is accompanied by its underlying sources (news items) and historical
  analog(s) it was pattern-matched against — never a bare number. This is a structural property
  of the product, not just a policy.
- Outputs express confidence/uncertainty (confidence level, sample size of historical analogs) and
  low-confidence outputs are flagged explicitly rather than hidden.
- A server-side scope-guard rejects/logs any generated output that resolves to a personal
  directive before it is ever stored or shown to a user. This is a technical control, and like any
  automated filter it is not infallible — users should not treat the absence of a rejection as a
  guarantee of suitability for their situation.
- The AI analysis engine may be wrong, outdated, or based on an incomplete news/historical sample.
  Users should independently verify sources and consult a licensed financial advisor before making
  financial decisions.

## 6. Subscription and billing

_[Placeholder — Phase 12 introduces paid tiers via Stripe. This section needs to be written once
that phase's terms (refunds, cancellation, tier changes, failed-payment downgrade behavior) are
finalized, and reviewed alongside it.]_

## 7. Disclaimers and limitation of liability

_[Standard SaaS disclaimer language + limitation-of-liability clause to be drafted by counsel.
Given the AI analysis engine's regulatory profile, this section carries more weight than it would
for a pure news-aggregation product — do not reuse generic boilerplate without review.]_

## 8. Termination

Cairn may suspend or terminate accounts for violation of these terms. Users may delete their
account and data at any time via Settings → Export & delete (Phase 1).

## 9. Governing law and disputes

_[Placeholder — depends on the jurisdiction(s) Cairn is launched in; see the jurisdictional
checklist for open questions that affect this section specifically.]_

## 10. Changes to these terms

Cairn may update these terms; material changes affecting the AI analysis engine's scope or
disclosures will be flagged as higher-priority for legal re-review than routine changes, per the
jurisdictional checklist.

---

**Review checklist for counsel** (non-exhaustive, see `jurisdictional-checklist.md` for the full
list):
- [ ] Confirm "not investment advice" positioning is defensible given the probability-engine
      feature specifically (this is a materially different risk profile than a news-summary app)
- [ ] Draft Section 6 (billing) once Phase 12 subscription terms exist
- [ ] Draft Section 7 (liability) and Section 9 (governing law)
- [ ] Confirm arbitration/class-action-waiver clauses are wanted and enforceable in target markets
