# Jurisdictional Checklist — open questions for legal review

> This is not legal advice and resolves nothing on its own — it's a punch list of questions that
> exist *because* Cairn ships a probability/pattern-matching AI engine, not because it's a generic
> SaaS checklist. A pure news-aggregation product without the AI analysis engine would not need
> most of this list; flag these items as higher priority than routine ToS/Privacy review for that
> reason.

## Why this list is elevated in priority

Phase 4's AI analysis engine produces probability-weighted, pattern-matched output about markets,
sectors, and tickers. Even with the hard architectural constraint that it never resolves to a
personalized directive (see `terms-of-service.md` §5, `src/lib/ai/scope-guard.ts`), the *category*
of output — probabilistic market analysis — sits closer to investment-adviser-adjacent territory
than a news summary does. The questions below exist to confirm the current design's assumptions
hold up, not because we believe they don't.

## United States

- [ ] **Investment Advisers Act of 1940 — "publisher's exclusion" analysis.** Cairn's positioning
      relies on being general/impersonal analytical content (market/sector/ticker-level, not
      account-specific). Confirm whether the publisher's exclusion (or similar) actually applies
      given: (a) the daily briefing's *relevance ranking* is personalized even though the content
      isn't, and (b) the chat assistant responds to a specific user's question in a
      quasi-conversational format. Does personalized *delivery* of impersonal *content* change the
      analysis?
- [ ] **State-level investment adviser / broker-dealer registration thresholds.** Some states have
      lower bars than federal law for what counts as "investment advice." Confirm state-by-state
      exposure if launching broadly rather than in a single state.
- [ ] **FINRA / broker-dealer overlap.** Confirm there's no ambiguity given Cairn explicitly has no
      trade execution or brokerage integration — document this design decision as part of the
      analysis, since it's load-bearing for the "not a broker-dealer" position.
- [ ] **FTC / state UDAP (unfair or deceptive acts and practices).** Confirm the confidence/
      uncertainty disclosure language (low-confidence flagging, sample-size disclosure) meets the
      bar for "not misleading" given the product's own marketing language.

## European Union / UK

- [ ] **GDPR Article 22 (automated decision-making).** The daily briefing and chat relevance
      ranking use portfolio/watchlist data to select which stored analyses to surface. Confirm
      whether this constitutes "automated decision-making producing legal or similarly significant
      effects" — the current design intent is that it doesn't (content itself isn't personalized,
      only which pre-existing content is shown), but that's an engineering intent, not a legal
      conclusion. See `privacy-policy.md` §6.
- [ ] **MiFID II — investment research vs. marketing communication classification.** If EU users
      are in scope, confirm whether AI-generated probability analyses could be classified as
      "investment research" under MiFID II, which carries its own disclosure/independence
      requirements distinct from US securities law.
- [ ] **UK FCA — financial promotion rules.** Confirm whether any output could be construed as a
      "financial promotion" requiring FCA-authorized approval, given the UK's broader definition
      relative to the US.
- [ ] **Data residency / cross-border transfer.** Supabase and Anthropic API infrastructure —
      confirm where data is processed/stored and whether Standard Contractual Clauses or an
      adequacy decision covers the transfer for EU/UK users.

## Cross-cutting

- [ ] **Anthropic API terms as a subprocessor.** Confirm Anthropic's data-retention and
      training-use terms for API traffic are compatible with the Privacy Policy's representations,
      and re-confirm whenever the underlying model changes.
- [ ] **Audit trail sufficiency.** `ai_scope_guard_log` retains every flagged/rejected generation
      (Phase 4). Confirm retention period and whether this log itself is discoverable/subject to
      regulatory request, and whether that changes what should be logged.
- [ ] **Marketing language review.** Confirm all in-product and marketing copy consistently avoids
      language that could be read as a personalized recommendation, given how easily "elevated
      volatility likelihood" can be paraphrased into "you should watch out for X" by a support
      agent, blog post, or ad — this is a process/training question as much as a legal one.
- [ ] **Phase 12 billing.** Once Stripe integration ships, re-run a lighter version of this
      checklist for payment-processing-specific requirements (PCI scope is Stripe's, but consumer
      protection/refund law is jurisdiction-specific).

## Not yet in scope (flag if roadmap changes)

- Crypto-specific regulatory questions (Phase 9 extends the engine to crypto) — revisit this
  checklist when that phase starts, since crypto carries a different regulatory regime in most
  jurisdictions than equities.
- Any future feature that would let a user act directly on an analysis (e.g. one-click trade) is
  explicitly out of scope per the product's permanent framing — if that ever changes, this entire
  checklist needs to be redone from a different premise, not amended.
