# Decision needed: is a derived volatility regime a defensible historical analog?

**Owner:** chief-of-staff · **Raised by:** dev-lead · **Date:** 2026-08-20
**Status:** open - engineering has not changed the behaviour either way

## What is actually in the table

`historical_events` is the analog set `computeProbabilityBand()` measures
against. Every crypto row in it is written by `ingest-crypto`:

```
event_type:  'volatility_regime'
metadata:    { derived: true, source: 'coingecko',
               method: '30d_realized_vol_vs_own_median' }
```

Plain reading: *"this coin's trailing 30-day realized volatility ran above its
own median."* It is not an event. Nothing happened on that date. It is a
restatement of the price series the band is then computed over.

## Why it exists

Candidly: to clear a gate. `checkCompleteness()` rejects any analysis with zero
historical analogs, and there was no crypto analog source. Deriving regimes from
data already on hand made crypto analyses possible. The ingest code says so in
its own comments - it was not hidden.

## Why it is worth a decision rather than a quiet fix

The product's whole claim is *probability with visible sourcing*. A user
expanding the methodology on a BTC analysis sees a sample of N "historical
analogs" and reasonably reads that as *N times something comparable happened
before*. What it means here is *N windows where this asset was more volatile
than its own median* - which is close to circular when the output is a
volatility-likelihood band. The analog and the thing being predicted are
computed from the same series.

Equities no longer share the problem: `ingest-historical-events` populates real
earnings, dividend and split reactions with `price_before` / `price_after` read
from `historical_prices`. Those are events. So the two asset classes are now
making claims of different epistemic quality behind identical UI.

That asymmetry is the actual risk. Not that the crypto number is wrong - that a
user cannot tell which kind of analog they are looking at.

## Options

**A. Remove derived regimes; crypto analyses fail the completeness gate until a
real crypto event source exists.** Most honest. Crypto is a visible chunk of the
product and it goes dark, having briefly worked.

**B. Keep them, label them distinctly in the methodology card** - "derived
volatility regime" as its own analog class, with a plain-language note that it
is computed from this asset's own price history rather than a discrete event,
and exclude them from the headline sample count. Keeps crypto working and stops
the claim being stronger than the evidence. Engineering cost is small (a
`metadata.derived` flag already distinguishes them).

**C. Keep as-is.** Cheapest, and the one option that leaves a user unable to
tell a real analog from a restatement of the price series.

**D. Source real crypto events** - halvings, major protocol upgrades, exchange
failures, ETF approvals. Genuinely comparable to the equity set. No keyless
feed identified; this is a research task, not a config change.

## Recommendation

**B now, D as the real fix.** B is a few hours and closes the honesty gap
immediately; D is the version that makes crypto analyses as good as equity ones.
A is defensible and I would not argue against it, but shipping a feature and
withdrawing it costs more trust than labelling it accurately.

**Not a decision engineering should make alone** - it trades product surface
against the strength of a probability claim, which is the core promise.
