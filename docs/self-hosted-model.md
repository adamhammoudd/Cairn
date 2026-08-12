# Self-hosted model setup

Cairn calls **no third-party model API**. The analysis engine and the chat
assistant both talk to a model you run yourself, via an OpenAI-compatible
`/chat/completions` endpoint.

Anything that speaks that protocol works: **Ollama** (easiest), **vLLM**
(fastest on GPU), **llama.cpp's `llama-server`** (leanest on CPU), or LM Studio.
The instructions below use Ollama.

## 1. What the model is actually asked to do

Worth knowing before picking a model size, because it's less than you'd expect:

| Task | Who does it |
|---|---|
| Probability range (`probability_low`/`high`) | **Code** — Wilson score interval over historical analogs (`src/lib/ai/analytics.ts`) |
| Confidence level | **Code** — graded on sample size + interval width |
| Sample size | **Code** — count of analogs with usable price data |
| Which sources/analogs are cited | **Code** — the rows actually fed into the computation |
| `analysis_type` label + `reasoning_text` prose | **Model** |
| Chat responses | **Model** |

So the model never picks a number and never chooses a citation. It paraphrases
figures it was handed, and it holds a conversation. Both are jobs a 3B–7B model
can do acceptably — which is why this design works on a modest VPS.

## 2. Install Ollama and pull a model

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:7b-instruct
```

Model sizing, assuming CPU-only (most rented VPSs):

| RAM | Model | Notes |
|---|---|---|
| 4 GB | `qwen2.5:1.5b-instruct` | Usable for chat; prose quality is noticeably thin |
| 8 GB | `qwen2.5:3b-instruct` | Reasonable floor for the analysis prose |
| 16 GB | `qwen2.5:7b-instruct` | **Recommended default** — good instruction-following |
| 32 GB+ | `qwen2.5:14b-instruct` | Better prose; slow on CPU (expect 30s+ per response) |

With an NVIDIA GPU, use vLLM instead and go straight to a 7B–14B — you'll get
responses in a couple of seconds rather than tens of seconds.

Qwen2.5-Instruct is the default recommendation because it follows JSON-output
instructions more reliably than similarly-sized alternatives, which matters for
`generate.ts`. Llama 3.1/3.2-Instruct and Mistral-Instruct also work.

## 3. Point Cairn at it

In `.env.local`:

```
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_MODEL=qwen2.5:7b-instruct
LLM_TIMEOUT_MS=180000
```

Note the `/v1` — that's Ollama's OpenAI-compatible path, not its native `/api`.

Verify Cairn can reach it:

```bash
npm run test:scope-guard
```

If the server is unreachable the suite says so explicitly and skips its live
tier rather than silently passing.

## 4. Securing it (important if the VPS is internet-facing)

Ollama binds `127.0.0.1:11434` by default, which is what you want — the Next.js
app talks to it over loopback. **Do not** set `OLLAMA_HOST=0.0.0.0` without
putting auth in front of it; an open Ollama port is an open, unmetered model
endpoint for anyone who finds it.

If the app and the model run on different machines, put a reverse proxy
(Caddy/nginx) with a bearer token in front, and set `LLM_API_KEY` to that token.

## 5. Expect the scope guard to fire more often

A small local model complies with adversarial prompts (“should I sell my
position?”) more readily than a large one does. That is expected and handled:
`src/lib/ai/chat-generate.ts` buffers the full response, runs the guard, and
replaces any violation with a deterministic template built from stored,
already-validated analyses — before anything is streamed to the user or written
to `chat_messages`.

The consequence is a real product tradeoff worth knowing: with a weaker model
you'll see more rewritten (blander, more templated) chat answers. You are
trading conversational fluency for a guarantee that nothing non-compliant ever
reaches a user. Check how often it's firing:

```sql
select source_surface, flag_reason, count(*)
from ai_scope_guard_log
where flagged
group by 1, 2
order by 3 desc;
```

If the rewrite rate is high enough to hurt the experience, moving up a model
size is the fix — not loosening the guard.

## 6. Ongoing cost and privacy consequences

- **No per-token cost.** Cost is the VPS, flat.
- **No prompt data leaves your infrastructure.** User chat messages and
  portfolio-derived relevance context are no longer transmitted to any third
  party. `docs/legal/privacy-policy.md` and
  `docs/legal/jurisdictional-checklist.md` have been updated accordingly, but
  both remain non-lawyer drafts requiring professional review.
