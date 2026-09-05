# Cairn — UX, Visual & Performance Review (2026-09-05)

I went through the whole app on localhost as a plain user would — clicking around, not reading code. Below is everything that caught my eye, small stuff included. Grouped by where I found it.

A few of these overlap with the source-code review and live-walkthrough from last week — where that's the case I've said what's fixed and what isn't.

## Big ones

**"Most searched" tab on Markets shows raw debug labels.** The six stat cards at the top of Markets → Most searched say "2 REQUESTS" under each ticker instead of a real label (every other tab shows a company name or price there). This reads as an internal metric that leaked into the UI — a normal user has no idea what "2 REQUESTS" means. (Once, while scrolling this same tab, my screenshot briefly showed the same card — IONQ — repeated across the whole screen dozens of times. I couldn't reproduce it and the actual page text only ever showed 6 cards, so this may have just been a capture glitch on my end rather than a real bug — worth you glancing at that tab yourself to rule it out, but I'm not confident enough to call it confirmed.)

**Several real cryptocurrencies are mistyped as "Equity" or "ETF."** On the Markets and Screener pages: Aptos (APT) and Cosmos Hub (ATOM) are tagged EQUITY, Arbitrum (ARB) and NEAR Protocol (NEAR) are tagged ETF. All four are crypto. This isn't just a display slip — the Screener's Crypto filter correctly excludes them too, meaning the wrong type is baked into the data, not just a label. A finance-literate user will notice this immediately.

**Currency setting isn't applied everywhere it says it is.** Settings → Display → Primary currency is set to EUR, and the description literally says "Applied to every figure." It isn't: the Ticker page (e.g. AAPL shown as $319.97) and Alerts (e.g. "NVDA is above $221") both show raw USD with a $ sign, while Markets, Screener, Portfolio, Comparison, and Base Camp all correctly show €. Same underlying numbers, inconsistent currency symbol depending which page you're on — that's confusing and looks unfinished.

**One portfolio holding (ISRG) is missing its sector and country data.** In Portfolio → Sector and Portfolio → Geography, Intuitive Surgical (ISRG) falls into "Unclassified" alongside BTC — but BTC belongs there (crypto has no SEC sector) and ISRG doesn't (it's a real, well-known US healthcare/medical-device company, same asset class as NVDA/AMZN which both show up correctly). This looks like one specific security's metadata is missing.

## Still-open from the last review

- Sector map's tiny-tile label truncation is worse than previously reported: it's not just the "Digital assets" sector. "Services-prepackaged software" and "Digital assets" both currently have two different tickers both showing as the same truncated label ("S…" / "U…") with no tooltip to tell them apart — genuinely ambiguous, not just ugly.
- BTC's portfolio price is much closer to right now (previously wildly wrong) and BTC's asset-class is now correctly bucketed under "Crypto" instead of "Unclassified" — both look fixed. There's a small residual: BTC's holding value doesn't quite reconcile with its own displayed per-unit price (about an 8% gap when I did the arithmetic) — smaller than before, but worth a second look.

## Smaller stuff, page by page

**Base Camp (home dashboard)**
- The page scrolls down into a large amount of empty black space well past the last real widget — there's nothing broken-looking about the widgets themselves, it's just a lot of dead space below them, which reads as unfinished on first impression.
- The AI Assistant widget on the dashboard is one long unbroken paragraph of dense text with no bolding, line breaks, or scannable structure — hard to skim compared to the rest of the page's card-based layout.
- The Watchlist card, when empty, takes up the same visual weight as the other cards but has nothing in it — a lot of wasted space for "0 lists."
- Bottom-right corner shows a permanent build hash and timestamp (e.g. "build 02e6b7b · 2026-09-04T20:44:45.262Z") on every single page. That's normally a dev-only detail; showing it to end users on every screen looks like debug output that was never hidden behind a proper "About" or diagnostics page.

**Markets**
- The "Most searched" issue above.
- The AMZN stat card (on the "Most active" tab) shows the word "equity" as its subtitle instead of "Amazon.com, Inc." like every other card — looks like a fallback string leaking through.
- Market cap is blank ("-") for some well-known large caps (NFLX, PLTR, SAP, UBER) while others (AMZN, MSFT, ASML) show a real figure — inconsistent, not tied to company size.
- One asset displays its name in Chinese characters only ("币安人生 (BinanceLife)") with no Latin transliteration in the compact ticker/name column — stands out oddly in an otherwise all-English list and could look like test data to a new user.
- SPX is used as the ticker for a crypto meme-coin ("SPX6900") with no visual distinction from what a finance-literate user would expect SPX to mean (the S&P 500). Not necessarily wrong, but worth a beat of thought since it's a genuinely confusable symbol.

**Comparison**
- Clean and functional. The quick-add ticker chips (+AAPL, +ADA, etc.) shift position immediately after you click one, with no transition — if you click two suggestions quickly you can end up adding the wrong second one. I did this myself.
- Minor: "Asset type" shows lowercase ("equity", "crypto") here but uppercase pill badges ("EQUITY", "CRYPTO") everywhere else in the app.

**Screener**
- Solid overall; filters respond correctly. Same empty-space-below-content issue as other pages once the result list is shorter than the viewport.

**Sector map**
- Truncated/collided tile labels, noted above.

**A Ticker page (AAPL)**
- Shows price in USD ($) despite the EUR currency setting (noted above). Small additional oddity: the price uses a $ sign but the chart's date axis uses day/month order (10/09, 29/09…) which is the European convention — a mixed-locale presentation on the same screen.
- Overview, Technicals, Financials, Profile, Options tabs all worked and looked good in the ones I checked (Overview, Technicals).

**Portfolio**
- ISRG classification gap, noted above.
- Two of four holdings (ISRG, BTC) show a "-" instead of a 30-day sparkline in the holdings table, while NVDA and AMZN show one — inconsistent, not explained.

**Watchlists, Alerts**
- Watchlists empty state is clean. Alerts page: the "Recent deliveries" list shows the exact same message twice, verbatim, same date ("NVDA is above $221 (last close $227.98)," both "Aug 28") — either the alert genuinely fired twice with an identical snapshot, or the delivery log has a duplicate-entry bug. Couldn't tell which from the UI alone.
- Alerts also shows the $ currency issue.

**Assistant / Chat**
- The instructional placeholder text above the real composer ("Ask about a ticker, sector, or market trend — I'll answer from stored research only.") sits directly above the actual input box and isn't visually distinct enough from it — I mistook it for the input field myself before finding the real one further down.
- One saved thread's answer includes the line "No portfolio-summary data were provided in this turn, so specific position sizes or performance can't be reported" — reasonable as a limitation notice, but it's not clear to a user when/why the assistant does or doesn't have portfolio context, especially since there's a "Portfolio context" toggle in Settings that's on. Worth making that consistent-or-explained.

**Research, Calendar, Calculators**
- All three are polished and I didn't find anything wrong beyond one small label inconsistency: on the Research page, one card's subtype just says "Ticker" (generic) where every sibling card names its actual analysis type ("Elevated Move Likelihood," "Probability Explanation").
- Calendar's "Today" button looks greyed-out/disabled when you're already viewing the current month — reasonable behavior, but visually it reads as broken rather than "correctly inactive."

**Settings, Billing**
- Both functional and clearly written. The Free plan price shows as "$0" (dollar sign) despite the EUR setting — same currency issue again. The "Percent / Dollar" toggle for how gains are displayed is labeled "Dollar" specifically, which is a slightly wrong word choice for a EUR account (it's about showing an amount vs. a percentage, not actually about US dollars).

## Performance observations (caveat: dev mode, not production)

Everything above was tested against the local dev server, not a production build, so some of this won't apply once deployed — but flagging in case it's useful:

- First visit to any not-yet-compiled route takes a genuinely long time (10+ seconds in a few cases) while Next.js compiles it. This is normal for dev mode and won't happen in production, but it's worth knowing that a cold production deploy's first real-user requests could feel slow if the hosting setup doesn't pre-warm routes.
- I hit repeated momentary "unresponsive tab" timeouts specifically right after clicking a tab/filter control that swaps visible content (Markets ranking tabs, Screener's asset-type filter, a Ticker page sub-tab, a Settings tab). It happened often enough, and specifically enough tied to that one kind of interaction, that it seems like more than coincidence — possibly a heavier-than-necessary re-render on tab switches somewhere shared across the app. I can't prove this without you profiling it directly (Chrome DevTools Performance tab, or React DevTools Profiler, while clicking through those same tabs), but the pattern was consistent enough to mention.
- I tried to check how the app looks on a phone-sized screen but couldn't get my browser tool to actually resize the render viewport this session — so mobile/responsive layout is untested here, not confirmed either way. Worth checking yourself with Chrome's device toolbar.

## What's genuinely good

Worth saying plainly: Calculators, Research, Calendar, Comparison, and the Screener's filtering are all well-built — clear copy, sensible defaults, honest disclaimers about what is and isn't advice. The visual language (dark theme, green/red for gains/losses, monospace data labels) is consistent and easy to read once you're on a page. Most of what's above is either data-completeness gaps (missing classifications, missing market cap) or small consistency slips (currency symbol, capitalization, label wording) rather than the core experience being broken.
