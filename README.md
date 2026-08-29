# Cairn

A dark-themed financial research dashboard: portfolio tracking, multi-source
market and news aggregation, watchlists, screeners, alerts, calendars, and an AI
research assistant built around a probability and pattern-analysis engine.

**Cairn is informational only.** There is no brokerage integration and no trade
execution. The AI engine analyses markets, sectors and tickers; it never
analyses or advises on an individual user's position, and never resolves to
"you should buy/hold/sell". That boundary is enforced server-side by a scope
guard (`src/lib/ai/scope-guard.ts`), not by prompt instructions alone.

Every probability output ships with its sources, historical analogs and a
confidence level — never a bare score. Probability ranges are computed in code
(Wilson score interval over real historical analogs); the model writes prose
only and never produces a number or picks a citation.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Styling | Tailwind CSS v4 |
| Data / auth / storage | Supabase (Postgres, Auth, Edge Functions, pg_cron) |
| AI inference | Groq, OpenAI-compatible API (`openai/gpt-oss-120b`) |
| Charts | Recharts |
| Billing | Stripe — planned for Phase 12, not yet integrated |

## Running locally

Requires Node 20+ and a Supabase project.

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev                        # http://localhost:3000
```

`.env.local.example` documents every variable and what happens when one is
missing. The ones you cannot run without are the three Supabase keys and
`GROQ_API_KEY`; without the latter the assistant reports a clear configuration
error rather than failing generically.

Database schema lives in `supabase/migrations/`, applied in filename order.
Scheduled ingestion runs as Supabase Edge Functions in `supabase/functions/`,
invoked by `pg_cron` — see `docs/model-provider-setup.md` and the migrations for
how the schedule and its shared secret are wired.

## Checks

There is no single `npm test`; the suites are separate and each prints a real
pass count.

```bash
npm run lint                 # eslint - expected clean
npx tsc --noEmit             # types
npm run test:ai-suite        # the full AI suite
npm run test:guard-probe     # adversarial scope-guard corpus
npm run test:probability     # probability maths
npm run test:methodology     # methodology-card substance
npm run check-db             # live schema/data sanity check
```

`npm run test:guard-probe` is the one to watch. It holds the original 25-case
adversarial probe an audit used to measure the guard, kept verbatim as a
regression floor, plus real production text that must *not* be flagged. If a
case starts failing, the guard regressed — do not soften the corpus.

## Project context

The documents below are the source of truth; read them before changing
behaviour.

- **`CLAUDE.md`** — product summary, the non-negotiable guardrails, brand rules,
  and which agent owns which area. Start here.
- **`Context/build-roadmap.md`** — the full 12-phase build spec.
- **`Context/brand-guide.md`** — palette and type. Red is reserved exclusively
  for loss and destructive indicators.
- **`docs/decisions/`** — architecture decision records, including why the model
  provider is hosted rather than self-hosted.
- **`docs/audits/`** — verification and audit passes, with their evidence.
- **`docs/legal/`** — privacy policy, terms, jurisdictional checklist. All are
  non-lawyer drafts requiring professional review before use.

## Contributing

No agent or contributor commits directly to `main` — changes go through a pull
request reviewed by dev-lead. Phases are not reordered without chief-of-staff
sign-off.
