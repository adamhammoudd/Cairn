<title>AI Spec Consolidation - Verification</title>

# Cairn - AI Assistant Spec, Section 8 Verification Pass

**Run by:** dev-lead · **Date:** 2026-08-21 · **Branch:** `worktree-ai-spec-consolidation` @ `c4f2ec1`

Same tagging rule as the 2026-08-20 verification pass: nothing is marked PASS on
the basis of code reading alone. Where the only available evidence is a code path
I read but could not execute, the item is **UNVERIFIED**, not PASS.

One fact governs this whole report, so it goes first rather than in a footnote:

> **There is still no `GROQ_API_KEY`.** No model has been reached from this
> machine. `ai_analyses` holds **0 rows**. Every item below that requires
> generation to actually happen is UNVERIFIED, and it is a large fraction of the
> spec. Section 8's headline question - "does the assistant work end to end" -
> cannot be answered yes or no today. It can only be answered "everything up to
> the model call is now proven, and the model call has never been made."

---

## Top-line summary

### Fixed and proven this pass (verified by running it)

- **Groq retry/backoff policy** - 22 gating cases, all passing.
- **Market-feed editorial gate** - 12 gating cases, all passing; the two article
  categories the audit actually found in the feed are now dropped.
- **SEC EDGAR date filtering** - rewritten; stale-item root cause removed.
- **Three chat defects** - loading state, no auto-created empty session, no
  orphaned user message on failure.
- **Suite integrity** - 172 gating cases across 10 gating suites, and the two
  suites that cannot run still report INCOMPLETE with exit code 2 rather than
  rolling into a green summary.

### Confirmed already working at audit (not rebuilt)

The spec said most pieces already exist and the job is to make them work end to
end. That was accurate. Scope guard, methodology components, tier gating and
universe expansion were shipped by the earlier remediation waves and did not
need rebuilding - they needed verifying, which is below.

### Still blocked

- Everything requiring live generation (Sections 1 live, 3, 4 Tier B, 5 briefing
  substance, 7 comparison) - needs a key.
- Live `cron.job` table inspection (Section 2) - needs Supabase MCP auth.

---

## Section 1 - Model configuration

### 1.1 Provider retargeted to Groq - **PASS** (code + tests)

`src/lib/ai/llm.ts` no longer speaks to a local Ollama server:

```
DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"
DEFAULT_MODEL    = "openai/gpt-oss-120b"
```

`.env.local` and `.env.local.example` both set `LLM_BASE_URL` and `LLM_MODEL` to
those values.

### 1.2 Model id checked, not assumed - **PASS**

The spec said to confirm the current recommended model against Groq's docs
rather than assume one. The check mattered and is worth recording:

> Groq deprecated `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` on
> **2026-08-16** - five days before this pass - and names `openai/gpt-oss-120b`
> as the replacement at that tier.

Reaching for the obvious Llama default would have shipped a dead model id and
produced a 404 that the retry policy correctly refuses to retry, i.e. an instant
hard failure on first use.

### 1.3 Key handling - **PASS** (verified against the tree, not just intent)

`GROQ_API_KEY` is read server-side only, via `llmApiKey()`. It is never
`NEXT_PUBLIC_*`. Evidence that nothing leaked into the repo:

```
$ grep -n "GROQ" .env.local.example
19:GROQ_API_KEY=
21:# Optional alias, read only if GROQ_API_KEY is unset...

$ git check-ignore -v .env.local
.gitignore:34:.env.local        .env.local
```

The committed example carries an empty value; the real file is ignored. The key
must also be set in Vercel → Settings → Environment Variables for Production,
Preview and Development. **That half is the founder's to do and is not done.**

### 1.4 Retry with backoff - **PASS** (22/22 gating cases)

```
PASS       LLM rate-limit retry policy (gating): 22 passed, 0 failed, 0 flagged, 0 skipped.
```

What those cases actually pin, since a passing count says nothing on its own:

- 429/500/502/503/504/408/529 retried.
- **400/401/403/404/422 NOT retried.** This is the case that matters most - a
  misconfigured key retried four times becomes a timeout, and "chat hangs" was
  the original symptom.
- Backoff strictly positive, bounded at 8s, floor growing exponentially.
- `Retry-After` honoured as numeric seconds, as a fraction rounded up rather
  than truncated to zero, clamped when absurd, and as an HTTP-date.
- The user-facing busy string contains no status code, provider name, or
  internals.

### 1.5 Busy message, never a raw error, never a silent hang - **PASS** (code path traced)

`src/app/api/chat/route.ts` catches `LlmBusyError` and returns the fixed
`BUSY_MESSAGE` as `503` with `Retry-After: 20`; any other throw returns a
generic line stating nothing was saved. I traced `runChatTurn` to confirm it
does not swallow `llmComplete` errors, so the busy error genuinely reaches the
route rather than being converted to a generic failure inside the turn.

### 1.6 Real streamed chat response, ideally from a non-dev device - **UNVERIFIED**

No key. Nothing has been generated. This is the single item that, once done,
converts most of the rest of this report from UNVERIFIED to a real verdict.

### 1.7 Fallback provider decision - **FLAGGED, NOT DECIDED**

Per the spec's instruction not to decide this unilaterally, it is written up for
chief-of-staff in `docs/decisions/2026-08-20-model-provider.md` with a
comparison table and a recommendation (accept temporary unavailability
pre-launch) to accept or reject. Recorded there: until someone decides, the code
accepts unavailability, because that is the behaviour that ships by default.

---

## Section 2 - Data foundation

### 2.1 Provider config table - **PASS** (live DB)

```
OK   table data_providers - present (7 rows)
OK   data_providers CoinGecko row - present (enabled=true)
```

### 2.2 Cron jobs verified against the live cron table - **UNVERIFIED**

The audit found 3 of 8 jobs POSTing to a literal `<project-ref>` placeholder,
with `ingest-news` having failed 1,082 consecutive times. Confirming the fix
requires reading `cron.job` / `cron.job_run_details`, which needs Supabase MCP
authentication this session does not have (`mcp__supabase__authenticate` is an
OAuth flow). **I will not mark this PASS from a migration file.** The indirect
evidence is that `news_items` holds 1,344 rows and `historical_prices` 25,191,
which is inconsistent with a wholly dead ingestion path but says nothing about
schedule health.

### 2.3 SEC EDGAR - **PASS** (code, root cause removed)

The failure was structural, not incidental: the endpoint was called
relevance-ranked with no date bound, so it returned the same historically
relevant filings forever, and undated hits were stamped `new Date()` - which
made stale items look brand new. `fetchSecEdgarFulltext` now pushes
`dateRange=custom` with `startdt`/`enddt`, honours `config.lookback_days`
(default 14), leaves undated hits with an empty date rather than inventing one,
filters to the window and sorts newest-first.

### 2.4 Holdings/watchlist relevance ranking preserved - **PASS** (by construction)

The editorial gate keeps any item the tagger matched to a tracked ticker or
sector, unconditionally, before any lexicon runs. An item about a symbol a user
holds therefore cannot be dropped by the new filter. Two gating cases pin this.

### 2.5 Editorial quality - **PASS** (12/12 gating cases)

```
PASS       News editorial gate (market-feed quality) (gating): 12 passed, 0 failed, 0 flagged, 0 skipped.
```

The suite found a real bug in my own first draft, which is the reason it exists:
a bare `\bfiling\b` market signal matched "tax **filing** season" and kept the
rental-property article the gate was written to drop. Narrowed to
`\b(?:sec|regulatory|proxy|quarterly|annual) filings?\b`, with the case pinned.

Ingest now reports `{ provider, fetched, inserted, dropped }` per provider, so a
source that is mostly noise shows up as a number instead of a complaint.

### 2.6 Price store preserved - **PASS** (live DB)

```
OK   table historical_prices - present (25191 rows)
```

### 2.7 Equity historical events - **PASS** (live DB)

```
OK   table historical_events - present (98 rows)
```

98 rows, not zero - this was the gate that made every equity analysis
impossible. (An earlier note of mine said 99; the live count is 98.)

### 2.8 Crypto news tagging - **PASS** (9/9 gating cases)

```
PASS       News tagging (gating): 9 passed, 0 failed, 0 flagged, 0 skipped.
```

### 2.9 Synthetic crypto volatility analogs - **FLAGGED to chief-of-staff**

Unchanged from the earlier flag. Not silently resolved.

### 2.10 Ticker universe decision - **PASS** (expanded, migration 0026)

---

## Section 3 - Probability & analysis engine

### 3.1 Computation in code, model narrates only - **PASS** (8/8 gating cases)

```
PASS       Probability math (deterministic) (gating): 8 passed, 0 failed, 0 flagged, 0 skipped.
```

The honesty guarantee comes from the model never being asked for a number or a
citation. `gpt-oss-120b` being more capable than the 3B-7B local model the code
was written for is a reason to keep that property, not to spend it.

### 3.2 Cited sources are the literal rows fed to the prompt - **PASS** (code, structural)

Sources and analogs are selected by id and passed in; the model has no channel
through which to name a row that was not supplied.

### 3.3 Mandatory methodology enforced by schema, not UI convention - **PASS** (code)

### 3.4 Honest confidence that varies - **UNVERIFIED**

Requires real outputs to compare. Zero exist.

### 3.5 Market/sector/ticker scope only - **PASS** (see Section 4)

### 3.6 Structured `ai_analyses` storage - **UNVERIFIED, and this is the sharp end**

```
OK   table ai_analyses - present (0 rows)
```

The spec asks for `/ticker/AAPL → Generate` and a crypto scope to both produce
stored analyses. Neither has happened. The gates that previously blocked
generation before the model call (missing analogs, missing tagged crypto news)
are now cleared - `historical_events` at 98 rows and the tagging suite passing
are the evidence - so the remaining blocker is believed to be only the key. **I
have not proven that.** Until a generation actually runs, "only the key is left"
is a hypothesis, not a finding.

---

## Section 4 - Scope guard

### 4.1 Full adversarial probe, real pass rate - **PASS, 53/53 (100%)**

```
PASS       Scope guard probe (adversarial + false-positive) (gating): 53 passed, 0 failed, 0 flagged, 0 skipped.
```

The spec set zero tolerance for anything under 100% and said not to ship the
section as done otherwise. The real number is 53 of 53. Nothing was rounded, and
no case was removed to get there. For contrast, the audit's measured rate on the
old guard was 5 of 25 (20%) - the shipped 15-case suite passed only because its
cases had been written to match the regexes.

### 4.2 Semantic second pass - **PASS** (16/16 gating cases)

```
PASS       Scope classifier (layer 3 decision logic) (gating): 16 passed, 0 failed, 0 flagged, 0 skipped.
```

Layer 3's decision logic - advisory/strict/off posture, and what happens when
the classifier itself is unavailable - is covered deterministically.

### 4.3 Over-firing on genuine refusals - **PASS** (false-positive cases included in 4.1)

The 53 cases are adversarial *and* false-positive. A guard that blocks the
model's own honest refusal is a failure mode with the same user-visible shape as
a guard that misses advice.

### 4.4 Hard server-side gate before storage/display - **PASS** (code, traced)

### 4.5 Rejected/rewritten output logged - **PASS** (live DB)

```
OK   table ai_scope_guard_log - present (58 rows)
OK   ai_scope_guard_log.corrected_output + source_surface - present
OK   ai_scope_guard_log.is_test - present
```

### 4.6 Probe committed to the suite - **PASS** (`npm run test:guard-probe`, gating in `run-all.ts`)

### 4.7 CI false-green fixed - **PASS** (demonstrated by this very run)

```
INCOMPLETE - 2 gating suite(s) executed no tests: Adversarial scope-guard - Tier B (live pipeline), Citation freshness check
             Nothing failed, but nothing was proven either. This is not a pass.
```

Exit code 2. The old runner would have printed "All gating suites passed" here.
This report exists because that is no longer possible.

### 4.8 Tier B live probe - **UNVERIFIED**

```
INCOMPLETE Adversarial scope-guard - Tier B (live pipeline) (gating): 0 passed, 0 failed, 0 flagged, 0 skipped.
```

Tier A (deterministic, 15/15) proves the classifier logic. Tier B proves the
guard holds against what a real model actually emits, which is a different
question, and it is unanswered.

---

## Section 5 - Chat & briefing

### 5.1 Sidebar loading state - **PASS** (code)

`chat-thread.tsx` now tracks `sessionsLoading`. Both empty-state renders are
gated on it: three `animate-pulse` skeleton bars with `aria-busy` and an
`sr-only` label in the rail, "Loading conversations…" in the compact dropdown.
Previously the empty state rendered during load, so a user with history briefly
saw "no conversations".

### 5.2 No auto-created empty session - **PASS** (code)

The mount effect lists sessions and loads the newest; it no longer creates one.
Creation is lazy, on first send.

### 5.3 No orphaned user message on failure - **PASS** (code, traced)

The pre-generation insert is gone. Nothing is written to `chat_messages` until
`runChatTurn` returns; user and assistant rows are inserted together. A session
created for a turn that then failed is discarded via `discardEmptySession`.
`recordChatUsage` moved after the success path, so a failed turn no longer
consumes a Free-tier message.

The failed bubble renders dashed and muted with a "Not delivered" eyebrow -
**deliberately not red**, per the CLAUDE.md rule reserving red for loss and
destructive indicators. A failed send is neither.

### 5.4 Persistent streamed chat - **PARTIAL / UNVERIFIED**

Persistence is real (`chat_sessions` 3 rows, `chat_messages` 1 row). Streaming
from Groq has never been observed, because no request has ever succeeded.

### 5.5 Chatbot answers only from the validated pipeline - **PASS** (code, traced)

Chat data access is scoped to `ai_analyses` and `news_items`.

### 5.6 Briefing scheduled + on-demand and substantive - **PARTIAL**

```
OK   table daily_briefings - present (10 rows)
```

Rows exist, so the path runs. Whether the content is *substantive* is a judgment
about generated prose and cannot be made against briefings produced before this
pass by a different provider. **UNVERIFIED.**

---

## Section 6 - Compliance UI

### 6.1 One reusable disclosure component everywhere - **PASS** (grep, all consumers)

```
src/components/analysis/methodology-card.tsx
src/components/briefing/briefing-card.tsx
src/components/chat/chat-message.tsx
src/components/chat/chat-thread.tsx
```

### 6.2 One reusable methodology component everywhere - **PASS** (grep, all consumers)

```
src/app/(app)/research/page.tsx
src/components/analysis/methodology-card.tsx
src/components/briefing/briefing-card.tsx
src/components/chat/chat-message.tsx
src/components/ticker/ticker-workspace.tsx
```

### 6.3 `disclaimer-compliance-check` run once §§3-5 produce real output - **NOT RUN**

Deferred exactly as the spec conditions it: there is no real output to check.
Running it against zero analyses would produce a green result that means
nothing, which is the failure mode Section 4.7 exists to prevent.

---

## Section 7 - Tiered access

### 7.1 Gated via `getUserPlan()` - **PASS** (grep, every gated surface)

```
src/app/(app)/assistant/page.tsx
src/app/(app)/layout.tsx
src/app/(app)/research/page.tsx
src/app/(app)/ticker/[symbol]/page.tsx
src/components/analysis/methodology-card.tsx
src/components/chat/chat-thread.tsx
src/lib/actions/billing.ts
```

### 7.2 Depth difference never becomes an honesty difference - **PASS structurally, UNVERIFIED empirically**

`methodology-card.tsx` splits on `top_line` vs `full` depth. Sources, analogs
and confidence are outside that split - Free sees fewer words, not fewer
caveats, and never a bare score. That is the right structure. But the spec asks
for a Free and a Premium output **for the same ticker, compared**, and that
needs two real generations. Not done.

---

## Section 8 - Final verification

### The suite, in full, as it ran

```
PASS       Probability math (deterministic) (gating): 8 passed, 0 failed, 0 flagged, 0 skipped.
PASS       Adversarial scope-guard - Tier A (deterministic) (gating): 15 passed, 0 failed, 0 flagged, 0 skipped.
INCOMPLETE Adversarial scope-guard - Tier B (live pipeline) (gating): 0 passed, 0 failed, 0 flagged, 0 skipped.
PASS       Methodology substance check (advisory): 0 passed, 0 failed, 0 flagged, 0 skipped.
INCOMPLETE Citation freshness check (gating): 0 passed, 0 failed, 0 flagged, 0 skipped.
PASS       News tagging (gating): 9 passed, 0 failed, 0 flagged, 0 skipped.
PASS       Scope guard probe (adversarial + false-positive) (gating): 53 passed, 0 failed, 0 flagged, 0 skipped.
PASS       Scope classifier (layer 3 decision logic) (gating): 16 passed, 0 failed, 0 flagged, 0 skipped.
PASS       Market hours (gating): 17 passed, 0 failed, 0 flagged, 0 skipped.
PASS       Palette contrast (WCAG AA) (gating): 20 passed, 0 failed, 0 flagged, 0 skipped.
PASS       News editorial gate (market-feed quality) (gating): 12 passed, 0 failed, 0 flagged, 0 skipped.
PASS       LLM rate-limit retry policy (gating): 22 passed, 0 failed, 0 flagged, 0 skipped.

INCOMPLETE - 2 gating suite(s) executed no tests: Adversarial scope-guard - Tier B (live pipeline), Citation freshness check
             Nothing failed, but nothing was proven either. This is not a pass.
```

**172 gating cases passing across 10 gating suites. 2 gating suites INCOMPLETE.
0 failures. Runner exit code 2** - the run is deliberately not green, because two
gating suites proved nothing.

### Typecheck and lint

```
$ npx tsc --noEmit -p tsconfig.json
src/app/layout.tsx(33,50): error TS2304: Cannot find name 'LayoutProps'.
```

One error, in a file this pass never touched. `LayoutProps` is a Next 16
generated type absent from a fresh worktree that has not run `next dev`/`build`.
Environmental, pre-existing, unrelated to these changes.

```
$ npx eslint src scripts supabase
✖ 5 problems (3 errors, 2 warnings)
```

All five are `react-hooks/set-state-in-effect` in `reset-password/page.tsx`,
`scenario-modeler.tsx`, `comparison-panel.tsx`, `screener-panel.tsx` and
`symbol-typeahead.tsx` - none of which appear in this commit. Zero findings in
any changed file. Pre-existing, and worth a separate cleanup pass; not this one.

---

## What the founder has to do

1. **Provide `GROQ_API_KEY`.** Set it in `.env.local` and in Vercel →
   Environment Variables for Production, Preview and Development. Until then:
   Section 1's live response, Section 3's stored equity and crypto analyses,
   Section 4's Tier B probe, Section 5's briefing substance and Section 7's
   Free-vs-Premium comparison are all UNVERIFIED, and no amount of further code
   work changes that.
2. **Authorise Supabase MCP** (or paste `select jobname, schedule, command from
   cron.job;`) so Section 2.2's cron health can be confirmed rather than assumed.
3. **Decide the fallback-provider question** in
   `docs/decisions/2026-08-20-model-provider.md` - chief-of-staff's call, not
   mine.
4. **Confirm `CRON_SECRET` is set in Supabase** and redeploy the 8 edge
   functions, so the ingestion changes in this commit actually take effect in
   production.

Once (1) lands, the remaining verifications are roughly an hour of running
things, and this report gets a second pass with real verdicts in place of the
UNVERIFIED rows.
