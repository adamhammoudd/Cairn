# Decision: move model inference from Groq to DeepInfra

**Owner:** founder · **Date:** 2026-09-25 · **Status:** reverted 2026-09-26 before going live - see the update at the end

Supersedes the provider part of `2026-08-20-model-provider.md` and the
fallback plan in `2026-08-30-groq-fallback-endpoint.md`.

## Why

- Groq's free tier caps the whole app, not each user, at 200,000 tokens a day,
  which is roughly 60-100 chat turns. It ran out on 2026-09-24: analysis
  generation failed and daily briefings stopped.
- The Cerebras fallback was never funded and answered HTTP 402, so it caught
  nothing. It was removed on 2026-09-25.

## What was chosen

DeepInfra, running the **same model** Cairn already used, `openai/gpt-oss-120b`,
under the same model id.

| | Groq (paid tier) | DeepInfra |
|---|---|---|
| Price per million tokens, in / out | $0.15 / $0.60 | ~$0.04 / $0.17 |
| Daily token cap | tier-based | none (prepaid balance) |
| Inputs stored / used for training | not by default | not stored to disk, not used for training |

Prices are from public price listings checked on 2026-09-25. A chat turn is
roughly 3,000 tokens in and 500 out, which comes to about $0.0002 a turn.

Because the model and its id are unchanged, no prompt, schema or test had to
change. The switch is configuration only.

## Alternatives considered

- **Groq Dev Tier:** the same model at about 4x DeepInfra's price.
- **Gemini 2.5 Flash-Lite:** cheap, but a different model, so prompts and the
  scope-guard corpus would need re-validating. Its free tier may train on the
  data sent to it.
- **Mistral:** keeps data in the EU, but it is a different model, so the same
  retuning cost applies. Worth revisiting if EU data residency becomes a
  requirement.

## What changed in code

- `src/lib/ai/llm.ts`:
  - The default host is `https://api.deepinfra.com/v1/openai`.
  - Only `LLM_API_KEY` is read. `GROQ_API_KEY` is ignored, so a Groq key can
    never be sent to DeepInfra.
  - `ai_analyses.model_version` names the host that answered, e.g.
    `deepinfra:openai/gpt-oss-120b`.
- If a host rejects `reasoning_effort`, the request is resent once without
  that field.
- HTTP 402 (empty prepaid balance) is treated as "temporarily busy", not as a
  crash, and is not retried.
- `npm run test:llm-provider` proves all of the above without network access.
- The privacy page names DeepInfra instead of Groq, and `PRIVACY_VERSION` moved
  to 2026-09-26.

## Still to verify live

- Whether DeepInfra honours `reasoning_effort: "low"`. The code copes either way.
- Whether it accepts `response_format: json_schema`. The code already degrades
  to `json_object`.

Run `npm run test:live` once the key is set.

## Spending control

The prepaid balance is the cap. Keep auto top-up off, or set a top-up limit.
When the balance runs out, the assistant shows its "temporarily busy" message
until it is topped up.

## Update 2026-09-26: reverted - Cairn stays on Groq

DeepInfra's sign-up asked for a VAT number. Cairn has none until the business
is registered (planned before paid plans open in February 2027), so the switch
never went live. Cairn stays on Groq, same model, on the paid Developer tier:
a card is enough to upgrade, the console has a built-in spending limit, and
Groq was already the disclosed processor.

The provider-neutral changes from the switch are kept, because they are
improvements whichever host is used:

- only `LLM_API_KEY` is read, so a key can never reach the wrong host;
- `model_version` names the host that actually answered;
- HTTP 402 is reported as "busy" instead of as a crash;
- a rejected `reasoning_effort` is retried once without it.

The default host in `llm.ts`, the privacy page and the docs point at Groq
again. DeepInfra stays a one-line configuration change for later, once the
business can give a VAT number: revisit it then for the lower price.
