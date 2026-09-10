# Coherence proposals — judgement calls for the founder

**Date:** 2026-09-10 · **Branch:** `design/coherence-pass-2026-09-10`

The design-token migration on this branch fixed everything that had an unambiguous right
answer. The items below do not: each removes or merges something a person might have plans
for, so none of them has been done. Each records what was actually found, what it costs,
and what I would do.

Nothing here is code-complete. Approve individually.

---

## 1. Two complete billing surfaces — **recommend merging**

**Found.** `/billing` and `/settings?tab=billing` are both linked from the same account
menu, and they are not equivalent:

| | `/billing` (`billing-panel.tsx`, 135 lines) | `/settings?tab=billing` (`billing-settings-panel.tsx`, 293 lines) |
|---|---|---|
| Upgrade CTA | yes | yes |
| Usage: analyses / chat | — | yes |
| Allowance reset date | — | yes |
| Renewal date, billing period | — | yes |
| Payment method | — | yes |
| Plan history, payment history | — | yes |

The Settings tab is a strict superset. `/billing` adds an upgrade button and a "Payments
aren't set up yet" state, nothing else.

**Why it matters.** Two answers to "what am I paying for" is exactly the kind of thing
that makes a product feel unfinished, and it doubles the surface every future billing
change has to land on. `getUserPlan()` gating has to be right in two places.

**Recommend.** Make `/billing` a redirect to `/settings?tab=billing`, the same way
`/crypto` forwards to `/markets`. The top-nav Upgrade button and every existing link keep
working; `billing-panel.tsx` is deleted.

**Risk.** Low, but **not zero right now** — Stripe (Phase 12) was built on
`worktree-aug31-founder-punchlist` and has never been run end-to-end. If that branch
touches `billing-panel.tsx`, merge it first and do this after, or the two will conflict.

**Effort.** ~20 minutes.

---

## 2. The "Planning" nav group holds two thin items — **recommend folding**

**Found.** Top-level nav is 5 groups over 12 destinations. "Planning" contains only
Calculators and Calendar, and it is the only group a user has no reason to open twice.

```
Base Camp · Markets(5) · Portfolio(3) · Planning(2) · Assistant(2)
```

**Recommend.** Move **Calculators** into Portfolio (it is sized off account value and
holdings — `getPositionSizingDefaults()` already reads the portfolio) and **Calendar** into
Markets (earnings and macro events are market data, not personal planning). Nav becomes
four groups; nothing is deleted or moved on disk.

**Against.** If Planning is meant to grow — goals, retirement projection, tax lots — then
it is a placeholder for a real section and should stay. `getGoalsWithProgress()` suggests
goals already exist, which is an argument for keeping it. **Your call: is Planning a
section or a leftover?**

**Effort.** ~10 minutes (`src/lib/nav-items.ts` only).

---

## 3. Onboarding is buried in the account menu — **recommend promoting or retiring**

**Found.** `/onboarding` is reachable only as "First-run walkthrough", the third item in
the account dropdown, between Billing and Sign out.

**Why it matters.** That is the wrong place for either thing it could be. If it is a
first-run flow, it should fire on first login and never live in a menu. If it is a
re-runnable tour, "First-run walkthrough" is the wrong name for it, and the account menu
is where people go to leave, not to learn.

**Recommend.** Decide which it is:
- **First-run:** trigger on first authenticated session, drop the menu entry.
- **Re-runnable tour:** rename to "Product tour" and move it to Settings → Display,
  beside the other things that change how the app behaves.

**Effort.** ~15 min for the rename/move; ~1 hour for first-run triggering plus a
`user_settings` flag.

---

## 4. Disclaimer copy is retyped on the waitlist — **recommend a decision, not a change**

**Found.** `components/compliance/disclosure.tsx` carries a comment stating it is
"the one component every probability output… renders through — Phase 6 requires this be
literally the same component everywhere… not separately-worded copies that can drift."

`app/waitlist/proof-card.tsx` then hand-writes its own:

> Market-level context from the sources above — not a recommendation to buy, hold, or sell.

versus the canonical:

> Market/sector/ticker-level analytical output, not personalized financial advice. Not a
> recommendation to buy, hold, or sell anything.

**What I did.** Aligned the waitlist card's *visual* treatment to the `Disclosure` callout
idiom so there is one shape for "caveat". **I did not touch the wording** — this is
compliance-adjacent copy, and per `CLAUDE.md` legal drafts are non-lawyer first drafts
requiring professional review.

**Recommend.** Either use `<Disclosure variant="callout" />` on the waitlist and accept the
longer canonical sentence, or document the marketing card as a deliberate exception. The
current state — a near-copy that can drift — is the one option that should not persist.

**Effort.** 5 minutes once decided. **Route through cfo-legal-advisor.**

---

## 5. Sign-out in red — **recommend declining, and closing the request**

**Found.** An open request to make the sign-out button red. `Context/brand-guide.md`:
"Red is reserved exclusively for loss/negative/destructive indicators (including delete
actions) — never used decoratively."

**Recommend. Decline.** Signing out destroys nothing and is trivially reversible. Painting
it red spends the product's only alarm colour on a routine action, and every red thing
after it means slightly less — including the delete-account button two rows below it in the
same Settings page.

If the goal was that sign-out is *hard to find*, that is a placement problem: it currently
sits last in the account dropdown with no separator. Giving it a divider above it — the
standard treatment for a destructive-adjacent exit — solves the real complaint without
spending the colour.

**Effort.** 5 minutes for the divider. Closes the item either way.

---

## 6. "Day gainers" is all sub-cent crypto — **recommend a liquidity floor**

**Found live, logged in.** Base Camp's Markets pulse and the top of `/markets` both lead
with APEPE (€0.00), CHIP (€0.05), BTW (€0.37), BC (€0.03) — because "ranked by the last
session's percent change, largest first" over a board that includes all crypto is always
won by whatever micro-cap moved most. AMD at +3.04% is the first name most users would
recognise, in sixth place.

The ranking is doing exactly what it says. The problem is that what it says is not what a
"Day gainers" deck is for.

**Recommend.** Add a floor to the gainers/losers decks — a minimum price, market cap, or
traded volume — so the deck answers "what moved that matters" rather than "what moved".
The methodology string under the deck already exists and should state the floor, since
showing the rule is the product's whole stance.

**Note.** I fixed the *display* half of this on the branch: a €0.0004 move on a €0.00 asset
was rendering as `+€0.00` next to a symbol leading the day's gainers, which reads as
"unchanged". `formatChange()` now falls back to percent when the absolute unit rounds to
nothing. The ranking question above is yours.

**Effort.** ~30 min, plus a decision on the threshold.

---

## 7. Alert delivery messages hardcode `$` — **blocked on an edge deploy**

**Found live.** The Alerts page shows one alert reading "Price above **€**190.32" and, in
Recent deliveries directly beside it, "NVDA is above **$**221 (last close $227.98)". Both
describe the same threshold. 221 USD *is* €190.32, so the number is right and the symbol is
not — on the same screen, in two places.

**Why it is not fixed on this branch.** The delivery text is generated by the
`evaluate-alerts` Supabase edge function, which carries its **own duplicated copy** of the
template (`supabase/functions/evaluate-alerts/index.ts:105`) alongside the one in
`src/lib/alerts.ts:201`. Editing the repo copy would not change what actually runs, and
edge deploys are blocked in this environment, so a one-sided fix would only widen the
drift between deployed functions and `main` that the migration ledger already tracks.

`describeCondition()` in `src/lib/alerts.ts` was previously fixed for exactly this bug —
its comment calls it "the one Alerts bug the currency setting missed". It missed two.

**Recommend.** Fix both copies together and deploy the edge function in one change. Better:
have the evaluator store the raw figures and let the panel format them through
`formatMoney()` at render time, so a stored delivery follows the currency setting the same
way every other price in the app does, and the template stops existing twice.

**Effort.** ~30 min plus a deploy. **Needs founder/edge access.**

---

## 8. The Screener's columns are mostly `n/a` — **recommend narrowing by asset type**

**Found live.** With no filters, 84 matches come back and four of the seven columns —
Volume, Mkt cap, P/E, Yield — read `n/a` on nearly every row, because the board is
dominated by crypto and those fields are equities concepts. The designed missing-data
states are doing their job; there is simply nothing to put in them.

**Recommend.** Make the column set follow the Asset type filter: crypto shows price, 24h,
market cap and volume; equities keep P/E and yield. A table whose columns are mostly "not
applicable" teaches people to stop reading it.

Related to item 6 — both come from a single board mixing asset classes with one schema.

**Effort.** ~1 hour.

---

## 9. `/crypto` — **no action, working as intended**

Flagged during the audit as an orphan route (a 7-line redirect outside the nav). It is not:
crypto was deliberately folded into Markets as a filterable asset type, and the route
survives to forward old bookmarks. **Noted so it does not get re-flagged next sweep.**

---

## Not proposed, deliberately

- **No dead code to remove.** Every module under `src/components` and `src/lib` is
  referenced. Whatever "useless features" means here, it is redundant surfaces (item 1),
  not orphaned files.
- **Nav depth is fine** at 4–5 groups. The problem was one thin group, not the pattern.
- **The visual identity stays.** Dark canvas, signature green, serif/sans/mono roles and
  the terminal density are the brand, and they were never the problem — the problem was
  117 components each approximating them slightly differently. That is now fixed in
  `DESIGN.md` and enforced by the tokens.
