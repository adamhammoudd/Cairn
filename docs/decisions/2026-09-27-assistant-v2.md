# Assistant v2: why the old assistant refused, and what replaces it

Branch `feat/assistant-v2`, 2026-09-27. Engineering note for dev-lead and Adam. Not a legal document.

## Why it refused (all line numbers are on `main` at 94423dd)

1. **"How's NVIDIA looking?" → "not enough info, generate an analysis on the Research page."**
   The assistant's only data was *stored analyses* plus the six newest headlines (`src/lib/ai/context.ts:232`). No price, no scorecard, no company numbers, no history engine. The system prompt told the model to send the reader to the Research page whenever that context did not cover the question (`src/lib/ai/chat-generate.ts:33`, again at `:73`). Every guard failure also ended in a rewrite that says the same thing (`src/lib/ai/scope-guard.ts:612`, `:614`), and chat fails closed when the classifier is unreachable (`chat-generate.ts:197-207`). So an unreachable or rate-limited model produced the Research-page line too.
2. **Any portfolio question → "I can't access your portfolio."**
   Portfolio figures sat behind `ENABLE_PORTFOLIO_CONTEXT === "true"` (`src/lib/ai/portfolio-summary.ts:34`), which is set in no environment. Without it, `buildChatContext` never built the summary (`context.ts:244`), and the prompt told the model it "has no portfolio figures at all". Even with the flag on, the layer-3 classifier's rubric counted "evaluating the reader's own holdings, returns, or allocation" as advice (`src/lib/ai/scope-classifier.ts:58`). That rubric does not separate "your portfolio is up 2%" from "your portfolio is too concentrated", so a plain factual answer was at risk of being flagged.
3. **When an analysis existed, it just repeated it.**
   The prompt instructed the model to restate the stored headline and history line "exactly as given" and to point at the card under the reply (`chat-generate.ts:43`, plus the card note). With nothing else in context, restating was all it could do.
4. **Side effect:** a ticker with no stored analysis triggered `runAnalysisGeneration` from chat (`src/app/api/chat/route.ts:111-113`). That spent one of the reader's monthly analyses on a chat question, and young symbols dead-ended in the thin-data panel.

## What replaces it

- **Agent loop** (`src/lib/ai/assistant/agent.ts`). The tools a question obviously needs are prefetched in code. The model may then call more tools: up to 6 rounds, 14 calls and 3 web searches per answer. After that, one structured *compose* request produces the lead, up to 4 tiles, sections with `[n]` citations, and 2–3 follow-ups.
- **Tools** (`tools.ts` over `data.ts`) are all server-side and read-only: `find_symbol` (with on-demand ingestion), `get_quote`, `get_price_summary`, `get_scorecard`, `get_company_numbers` (quarterly/TTM only after `getUserPlan()` says Premium), `get_history_outcome` (the analog engine run live in memory, reusing a stored analysis under 24h old, never storing one), `get_news`, `get_calendar`, `get_portfolio` (the Portfolio page's own `computeTotals`, plus the dashboard's briefing), `compare`, and `web_search`. Tools return display strings formatted in code, so the model copies figures and never computes them.
- **Guards** (`guards.ts`) run on the final text and fail closed:
  - every number must appear in this turn's tool results;
  - `checkScopeGuard`, the analysis text's advice and certainty vocabulary, and no "For you" section without a portfolio read;
  - every `[n]` points at a real source, and every news or web sentence cites one;
  - then the layer-3 classifier, which fails closed.

  On failure there is one repair attempt. If that also fails, the answer is rebuilt in code from the tools' own fact sentences. It never refuses with "go to the Research page".
- **Web content** is fenced as untrusted data in the prompt, with URL and publisher kept for citation.
- **Per message** (`chat_messages.meta`, migration 0057): the Checked line, tiles, sources, follow-ups, the tool log, guard failures, token usage and cost.
- **Portfolio context**: the global env gate is replaced by the per-user `assistant_use_portfolio_context` (already defaulting to ON), with a switch and a one-line note in the chat header.

### Exemptions in the figure guard (so they can be reviewed)

These pass without being in the tool results:
- citation marks `[n]`;
- plain counts 0–12 written without % or a currency ("the last 3 headlines");
- calendar years 1990–2040;
- numbers inside names (S&P 500, 10-K, Q3, 200-day).

A small number *with* % or a currency is a figure and is checked ("down 7%" is caught).

## Decisions for Adam

1. **CLAUDE.md guardrail wording.** The diff is in this branch. Section 1 must not ship until it is approved.
2. **Sending portfolio figures to the inference provider.** With the switch on, real values, weights and gains go to the model host. The 2026-09-04 E1 memo said to confirm the provider's retention/ZDR and DPA, and to update the privacy policy, before doing that. This brief asks for it default-ON for beta users. Please confirm that the vendor check is done, or that you accept it for the beta.
3. **Web search provider**: set `WEB_SEARCH_PROVIDER` + `WEB_SEARCH_API_KEY`. Search is off until then, and the assistant says so plainly.

Cost per answer and the provider terms are in `2026-09-27-assistant-cost-and-search-terms.md` (cfo-legal-advisor).
