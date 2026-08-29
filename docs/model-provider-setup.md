# Model provider setup

Cairn's analysis engine and chat assistant call **Groq**, hosted, over its
OpenAI-compatible `/chat/completions` API. The decision and its reasoning are in
`docs/decisions/2026-08-20-model-provider.md`.

> **Superseded:** this file previously documented a self-hosted Ollama/vLLM
> setup. That was never the shipped configuration after 2026-08-21 and the doc
> outlived the decision, which caused a later review to report a
> provider contradiction that did not exist in the code. Self-hosting is not
> supported: a Vercel function has no route to a developer's laptop, and the
> product requirement is that users on their own devices need install nothing.

## Configuration

```
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=openai/gpt-oss-120b
GROQ_API_KEY=<server-side only; never NEXT_PUBLIC_*, never committed>
LLM_TIMEOUT_MS=60000
```

Set these in `.env.local` **and** in Vercel → Settings → Environment Variables
for Production, Preview and Development. A missing key is reported as an
explicit configuration error, not a generic failure (`isLlmConfigured()`).

Re-check <https://console.groq.com/docs/deprecations> before changing
`LLM_MODEL`. Groq retired `llama-3.3-70b-versatile` on 2026-08-16;
`openai/gpt-oss-120b` is its named replacement.

## What the model is and isn't asked to do

The model writes **prose only**. It never produces a number or picks a citation.

| Output | Produced by |
|---|---|
| `probability_low` / `probability_high` | **Code** — Wilson score interval over historical analogs (`src/lib/ai/analytics.ts`) |
| Confidence level | **Code** — graded on sample size + interval width |
| Sample size | **Code** — count of analogs with usable price data |
| Cited sources / analogs | **Code** — the rows actually fed into the computation |
| `analysis_type` label + `reasoning_text` | **Model** |
| Chat responses | **Model** |

This is what makes a cited source guaranteed to be a row that was really
retrieved. Do not relax it.

## Scope guard interaction

`src/lib/ai/chat-generate.ts` buffers the full response, runs the scope guard,
and replaces any violation with a deterministic template built from stored,
already-validated analyses — before anything is streamed to the user or written
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
transmitted to Groq**, a third-party subprocessor. `docs/legal/privacy-policy.md`
and `docs/legal/jurisdictional-checklist.md` must reflect that. Both remain
non-lawyer drafts requiring professional review.
