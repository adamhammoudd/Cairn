# Decision: an optional fallback inference endpoint

**Owner:** dev-lead · **Raised by:** founder, during the 2026-08-29/30 verification pass
**Status:** implemented (code), pending the founder creating a Cerebras account to activate it

---

## The problem

Groq's free tier caps the whole application at 200,000 tokens/day - not per
user, per organisation. This pass exhausted it with a handful of test
generations and one run of the AI test suite. A real chat turn's context
(recent news + stored analyses) costs roughly 2,000-4,000 tokens, so that
ceiling supports on the order of 60-100 real turns/day across every user
combined. That is not viable once the assistant has real users.

Paying for Groq's Dev Tier is the straightforward fix and remains available.
This document covers the free alternative the founder asked for instead.

## What was ruled out

- **Multiple Groq accounts/keys, rotated.** This is multi-accounting to evade
  a rate limit - a ToS violation, and not something to build regardless of
  whether it would work.
- **Self-hosting.** Already settled against in
  `2026-08-20-model-provider.md` - it does not solve "other users on their own
  devices need to install nothing," which was the reason Groq was chosen.
- **Switching Groq's model.** Checked and rejected: Groq's free tier applies
  the same 200,000 tokens/day ceiling to every text model, `gpt-oss-20b`
  included. A smaller model on the same provider does not raise the cap.
- **Prompt/reasoning trimming.** Checked empirically before dismissing it: at
  the current `reasoning_effort: "low"`, a real completion spent 5 of 95
  tokens on reasoning - already efficient. The context block (max 6 analyses +
  6 news items) is already bounded. There was no meaningful free capacity
  hiding in the request itself.

## What shipped

A second, optional OpenAI-compatible endpoint (`FALLBACK_LLM_BASE_URL` /
`FALLBACK_LLM_API_KEY` / `FALLBACK_LLM_MODEL`), tried automatically only when
the primary returns a 429 whose message identifies it as a daily-quota
rejection (`"tokens per day"` / `"TPD"` - Groq does not expose a distinct
status code for this, only that message text). Any other failure - a bad key,
a bad model id, a malformed request - throws immediately and is never masked
by a working fallback; only a reachable-but-currently-refusing primary falls
through. See `src/lib/ai/llm.ts` for the implementation.

Cerebras' free trial is the endpoint this was designed against, checked from
their published docs (2026-08-30, not yet tested live - this repo has no
Cerebras account):

| | Groq free tier | Cerebras free trial |
|---|---|---|
| Model **id** | `openai/gpt-oss-120b` | `gpt-oss-120b` — **no `openai/` prefix** (`inference-docs.cerebras.ai/models`) |
| Weights | GPT-OSS 120B | the same GPT-OSS 120B weights |
| Base URL | `https://api.groq.com/openai/v1` | `https://api.cerebras.ai/v1` |
| Tokens/day | 200,000 | ~1,000,000 |
| Tokens/minute | 8,000 | ~30,000 |
| Requests/minute | ~16 (1,000/day) | 5 |
| Structured JSON output (`response_format: json_schema`, `strict: true`) | yes | yes, per their docs |

**Correction (2026-08-30, Stage 2 of the combined-scan remediation):** an
earlier revision of this doc and of `src/lib/ai/llm.ts` assumed Cerebras
served the model under the identical `openai/gpt-oss-120b` id and let
`FALLBACK_LLM_MODEL` default to the primary's id. It does not - Cerebras uses
the bare `gpt-oss-120b`. The old default would have 404'd on the first real
fallback request, and the `/models` health check could not catch it because
`/models` takes no model id. `llm.ts` now defaults the fallback to
`gpt-oss-120b` (`DEFAULT_FALLBACK_MODEL`) and `llmHealthCheck()` issues a real
1-token completion instead of `GET /models`.

Same weights on both, so output quality does not change - only which
datacenter answers, and `ai_analyses.model_version` records that honestly
(`groq:...` or `fallback:...`, read from which endpoint actually served each
request, not assumed).

**Still not verified live:** no Cerebras key exists in this repo, so a real
forced-fallback completion has not been run. Until it has, the fallback path
is code-complete but unproven end to end. When the primary's daily cap is hit
and no fallback is configured, the assistant already surfaces the plain
"temporarily busy" line (`BUSY_MESSAGE`) rather than an error - that is the
correct degraded behaviour and is unchanged.

Cerebras' 5 requests/minute is materially lower than Groq's throughput and
could bottleneck several people chatting at once even though the daily token
budget is much larger - worth knowing going in, not a reason not to configure
it.

## What activating it requires

1. Create a free Cerebras account at cloud.cerebras.ai (needs an email/ToS
   acceptance only this session cannot do on the founder's behalf).
2. Set `FALLBACK_LLM_BASE_URL=https://api.cerebras.ai/v1` and
   `FALLBACK_LLM_API_KEY=<the key>` in `.env.local` and Vercel. Leave
   `FALLBACK_LLM_MODEL` unset - it now defaults to `gpt-oss-120b`, which is
   Cerebras' id. Then run `npm run test:live` and confirm the `health:` line
   reports the `fallback` endpoint as `reachable ... generated` (not a 404),
   which is the live check the previous `/models` probe could not do.
3. **Legal follow-up, not optional**: a configured fallback is a second AI
   subprocessor, the same category of change that required correcting
   `docs/legal/privacy-policy.md` and `jurisdictional-checklist.md` when Groq
   was first documented as a subprocessor. Name it there before relying on it
   in production. Flagged in `docs/legal/privacy-policy.md` §4 in the
   meantime, pending confirmation the fallback is actually configured and in
   use.
