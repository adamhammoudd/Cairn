# Backlog

What is open right now, and who has to act on it. Rewritten on 2026-09-25;
the older point-in-time audit reports this used to cite are in the git history
(`git log --all -- docs/audits`).

Cairn is in a free closed beta: the app sits behind the waitlist, payments are
off (`BILLING_ENABLED` false in Vercel), and paid plans open at launch in
February 2027, once the business is registered.

## Blocking - fix before inviting anyone in

| # | Item | Who |
|---|---|---|
| B1 | **Switch the AI to DeepInfra.** The code is done: it uses DeepInfra (same model, `openai/gpt-oss-120b`) and the privacy page names it. It goes live once `LLM_API_KEY` is set in Vercel. Groq's free tier (200,000 tokens/day for the whole app) ran out on 2026-09-24. See `docs/decisions/2026-09-25-deepinfra.md`. | Founder |
| B2 | Supabase leaked-password protection is off (Authentication → Settings). | Founder |

## Open - before public launch

| # | Item | Notes |
|---|---|---|
| O1 | `public/robots.txt` says `Disallow: /` for search engines. Right while the app is closed; change at launch. Consider allowing `/welcome` and `/waitlist` sooner if they should be findable while promoting. | Decision: founder |
| O2 | CSP is still `Report-Only` (`next.config.ts`). One pass against the live site with the console open, then switch to enforcing. | Engineering |
| O3 | Migration `0046_factor_analogs` is applied live but has no row in the migration ledger (`supabase_migrations.schema_migrations`). Backfill the row. | Engineering |
| O4 | Re-run `test:scope-guard` Tier B (22 chat turns back-to-back) on DeepInfra; it could never pass on Groq's free tier. | Engineering |
| O5 | 3 of 42 replayed production scope-guard flags still over-fire on genuine refusals. Measure with `npm run replay:guard-log`. | Engineering |
| O6 | Two separate billing screens (`/billing` and Settings → Billing) - keep one. | Design |
| O7 | Small UI polish: remaining hard-coded hex colours to move onto tokens; the mobile menu's Upgrade item while payments are off; dashboard headline links; ticker symbols not URL-encoded in links; the proof card shows a drawdown in green (green is for gains only). | Design |

## February - when paid plans open

| # | Item |
|---|---|
| F1 | Register the business; fill the legal notice (`src/app/legal-notice`, then set `LEGAL_NOTICE_LIVE`) with the operator's identity. |
| F2 | Final price including VAT, and the founding-member offer terms. |
| F3 | Lawyer review of the privacy policy, terms and refund policy pages (all are non-lawyer drafts), using `docs/legal/jurisdictional-checklist.md`. |
| F4 | Turn `BILLING_ENABLED` on in Vercel and test checkout end to end in Stripe test mode first. |
