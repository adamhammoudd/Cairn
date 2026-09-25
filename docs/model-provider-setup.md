# Model provider setup

Cairn's analysis engine and chat assistant call **DeepInfra**, hosted, over its
OpenAI-compatible `/chat/completions` API, running `openai/gpt-oss-120b`. Until
2026-09-25 the same model ran on Groq's free tier; why it moved is in
`docs/decisions/2026-09-25-deepinfra.md` (the original hosted-vs-self-hosted
reasoning is in `docs/decisions/2026-08-20-model-provider.md`).

> **Superseded:** this file previously documented a self-hosted Ollama/vLLM
> setup. That was never the shipped configuration after 2026-08-21 and the doc
> outlived the decision, which caused a later review to report a
> provider contradiction that did not exist in the code. Self-hosting is not
> supported: a Vercel function has no route to a developer's laptop, and the
> product requirement is that users on their own devices need install nothing.

## Configuration

```
LLM_BASE_URL=https://api.deepinfra.com/v1/openai
LLM_MODEL=openai/gpt-oss-120b
LLM_API_KEY=<DeepInfra key; server-side only; never NEXT_PUBLIC_*, never committed>
LLM_TIMEOUT_MS=60000
```

`LLM_BASE_URL` and `LLM_MODEL` are the code's defaults, so only `LLM_API_KEY`
is strictly required. Set it in `.env.local` **and** in Vercel → Settings →
Environment Variables for Production and Preview. A missing key is reported as
an explicit configuration error, not a generic failure (`isLlmConfigured()`).
The old `GROQ_API_KEY` is no longer read.

Spending: DeepInfra is prepaid. Keep auto top-up off (or capped) so the
balance is the monthly spend cap. When it runs out, DeepInfra answers HTTP 402
and users see the "assistant is temporarily busy" message until it is topped up.

Check it works end to end with `npm run test:live` (real call, writes nothing)
and `npm run test:llm-provider` (no network).

## What the model is and isn't asked to do

The model writes **prose only**. It never produces a number or picks a citation.

| Output | Produced by |
|---|---|
| `probability_low` / `probability_high` | **Code** - Wilson score interval over historical analogs (`src/lib/ai/analytics.ts`) |
| Confidence level | **Code** - graded on sample size + interval width |
| Sample size | **Code** - count of analogs with usable price data |
| Cited sources / analogs | **Code** - the rows actually fed into the computation |
| `analysis_type` label + `reasoning_text` | **Model** |
| Chat responses | **Model** |

This is what makes a cited source guaranteed to be a row that was really
retrieved. Do not relax it.

## Scope guard interaction

`src/lib/ai/chat-generate.ts` buffers the full response, runs the scope guard,
and replaces any violation with a deterministic template built from stored,
already-validated analyses - before anything is streamed to the user or written
to `chat_messages`. Check how often that is firing:

```sql
select source_surface, flag_reason, count(*)
from ai_scope_guard_log
where flagged
group by 1, 2
order by 3 desc;
```

A high rewrite rate is a model/prompt problem, not a reason to loosen the guard.

## Privacy consequence

Prompts, chat messages, and portfolio-derived relevance context **are
transmitted to DeepInfra**, a third-party subprocessor. The live privacy page
(`src/app/privacy/page.tsx`) and `docs/legal/jurisdictional-checklist.md` must
reflect that. Both remain non-lawyer drafts requiring professional review.
