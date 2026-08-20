# Decision needed: what happens when the scope classifier is unreachable

**Owner:** chief-of-staff · **Raised by:** dev-lead · **Date:** 2026-08-20
**Status:** open — shipped defaulting to advisory; flipping it is one env var

## Context

The scope guard now has three layers. Layer 3 (`scope-classifier.ts`) asks a
model whether a response contains personal investment direction, judging intent
rather than wording. It runs after generation, before display.

Layer 3 needs an inference server. Layers 1–2 do not.

## The choice

When the classifier cannot be reached:

- **advisory (current default)** — allow the response on layers 1–2 alone, log
  that the classifier did not run.
- **strict** — block the response and show the guard's rewrite.

## Why advisory is the default

Layers 1–2 are themselves a hard gate, and they are no longer weak: 25/25 on the
held-out adversarial probe, 35/35 across all adversarial cases, 0 over-fires on
18 compliant cases including three real production refusals. Layer 3 covers a
residue, not the main body of risk. Failing closed on every model-host hiccup
takes the assistant down entirely for a marginal reduction in an already-small
gap.

## Why it is still a decision for someone else

It is a compliance posture, not an engineering preference. The question — *"is
it acceptable to show a user a response that our strongest semantic check never
saw?"* — belongs to whoever owns regulatory exposure, especially before real
users and real money.

Two things worth weighing:

- If the assistant is a premium selling point, strict mode means an inference
  outage looks like a product outage.
- Advisory mode's blind spot is exactly correlated with model trouble — the
  window where output is most likely to be odd is the window where layer 3 is
  least likely to be running.

`SCOPE_CLASSIFIER_MODE=strict` flips it. Both paths are unit-tested
(`npm run test:classifier`).

## Recommendation

**Advisory until launch, strict before real users.** Pre-launch the cost of a
blocked response is nil and the value of a working assistant during development
is high; at launch the trade reverses. Revisit with the Wave 3 model-provider
decision, since a hosted provider makes "unreachable" much rarer.
