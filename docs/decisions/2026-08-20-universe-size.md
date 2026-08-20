# Decision needed: how big is the tracked universe, and how is it filled

**Owner:** chief-of-staff · **Raised by:** dev-lead · **Date:** 2026-08-20
**Status:** open — the related asset-type bug is fixed regardless (see below)

## The finding

The tracked universe is **7 equities and 25 coins**. Not a provider limit — a
config row. The verification pass pulled live data for 24 long-tail tickers
(AXON, CROX, CELH, SMCI, PLAB, KTOS, IONQ, BROS, RKLB, PENN, ASML, TSM, BABA,
SAP, SHOP, IWM, XLE, VNQ, ARKG, SCHD, EEM, JEPI, TLT, GDX) from **the provider
Cairn already uses**, plus 11 mid-cap coins from CoinGecko. 24/24 and 11/11
returned real data. 0/35 exist in Cairn.

The user-visible consequence: a beta tester typed `RKLB` — Rocket Lab, not
obscure — and got *"No matching tracked symbols."* Their conclusion was that the
app was broken, not that it tracks seven stocks.

## Options

**(a) Raise the list and `TOP_N`.** Cheapest edit, biggest unknown. Both feeds
are keyless and unkeyed feeds are rate-limited by IP and by goodwill. `ingest-
market-data` fetches serially with no backoff and no concurrency limit; at ~500
symbols that is ~500 sequential requests per daily run. Yahoo's public chart
endpoint is undocumented and has no published quota, so the honest answer is
**nobody knows where it breaks and the only way to find out is to try it**. If
this is chosen, it needs throttling and retry/backoff first — the current loop
would fail opaquely, and `historical_prices` would silently stop updating for
symbols past whatever the cutoff is. That is the same failure shape as the cron
bug: broken and quiet.

**(b) On-demand / lazy ingestion.** A searched symbol not yet tracked is fetched
on first request, then joins the daily cron set. Scales with actual demand
rather than a guess, and turns the 404 into a first-class flow. Costs: a
cold-search latency spike, a new abuse surface (each miss is an outbound fetch —
needs rate limiting and a negative cache), and the daily cron set still grows
unbounded over time, so it eventually needs (a)'s throttling anyway.

**(c) Scope the product explicitly.** Say plainly in the UI what is covered, and
make the empty state name the boundary instead of saying "tracked symbols" — a
phrase that means nothing to a new user. Honest, shippable today, and the
weakest product.

## Recommendation

**(b), with (c)'s copy fix shipped immediately regardless.** Lazy ingestion is
the only option whose cost tracks real usage, and it fixes the specific moment
the audit caught — someone typing a real ticker and being told no. The copy fix
is a few hours and stops the product implying full-market coverage in the
meantime.

If (b) is too much for this pass, **(a) capped at a curated few hundred names
(S&P 500 + the top ~50 ETFs) with throttling**, which is a known quantity rather
than an open-ended crawl.

## Fixed regardless of this decision

`asset_type` was read once per `data_providers` row and applied to every symbol
under it, so all seven symbols were written `equity` — SPY included. That is why
the Markets ETF / Forex / Indices tabs were permanently empty while an ETF sat
in the equity list labelled EQUITY. `ingest-market-data` now reads a per-symbol
`asset_type`, and `0020_asset_type_per_symbol.sql` rewrites the config and
corrects rows already ingested. Verified: SPY moves `equity` → `etf`, ordering
preserved, migration idempotent.

Also fixed independently, since it is a bug at any universe size: `searchSymbols()`
limited by price **row** rather than by distinct symbol, so typing "A" returned
only AAPL (509 rows consumed the whole limit). Now a SQL function limited by
distinct symbol — verified returning AAPL, ADA, AMZN, AXON where the old query
returned AAPL alone.
