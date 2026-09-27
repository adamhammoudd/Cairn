> **NON-LAWYER FIRST DRAFT. NOT LEGAL ADVICE. Needs review by a licensed lawyer.**
> Written by cfo-legal-advisor (legal hat) on 2026-09-27. I had no web access, so I have not read any Yahoo terms. Nothing below is a conclusion about what those terms allow.

# Escalation: per-ticker Yahoo Finance RSS for no-news tickers

**Owner:** Adam (founder) · **Status:** OPEN, blocks shipping · **Related:** the Nasdaq calendar escalation, also open (`ingest-calendar`, `ingest-historical-events`)

## 1. The question Adam needs answered

Do Yahoo's Terms of Service and any Yahoo Finance RSS terms allow Cairn to do the following in a commercial product (Free tier plus Stripe-billed Premium)?

- fetch `feeds.finance.yahoo.com/rss/2.0/headline?s=<TICKER>` automatically, on demand
- store the headline title, link, publisher name and publish date in `news_items`
- show the headline with a link out to the original article, and cite it as a source in an AI analysis

Also: is the answer different for the per-ticker feed than for the general Yahoo Finance RSS feed Cairn already uses?

## 2. What to check

These are the documents and clauses to look for. I have not confirmed that any of them exist in this form.

- **Yahoo Terms of Service** (the current version for the US region). Look for:
  - limits on commercial use or "personal, non-commercial use only" wording
  - bans on automated access, scraping or "robots"
  - bans on redistributing or reselling content
- **Any RSS-specific terms**, which are sometimes linked from the feed itself or from a Yahoo RSS help page. Look for:
  - attribution requirements (for example "Yahoo Finance" branding, or crediting the publisher)
  - whether links must go to Yahoo or may go to the original article
  - whether the feeds are licensed for personal readers only
- **Caching and storage:** whether headlines may be stored, for how long, and whether they may be shown after they drop out of the feed.
- **Third-party publisher rights:** the headlines belong to the publishers (Reuters, Motley Fool, and others), not to Yahoo. Yahoo may not be able to license them, and the publishers' own terms may apply.
- **The `<copyright>` and `<link>` elements in the feed XML,** and robots.txt on `feeds.finance.yahoo.com`. These are signals only, not permission.

## 3. Consistency point

About 93% of the news Cairn has stored comes from the general Yahoo Finance RSS feed configured in `data_providers`, and that feed is already live in production. It raises the same question. Whatever the answer is, it applies to both feeds. If the per-ticker feed is not cleared, the general feed also needs a decision and should not be treated as grandfathered in.

## 4. Alternatives that are clearer to license

| Source | Tradeoff |
|---|---|
| SEC EDGAR 8-K exhibits (company press releases, usually Ex-99.1), which Cairn already reads | US government filings with no copyright barrier to reuse, and SEC fair-access limits apply (User-Agent, 10 req/s). They only cover what the company itself announces, not third-party reporting. |
| A licensed news API whose written terms allow commercial display (to evaluate: Benzinga, Polygon/Massive news, Finnhub paid tier, and similar) | Rights are explicit, but it has a monthly cost that the finance hat has to model. Confirm each one allows display to end users and not only internal use (the same trap we found with Tiingo). |
| Company investor-relations RSS or press-wire feeds, where the terms allow syndication | Often permissive, but coverage is patchy and the terms have to be checked source by source. |

## 5. Engineering decision already made

**The per-ticker fetch does not ship until this is cleared.** Until then, an analysis for a ticker with no tagged news cites the data it actually has:

- SEC filings, by accession number
- price data, with its as-of date
- any calendar entry

The analysis also says plainly that no recent news was found. It does not fill the gap with inferred or invented news context.

*Clearing this needs a licensed lawyer's review, or written permission from Yahoo. It cannot be closed on the basis of this draft.*
