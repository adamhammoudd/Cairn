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
| B1 | **hCaptcha site key.** Captcha protection is on in Supabase Auth, so sign-in, sign-up and password reset need a token. Set `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` in Vercel (Production + Preview) before the hCaptcha PR deploys; without it every sign-in fails. | Founder |
| B2 | **Beta invite codes.** Sign-up is invite-only: set `BETA_INVITE_CODES` in Vercel and share `/signup?invite=<code>` links. Empty = nobody can sign up. | Founder |
| B3 | **Daily briefings fail.** The scheduled run at the users' briefing hour (12:00 UTC) returned HTTP 500 on 2026-09-24 and 2026-09-25; the other hours only skip. The deployed `generate-daily-briefings` is version 4 (2026-08-30) and older than the repo copy. Redeploy it from the repo and check the next 12:00 UTC run. | Founder approves deploy |
| B4 | **Prove DeepInfra live.** It is configured (PR #129) but no analysis has been generated since the switch. Generate one, or run `npm run test:live`. | Founder |
| B5 | Supabase leaked-password protection is off (Authentication → Settings). | Founder |

## Open - before public launch

| # | Item | Notes |
|---|---|---|
| O1 | `public/robots.txt` says `Disallow: /` for search engines. Right while the app is closed; change at launch. Consider allowing `/welcome` and `/waitlist` sooner if they should be findable while promoting. | Decision: founder |
| O2 | CSP is still `Report-Only` (`next.config.ts`). One pass against the live site with the console open, then switch to enforcing. | Engineering |
| O3 | Migration `0046_factor_analogs` is applied live but has no row in the migration ledger (`supabase_migrations.schema_migrations`). Backfill the row. | Engineering |
| O4 | Re-run `test:scope-guard` Tier B (22 chat turns back-to-back) on DeepInfra; it could never pass on Groq's free tier. | Engineering |
| O8 | The waitlist form has no captcha (it has IP rate limits and email confirmation). Add hCaptcha there too if spam shows up; that needs the hCaptcha secret in Vercel for server-side verification. | Engineering |
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
