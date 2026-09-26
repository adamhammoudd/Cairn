# Decision needed: which model serves the assistant

**Owner:** chief-of-staff + founder · **Raised by:** dev-lead · **Date:** 2026-08-20
**Status:** RESOLVED - Groq. The fallback sub-decision below was answered by
`2026-08-30-groq-fallback-endpoint.md` (optional fallback endpoint, currently unconfigured).

---

## Current state (checked against `src/lib/ai/llm.ts`, 2026-09-26)

Where this memo and the code disagree, the code is right and this block says so:

- **Provider / model:** Groq, `LLM_BASE_URL=https://api.groq.com/openai/v1`,
  `LLM_MODEL=openai/gpt-oss-120b` (both are the code defaults). Paid Developer
  tier with a spending limit since 2026-09-25, after the free tier's 200k
  tokens/day cap ran out; a move to DeepInfra was coded and reverted before
  going live (`2026-09-25-deepinfra.md`).
- **Key:** `LLM_API_KEY`. `GROQ_API_KEY`, named in the resolution below, is
  **no longer read** - deliberately, so one provider's key cannot be sent to
  another host after `LLM_BASE_URL` changes (`.env.local.example`).
- **Retry:** unchanged - four attempts on 408/409/425/429/5xx/529, jittered
  backoff capped at 8s, `Retry-After` honoured. A 402 (spending limit / unfunded)
  and a daily-quota 429 stop retrying at once. `npm run test:backoff` is now 32
  gating cases, not 22.
- **Fallback:** implemented as an optional second endpoint - see
  `2026-08-30-groq-fallback-endpoint.md`. None is configured today (Cerebras was
  removed 2026-09-25: unfunded account, HTTP 402).

---

## Resolution (2026-08-21)

The founder settled the primary question in the consolidated AI spec: **Groq,
hosted, over its OpenAI-compatible API.** Not self-hosted, not Ollama. That is
now implemented, and the rest of this memo is retained as the reasoning that
led here, not as a live question.

What shipped against that decision:

- `LLM_BASE_URL=https://api.groq.com/openai/v1`, `LLM_MODEL=openai/gpt-oss-120b`.
- The model id was **checked, not assumed**, and the check mattered: Groq
  deprecated `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` on
  **2026-08-16**, five days before this was written, and names
  `openai/gpt-oss-120b` as the replacement for that tier. Picking the obvious
  Llama default would have shipped a dead model id.
- `GROQ_API_KEY` is read server-side only. It must be set in `.env.local` **and**
  in Vercel → Settings → Environment Variables for Production, Preview and
  Development. It is never committed and never `NEXT_PUBLIC_*`.
- Retry-with-backoff on 429/5xx, honouring `Retry-After`, four attempts, jittered
  and capped at 8s. Non-retryable statuses (400/401/403/404/422) surface
  immediately rather than being retried into a timeout.
- On exhaustion the user sees one fixed line - *"The assistant is temporarily
  busy and could not complete that request. Please try again shortly."* - served
  as `503` with `Retry-After`. Never a raw provider error; never a silent hang.
- Covered by `npm run test:backoff` (22 gating cases).

### The load-bearing assumption below has changed

This memo argues downstream code assumes a small 3B–7B local model. On Groq's
`gpt-oss-120b` that assumption is now conservative rather than wrong: the
engine still computes every probability in code and the model still only
narrates. **That should not be relaxed.** The architecture's honesty guarantee -
that a cited source is a row that was actually retrieved - comes from the model
never being asked for a number or a citation, and a more capable model is a
reason to keep that property, not to spend it.

---

## STILL OPEN: fallback provider for rate-limited periods

**This one is not mine to decide, and I have not decided it.**

Groq's free tier has real per-minute request and token limits. The retry policy
above absorbs a brief burst. It cannot absorb a sustained limit - after four
attempts the user gets the "temporarily busy" line and the turn does not happen.

Two options:

| | Configure a second paid provider as fallback | Accept temporary unavailability |
|---|---|---|
| User impact under load | Assistant stays up | Assistant intermittently unavailable |
| Cost | A second vendor relationship + per-token spend, mostly idle | None |
| Code | The client is already provider-agnostic (`LLM_BASE_URL` + `LLM_API_KEY`), so a fallback is a routing change, not a rewrite | None |
| Compliance surface | A second processor of user chat content to disclose | Unchanged |
| Honest framing to users | "Assistant is up" | "Assistant is busy" - which is at least true |

### First real data point (2026-08-21)

This stopped being hypothetical the day the key landed. Running the full test
suite, whose live tier issues ~44 model calls concurrently (22 chat turns, each
with a layer-3 classifier pass), the Tier B suite reported INCOMPLETE - the
provider was rate-limited and the health check failed. Re-run on its own,
immediately after: **22/22 passed**.

Nothing was broken; the capacity simply was not there for a burst. That is the
exact failure this decision is about, and it is now measurable rather than
theoretical. It also means CI running the full suite will be intermittently
INCOMPLETE on the free tier - a second, smaller decision hiding inside the
first.

**My recommendation, for chief-of-staff to accept or reject:** accept temporary
unavailability for now. Cairn is pre-launch with no paying users, the failure is
visible and honestly worded rather than silent, and a second processor of chat
content is a compliance item worth deferring until there is load to justify it.
Revisit the moment real usage produces a measurable rate of busy responses -
`ai_usage_events` plus the `[chat] provider unavailable` log lines are enough to
measure it without new instrumentation.

**What I need:** a yes/no on that recommendation. Until then the code accepts
unavailability, because that is the behaviour that ships if nobody decides.

---

## Original memo (2026-08-20) - retained for reasoning

**Status at time of writing:** open - blocking every live-generation verification

## Correcting the premise in the remediation brief

The brief says to *"replace the placeholder `ANTHROPIC_API_KEY` in `.env.local`
with a real key."* That is not this codebase's architecture. `.env.local.example`
states it directly:

> Self-hosted AI model. Cairn calls no third-party model API - you run the
> model yourself. Any OpenAI-compatible server works: Ollama, vLLM, llama.cpp's
> server, LM Studio.

`src/lib/ai/llm.ts` reads `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` and
speaks OpenAI-compatible `/chat/completions`. There is no Anthropic client. The
stray `ANTHROPIC_API_KEY` the audit found is a leftover, not a wired dependency.

So this is not a key swap. It is a decision about what runs inference, with a
real recurring cost attached - which is exactly why the brief asks for
sign-off first.

## What the codebase assumes today

`llm.ts` says it explicitly: *"everything downstream is written assuming a SMALL
local model (3B–7B), not a frontier one."* That assumption is load-bearing and,
to be fair to whoever made it, well-executed:

- probabilities are computed in code (Wilson score interval over real analogs),
  never by the model
- cited sources and analogs are the exact rows fed into the prompt, selected by
  id - the model cannot name a source that was not supplied
- the model writes prose only

Fabricated citations and invented probabilities are therefore structurally hard
regardless of model quality. The model is doing the easiest part of the job.

## Options

| | Setup | Marginal cost | Latency | Notes |
|---|---|---|---|---|
| **A. Self-hosted small model** (current design) | VPS with GPU, or CPU with patience | Fixed monthly box, ~$0 per call | Seconds on GPU; the 180s default timeout exists because CPU boxes are slow | No per-user spend. Ops burden is real. |
| **B. Hosted frontier API** | API key | Per-token, scales with usage | Fast, reliable | Better prose. Needs a spend cap before it is safe to leave running. |
| **C. Hosted small/cheap model** | API key | Per-token but low | Fast | Middle ground; no ops burden, meaningfully cheaper than B. |
| **D. Self-hosted now, hosted later** | As A | As A | As A | Keeps the abstraction honest; `llm.ts` already isolates the swap. |

## What the unit economics need from this

Free tier is 20 chat messages/day and 5 analyses/month. Premium is unlimited
chat. **Unlimited chat on a per-token provider with no cap is the exposure** -
one enthusiastic premium user can cost more than their subscription, and there
is currently no spend cap anywhere in the codebase (Wave 7.7 flags this
separately). If B or C is chosen, a hard monthly cap and a per-user rate limit
must ship with it, not after.

## Recommendation

**D.** The architecture is already built for a small local model and degrades
sensibly; standing up one Ollama/vLLM box unblocks every blocked verification at
a fixed, known cost, and proves the pipeline end to end. Re-open the hosted
question once there is real usage data to price against - `llm.ts` makes it a
config change.

If the founder wants better prose immediately, **C over B**: the model is only
writing explanatory text over numbers the code already computed, and that is not
where frontier capability earns its price.

## What stays unverified until this is decided

Live scope-guard behaviour (Tier B), methodology substance, citation freshness,
free-vs-premium output depth. All four need generation to actually run.
