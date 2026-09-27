# Assistant v2: cost at 50 beta users, and terms/privacy checks for web search + portfolio figures

**Author:** cfo-legal-advisor · **Date:** 2026-09-27 · **For:** Adam (founder), chief-of-staff, dev-lead
**Branch:** `feat/assistant-v2` · **Status:** OPEN. These are inputs for decisions, not the decisions themselves.
**Related:** `2026-09-04-ai-portfolio-figures.md`, `2026-09-26-free-vs-premium.md`, `2026-08-30-groq-fallback-endpoint.md`

---

## Part 1 - [CFO HAT] Monthly LLM + search cost, 50 active beta users

**Inputs (measured by the engineering session on 2026-09-27; not re-derived here):** ~4 calls/answer on `openai/gpt-oss-120b`,
~5,400-6,500 input + ~630 output tokens/answer, **$0.00128/answer (mean)**, $0.0012-0.0014 range. A failed guard adds a repair compose call (+~40%).
Analysis ~$0.002 each. **Unverified:** the Groq $0.15/$0.60 per M token prices come from third-party summaries (aipricing.guru, cloudzero.com),
because Groq's own pricing page did not render. **Unverified:** the Groq `browser_search` per-search fee. $0.01 is only the code placeholder (`WEB_SEARCH_COST_USD`).
The Brave figure (~$5 / 1,000 queries) comes from the brief and I have not checked it against Brave's price page.

**My assumptions (labelled as such):** 30-day month. In light/expected, an answer that searches runs **2 searches** on average (the maximum is 3).
Each search adds **~4,000 input tokens** of results to the context, which works out to **~$0.0006/search** at $0.15/M, with either provider.
Worst case prices every answer at the top of the range and assumes every answer needs a repair: $0.0014 x 1.4 = **$0.00196/answer**. Brave's free credits are ignored.

| Line | Light | Expected | Worst case |
|---|---|---|---|
| Answers/month (50 x per-day x 30) | 50x5x30 = 7,500 | 50x15x30 = 22,500 | 50x200x30 = 300,000 |
| Chat LLM ($/answer x answers) | x0.00128 = **$9.60** | x0.00128 = **$28.80** | x0.00196 = **$588.00** |
| Analyses (50 x n x $0.002) | 500 -> **$1.00** | 1,500 -> **$3.00** | 5,000 -> **$10.00** |
| Searches/month | 7,500x10%x2 = 1,500 | 22,500x25%x2 = 11,250 | 300,000x3 = 900,000 |
| Search-result tokens (x$0.0006) | $0.90 | $6.75 | $540.00 |
| (a) Groq search fee (x$0.01 placeholder) | $15.00 | $112.50 | $9,000.00 |
| (b) Brave fee (x$0.005) | $7.50 | $56.25 | $4,500.00 |
| **Total with (a) Groq browser_search** | **$26.50** | **$151.05** | **$10,138.00** |
| **Total with (b) Brave** | **$19.00** | **$94.80** | **$5,638.00** |
| LLM-only share (both options) | $11.50 | $38.55 | $1,138.00 |

**What the numbers say**
1. **Search is the cost driver, not inference.** In the expected case search fees are 60-75% of spend. Each $0.01 of per-search fee adds about $112/month
   at expected usage. The Groq figure could be off in either direction until Groq's real per-search price is confirmed, so treat the (a) column as a placeholder.
2. **The worst case is set by the abuse cap, not by real usage.** One user at the cap costs $0.39/day in LLM spend alone (~$12/month).
   With 3 searches on every answer, that user costs **$6.75/day with Groq (~$203/month)** or **$3.75/day with Brave (~$113/month)**.
   No subscription price we are likely to charge covers that.
3. **Post-beta risk:** today every beta user is Premium, so no one is on a free cap. Once billing is live, Free is 20 chats/day
   (`TIER_LIMITS`). At expected per-answer costs that is at most ~$0.77/free user/month in LLM spend, and up to ~$6.30 more if Free can use
   search at 2 x $0.0106 per answer. Recommendation: **web search should be Premium-only, or Free should get a small separate search cap.**
   Otherwise non-converting free users become the main unit-economics loss. This is a scope call for chief-of-staff/Adam.

**Recommendations (decisions belong to Adam / chief-of-staff)**
- **Add a separate per-user search cap:** suggest **20 searches/user/day** during beta. At 50 users this limits worst-case search spend to
  30,000/month, i.e. ~$318 with Groq or ~$168 with Brave, instead of $9,000/$4,500.
- **The 200/day cap is too loose for LLM-only abuse during beta.** Suggest **100/day**, which is ~7x expected usage. That halves worst-case chat
  spend to ~$294/month. Keep 200/day only if the search cap and a spending limit are both in place.
- **Groq spending limit:** **$75/month** if Brave provides search (Groq then carries only ~$39 expected LLM spend, giving ~2x headroom).
  **$200/month** if Groq browser_search is used (~$151 expected, so the margin is thin; review after 2 weeks of real usage).
  Tradeoff to accept knowingly: when the limit is hit, the assistant goes down for every user.
- **DeepInfra / Cerebras (fallback, both at HTTP 402 today):** prepaid top-up of **$20-25** each, as fallback only. Do not let the
  fallback quietly become an unmetered second budget.
- **Brave:** set its own monthly budget alert at ~$60, just above the expected $56.
- Suggest an app-side daily global spend kill-switch (sum of logged `cost_usd` per day). This is a scope item, so I am flagging it to chief-of-staff and not deciding it.

---

## Part 2 - [LEGAL & COMPLIANCE HAT]

> **NON-LAWYER FIRST DRAFT - REQUIRES PROFESSIONAL LEGAL REVIEW.** This is not legal advice and it is not final or launch-ready.
> I had **no web access** in this session, so I did **not** read Groq's or Brave's terms. Nothing below says what those terms contain.
> Each item is a question for Adam or counsel to answer from the actual documents, with the document version/date recorded.

### (a) Groq `browser_search`: results shown inside a paid product
- [ ] Which documents apply: Groq Services Agreement / ToS, AUP, and any tool-specific or "built-in tools" terms? Record the URLs and dates.
- [ ] Is `browser_search` provided by a third-party search vendor? If so, do that vendor's terms flow down to us (display rules, attribution, bans on storage)?
- [ ] May search results, snippets and cited URLs be **shown to end users** in a **commercial, paid** product? Are there limits on redistribution?
- [ ] Are there required attribution or "powered by" marks, or rules on how citations must be shown?
- [ ] May we **store** results or cited snippets in `chat_messages` (migration 0057 meta)? For how long? May we show them again from history?
- [ ] Does using cited pages' content (quoting or summarising third-party news) raise copyright or publisher-ToS issues on our side, whatever Groq permits?
      Counsel should consider this alongside the existing Nasdaq ToS escalation.
- [ ] Does the AUP limit financial-information use cases, or require disclaimers when outputs concern securities?
- [ ] What is the per-search fee and how is it billed (see Part 1)? Is it covered by the spending limit?
- [ ] Are search queries (which may contain user text) retained under the same terms as prompts, and does ZDR cover them?

### (b) Brave Search API: results shown inside a paid product
- [ ] Which plan tier permits **commercial use** and **showing results to end users**? Is there a separate "AI" / "Data for AI" tier
      required when results are fed to an LLM and summarised?
- [ ] **Storage/caching:** may we persist results or snippets (chat history, meta column)? Is there a maximum cache duration? Must stored data be deleted when the subscription ends?
- [ ] **Attribution:** is a Brave attribution mark or link required wherever results or derived answers appear?
- [ ] Are there restrictions on **modifying, summarising, or mixing** results with other sources (our answer composes them with analyses)?
- [ ] Rate limits and what happens when they are exceeded (fail closed? overage billing?). Do the free monthly credits apply to commercial use?
- [ ] Does Brave log or retain our queries, and is there a DPA available?

### (c) Portfolio figures now sent to the inference provider - **conflict with the 2026-09-04 memo**
The brief says the assistant now sends real **values, weights and gains** to the provider, behind the "Portfolio context" toggle, which is **default ON**.
That is option **(b)** of `2026-09-04-ai-portfolio-figures.md`. That memo listed six preconditions for (b) and required **default OFF, explicit opt-in**.
Per the memory notes, option (c) was built behind `ENABLE_PORTFOLIO_CONTEXT` (off) and is still waiting on Groq ZDR/DPA confirmation.
**I am flagging this to chief-of-staff/Adam as not ready to enable in production.** The scope call is theirs, but these items need closing first:
- [ ] **Which provider actually receives the data in prod** (Groq? DeepInfra/Cerebras on fallback?). Each one needs its own answers to the questions below.
- [ ] **ZDR / data retention:** is org-level ZDR enabled at *each* provider, confirmed in writing, and does it cover tool calls and search queries?
- [ ] **DPA:** is a signed DPA in place with each provider? Subprocessor list, processing locations, cross-border transfer basis (GDPR Art. 44+ if any EU/UK users)?
- [ ] **Training:** do the terms confirm inputs are not used for training?
- [ ] **Privacy policy:** `docs/legal/privacy-policy.md` §4/§5 currently describes *symbol-level* context. It must be changed, **by counsel**, to name figures
      (values, weights, gains), the providers, retention/ZDR status, and the deletion logic that depends on non-retention.
- [ ] **Consent:** is a toggle that is ON by default valid consent (GDPR Art. 6/7; CPRA sensitive-PI treatment of financial data)? My conservative
      recommendation is **default OFF, with a plain-language opt-in at the moment of enabling** (what is sent, to whom, how to turn it off), and logging of consent.
- [ ] **Adviser-adjacent risk:** once the model can see position economics, the structural protection is gone. Has the scope guard added the
      "no figure not present verbatim in context" rule plus `POSSESSION_EVALUATION` coverage, and passed the adversarial suite?
      Is the layer-3 classifier fail-open fixed? Counsel still has to sign off on whether position-aware output changes Cairn's status.
- [ ] **Disclaimer:** answers that use portfolio context must still carry the informational/sourced-context disclaimer, never buy/hold/sell framing.

*Non-lawyer first draft. Requires professional legal review before any reliance. Nothing here clears a launch.*
