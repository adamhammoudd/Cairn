# Decision needed: which model serves the assistant

**Owner:** chief-of-staff + founder · **Raised by:** dev-lead · **Date:** 2026-08-20
**Status:** open — blocking every live-generation verification

## Correcting the premise in the remediation brief

The brief says to *"replace the placeholder `ANTHROPIC_API_KEY` in `.env.local`
with a real key."* That is not this codebase's architecture. `.env.local.example`
states it directly:

> Self-hosted AI model. Cairn calls no third-party model API — you run the
> model yourself. Any OpenAI-compatible server works: Ollama, vLLM, llama.cpp's
> server, LM Studio.

`src/lib/ai/llm.ts` reads `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` and
speaks OpenAI-compatible `/chat/completions`. There is no Anthropic client. The
stray `ANTHROPIC_API_KEY` the audit found is a leftover, not a wired dependency.

So this is not a key swap. It is a decision about what runs inference, with a
real recurring cost attached — which is exactly why the brief asks for
sign-off first.

## What the codebase assumes today

`llm.ts` says it explicitly: *"everything downstream is written assuming a SMALL
local model (3B–7B), not a frontier one."* That assumption is load-bearing and,
to be fair to whoever made it, well-executed:

- probabilities are computed in code (Wilson score interval over real analogs),
  never by the model
- cited sources and analogs are the exact rows fed into the prompt, selected by
  id — the model cannot name a source that was not supplied
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
chat. **Unlimited chat on a per-token provider with no cap is the exposure** —
one enthusiastic premium user can cost more than their subscription, and there
is currently no spend cap anywhere in the codebase (Wave 7.7 flags this
separately). If B or C is chosen, a hard monthly cap and a per-user rate limit
must ship with it, not after.

## Recommendation

**D.** The architecture is already built for a small local model and degrades
sensibly; standing up one Ollama/vLLM box unblocks every blocked verification at
a fixed, known cost, and proves the pipeline end to end. Re-open the hosted
question once there is real usage data to price against — `llm.ts` makes it a
config change.

If the founder wants better prose immediately, **C over B**: the model is only
writing explanatory text over numbers the code already computed, and that is not
where frontier capability earns its price.

## What stays unverified until this is decided

Live scope-guard behaviour (Tier B), methodology substance, citation freshness,
free-vs-premium output depth. All four need generation to actually run.
