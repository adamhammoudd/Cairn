# Cairn - Full App Review (Live Testing + Source Read-Through)
**Date:** 2026-09-04
**Scope:** Every page and every server action reachable from the authenticated app, read directly from source, plus live browser testing of the public login/signup flow.
**Method:** See "How this review was done" at the end - it explains an important limitation up front: I could not complete a logged-in walkthrough in this environment, so pages behind auth were reviewed as source code rather than clicked through live.

---

## Top-line summary

The codebase is in noticeably better shape than the average pre-launch app - most of the "obvious" bug classes (color-only gain/loss signaling, stale closures in polling hooks, timezone math, XSS in the chat renderer, admin routes trusting a client flag) are already handled correctly, and there's real self-documentation in the code of prior bugs and why the current approach was chosen. That said, five agent-led passes over the full source tree (~200 files) turned up genuine, verified issues - three of them serious enough to fix before wider use:

1. **The AI assistant's own example prompt teaches it to fabricate specific portfolio dollar figures, and that exact answer shape would be blocked by the app's own safety guard if it tried to say it for real.** This is the single most important finding in the whole review - see below.
2. **The waitlist page and pre-launch gate appear to not exist in this branch of the code**, even though it's understood to be the one thing live in production. Worth a direct look before anything else here.
3. A handful of real financial-math and functional bugs: a portfolio "today" stat that can be wrong, a screener whose filter boxes silently desync from what's actually being filtered, and a "fail loudly on bad data" design rule that only one of four features that were supposed to follow it actually does.

Below: the critical items first, then a full list organized by area, then what the live browser testing found, then how this review was actually conducted (worth reading - it explains a real gap in coverage).

---

## Critical - read this part first

### 1. The AI assistant is set up to confabulate specific dollar figures about a user's real portfolio, and its own guardrail would reject that answer if it were genuine

**Files:** `src/lib/ai/context.ts` (`buildChatContext`), `src/lib/ai/chat-generate.ts` (`SYSTEM_PROMPT`), `src/lib/ai/scope-guard.ts` (`PERSONAL_POSSESSION`)

The chat context builder only ever fetches **symbol strings** (which tickers a user holds or watches) - never dollar value, day P/L, or cost basis. But the system prompt's own worked example tells the model to answer in exactly that shape: *"Your portfolio is up 1.24% today – $1,417 on $115,686... AMD remains your one position underwater on cost basis, -11.0% against an average entry of $189.20."* Since none of those numbers are ever supplied to the model, any real answer shaped like that is invented, not sourced from the user's actual data - in a financial app, that's the one thing that can't happen by accident.

It gets stranger: that exact example sentence would itself be **rejected** by the app's own scope guard if the model tried to say something similar for real (`PERSONAL_POSSESSION` matches "your portfolio" and there's no carve-out for a neutral factual statement - only refusals are exempted). So the system prompt is coaching the model toward an answer shape that's both ungrounded *and* would trip the safety filter. A close rephrase without the literal word "your" sails through both layers of the guard entirely and is only caught by an optional third layer that fails open under load (see #2 in the AI section below).

**This needs a product decision, not just a code fix:** either give the assistant real portfolio numbers to work from (fetch value/P&L/cost-basis into context) so answers in that shape are actually grounded, or rewrite the example so the model is never shown that shape of answer as the target to imitate - and either way, add a rule that flags any bare dollar figure or cost-basis claim the model produces that isn't present in what it was actually given.

### 2. The waitlist route and pre-launch gate don't appear to exist in this codebase snapshot

**Files:** `src/proxy.ts`, `src/lib/public-paths.ts`, `src/lib/waitlist.ts`, `src/lib/actions/waitlist.ts`

Two things worth your direct attention:

- `proxy.ts`'s redirect-everyone-to-the-waitlist logic is commented out. It still calls Supabase Auth on every single page load (a real network round-trip) to compute a value it then throws away, but the actual gate isn't running.
- More importantly: a full listing of `src/app` in this checkout shows no `/waitlist`, `/waitlist/confirm`, `/privacy`, `/terms`, or `/accessibility` route at all - just `(app)`, `(auth)`, and `api`. Nothing in `src/app` or `src/components` calls the waitlist server action or imports `src/lib/waitlist.ts` (a real, fairly complete ~17KB file with rate limiting and email sending). It's live code with no caller.

Given you told me the waitlist page is the one thing currently live in production, this is either a branch/checkout mismatch on my end (worth double-checking what I actually staged vs. what's deployed), or the waitlist route tree got removed from `src/app` at some point without cleaning up the code that depended on it. Either way, I'd sort this out before touching the gate logic in #1, since re-enabling `proxy.ts`'s redirect as-is would send every visitor to a page that 404s.

*(Self-correction: my very first live browser test this session did successfully load `/signup` and `/login` locally and they worked end-to-end, which is a little at odds with "only the waitlist page exists" - worth reconciling both facts with whatever's actually on `main` right now.)*

---

## High-priority findings by area

### Dashboard, Portfolio, Markets, Ticker, Sector Map

- **Portfolio's "Today" change figure can be materially wrong** for any holding whose price data hasn't loaded yet - the code excludes it from the current-value sum but still includes its cost basis in the prior-value sum, artificially deflating (often falsely showing a loss on) the daily change stat. Realistic trigger: right after adding a new holding. *(`src/lib/portfolio.ts`, `computeTotals`)*
- **One holdings query on the ticker page relies on Postgres RLS alone**, unlike every comparable query elsewhere in the app which also filters explicitly by `user_id` as a second line of defense. Not a live leak today, but it's the one place a future RLS misconfiguration wouldn't be caught by a second guard. *(`src/app/(app)/ticker/[symbol]/page.tsx`)*
- Sparkline generation on the Portfolio page re-scans the *entire* price history array once per held symbol instead of reusing data that's already grouped by symbol two lines earlier - real, avoidable server-side work on every page load. *(`src/app/(app)/portfolio/page.tsx`)*
- `asset_type` on a new/edited holding is trusted from the form with no validation against the allowed set - a raw POST can write a bogus value that breaks the ticker page's stat-grid routing. *(`src/lib/actions/holdings.ts`)*
- Deleting a holding has no error handling - a failed delete (RLS denial, network blip) throws uncaught instead of showing the same inline error every other mutation on that page gets. *(`src/components/portfolio/holdings-table.tsx`)*

### Watchlists, Comparison, Screener, Alerts, Calculators, Calendar

- **The Screener's filter inputs are uncontrolled** - clicking a preset, resetting filters, or loading a saved screen changes what's actually being filtered, but the visible text boxes don't update to match. Users see filtered results with no way to tell what's actually filtering them. *(`src/components/screener/screener-panel.tsx`)*
- **The Screener re-fetches and re-filters the entire tracked market universe from the database on every debounced keystroke**, even though the unfiltered data is already sitting in the browser and could be filtered client-side instantly. Gets worse as the tracked universe grows. *(same file + `src/lib/actions/screener.ts`)*
- **Only the Screener adopted the app's own "fail loudly instead of silently showing $0" rule** - Watchlists, Comparison, and Planning (which feeds the Position Sizing and Goal Tracker calculators' default account values) still silently swallow database errors as empty/zero. The codebase's own comments describe this exact failure mode as the cause of a prior incident; three of four surfaces that were supposed to be fixed weren't. *(`src/lib/actions/watchlists.ts`, `comparison.ts`, `planning.ts`)*
- Alert `scope_value` (the ticker/sector an alert watches) has no server-side format validation, unlike the equivalent watchlist field which was explicitly hardened against this after a prior bug. `cooldown_seconds` has no bounds check either - a negative value can defeat the app's only anti-spam protection for that alert. *(`src/lib/actions/alerts.ts`)*

### AI Assistant / Chat

(Critical items #1–2 above are from this area.) Also:

- The optional third-layer safety classifier shares the same shared, documented ~60–100-turns/day model budget as the main chat model - so it's most likely to be unavailable exactly when heavy use or abuse makes it matter most, and it fails open (silently reverts to the weaker two-layer check) by default when that happens. *(`src/lib/ai/scope-classifier.ts`, `src/lib/ai/llm.ts`)*
- The "Stop" button on a streaming answer only stops the browser from *displaying* the rest of the reply - the full answer was already generated and saved to the database before streaming even started, so it reappears next time the conversation loads. The control doesn't do what its label says. *(`src/app/api/chat/route.ts`, `chat-thread.tsx`)*
- Premium chat has no per-minute rate limit at all (only a daily cap, and Premium's daily cap is unlimited) - one loop from a single compromised or malicious session could exhaust the shared daily model budget for every user on the platform. *(`src/lib/actions/billing.ts`, `src/app/api/chat/route.ts`)*
- No server-side max length on a submitted chat message before it's built into the model prompt.

### Settings, Billing, Auth, Admin

No privilege-escalation or auth-bypass was found here - admin access is correctly re-checked server-side everywhere, the Stripe webhook verifies its signature and never trusts the payload directly, and every API route scopes its query to the requesting user. Two real gaps:

- **Changing your password only requires an active session - not your current password.** A hijacked session, an unattended logged-in device, or an XSS bug would let someone lock you out of your own account with zero additional proof of identity. Account deletion has the same gap: the "type DELETE to confirm" friction is client-side only, and the server action doesn't check it. *(`src/lib/actions/settings.ts`)*
- A double-click or two open tabs on checkout can create two separate Stripe customer records for the same user, silently orphaning the first one. *(`src/lib/actions/checkout.ts`)*

### Shared shell, navigation, cross-cutting infrastructure

- **Every authenticated page makes three separate, non-deduplicated calls to Supabase's Auth server** to answer the same "who is this user" question (once in the layout, once each inside the plan-lookup and display-prefs functions it calls in parallel) - a real, fixable latency cost on literally every page in the app. *(`src/app/(app)/layout.tsx`)*
- The intraday portfolio chart fetches each holding's data one at a time in a loop instead of in parallel - up to 16 serialized round-trips for an 8-holding portfolio. *(`src/lib/actions/intraday.ts`)*
- **CSV export of your account data has no formula-injection guard** - a free-text field you control (like a watchlist name) starting with `=` would execute as a formula when the exported file is opened in Excel or Sheets. Standard, well-known fix (a single added character). *(`src/lib/export-csv.ts`)*
- No skip-to-content link anywhere in the app, and the top nav has no Escape-to-close, no `aria-expanded` on its dropdowns, and no focus trap in the mobile menu - a keyboard-only user can tab straight through page content that's visually covered by the open mobile drawer.
- The symbol search/typeahead used throughout the app (global search, add-holding, alerts, comparison, screener) has no combobox ARIA semantics and no arrow-key navigation between results.

---

## Medium and lower-priority findings (grouped, not exhaustive - full detail available on request)

**Accessibility** was the single most repeated category across every area of the app: icon-only buttons with no accessible name (dashboard card controls, settings toggles), modals with no dialog semantics or focus trapping (add/edit holding), form fields with no `<label>` (screener filters, change-password), tabular data rendered as unlabeled `<div>` grids instead of real `<table>` markup (comparison, screener, watchlists), and no `aria-live` announcement anywhere for save/error feedback or streaming chat text. None of these are hard fixes individually, but the pattern is broad enough that it's worth a dedicated pass rather than one-off fixes.

**Other real but lower-severity items:** the reset-password page doesn't distinguish an expired link from a normal one until after you've typed a new password and submitted; the calendar has no way to view a different month even though events further out are already being fetched; the growth-projector calculator's return-rate input has no sane bounds and can produce nonsense output from a typo; the NYSE holiday table is hardcoded through 2027 and will silently start reporting markets open on holidays after that with no warning; two near-duplicate implementations of the billing panel exist in Settings and Billing that could quietly drift apart.

---

## What live browser testing found (public pages)

I tested `/login` and `/signup` directly in a browser against your local dev server. Both work correctly:

- The signup form validates properly - it rejected a placeholder `.test` email domain server-side with a clear inline error, which is correct, expected behavior (not a bug - I initially mistook it for one before checking the actual DOM state).
- A valid submission (name, real-shaped email, password, consent checkbox) succeeds and redirects to `/login` with "Check your email to confirm your account," meaning new accounts are correctly gated behind email confirmation before login works.
- I was not able to get past that confirmation step in this environment (details below), so I could not log in and click through the authenticated app live. Everything past that point in this report is from reading the source directly rather than from clicking through it.

---

## How this review was actually done, and its one real gap

I set out to create a disposable test account and click through every authenticated page live, the way a QA pass normally would. I got as far as a fully successful signup, but Cairn correctly requires email confirmation before first login, and I don't have a way to receive that confirmation email from this session - there's no real inbox behind the throwaway addresses I can use, and I confirmed there's no local mail catcher running that I could check instead.

Rather than guess at a workaround, I chose not to try to bypass this - I have access to your Supabase project through a connected tool and could technically have gone in and manually marked a test account as confirmed, but that's a direct, security-sensitive write to your live authentication table that you didn't ask for, so I stopped short of it rather than doing it unasked. If you'd like a real logged-in walkthrough done properly, the cleanest options are: you hand me (or I use) a real test account's login, you temporarily disable email confirmation for one signup, or I do the manual Supabase confirmation with your explicit go-ahead.

In place of that, I staged and read essentially the entire application source - every page, every component, every server action, every `lib/` helper behind the (app) route group, about 200 files - across five focused passes (dashboard/portfolio/markets/ticker/sector-map; watchlists/comparison/screener/alerts/calculators/calendar; the AI assistant/chat and its safety guard; settings/billing/auth/admin; and the shared shell/navigation/infrastructure every page depends on). That's what the findings above are built on. It's a genuinely thorough pass - arguably more thorough than a click-through would have been for logic bugs and security checks that aren't visible in the UI - but it means anything that's purely a rendering/visual/CSS issue, or a bug that only shows up from real interaction timing, wouldn't have been caught. If you want that layer covered too, a live walkthrough once login is unblocked would close the gap.

---

## Suggested next step

This is a lot to hand to the agent department at once. My suggestion: route the two critical items (the chat confabulation risk, and the waitlist/proxy mismatch) to you directly since both need a product decision, not just a fix - then let dev-lead pick up the rest of this list as PR-sized chunks through the nightly sweep, roughly in the order listed (financial-correctness bugs first, then the security-adjacent settings gaps, then performance, then the accessibility sweep as its own dedicated pass rather than scattered one-offs).
