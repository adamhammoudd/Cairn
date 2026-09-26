# Backlog

What is open right now, and who has to act on it. Rewritten on 2026-09-25;
the older point-in-time audit reports this used to cite are in the git history
(`git log --all -- docs/audits`).

Cairn is in a free closed beta: the app sits behind the waitlist, payments are
off (`BILLING_ENABLED` false in Vercel), and paid plans open at launch in
February 2027, once the business is registered.

## Blocking - fix before inviting anyone in

Nothing left blocking the closed beta as of 2026-09-26. hCaptcha and invite-only
sign-up (#130) and the move back to Groq's Developer tier (#131) are live, and
the daily briefing is now built when the reader opens the Assistant page if the
scheduled run hasn't made one yet. Before inviting people: sign in on the live
site, generate one analysis, and open one invite link in a private window.

## Open - before public launch

| # | Item | Notes |
|---|---|---|
| O1 | `public/robots.txt` says `Disallow: /` for search engines. Right while the app is closed; change at launch. Consider allowing `/welcome` and `/waitlist` sooner if they should be findable while promoting. | Decision: founder |
| O2 | CSP is still `Report-Only` (`next.config.ts`). One pass against the live site with the console open, then switch to enforcing. | Engineering |
| O3 | Migration `0046_factor_analogs` is applied live but has no row in the migration ledger (`supabase_migrations.schema_migrations`). Backfill the row. | Engineering |
| O4 | Re-run `test:scope-guard` Tier B (22 chat turns back-to-back) on Groq's Developer tier; it could never pass on the free tier. | Engineering |
| O9 | Supabase leaked-password protection (HaveIBeenPwned check) needs the Pro plan. Accepted for the closed beta: sign-up is invite-only and every auth form has hCaptcha. Turn it on when upgrading, or add a server-side pwned-password check in the sign-up and change-password actions. | Founder |
| O10 | The scheduled `generate-daily-briefings` function is the 2026-08-30 version and its 12:00 UTC run failed on 2026-09-24/25 (a transient Supabase 401 on its first query). Readers are covered by the on-open briefing; redeploying the repo version would add price moves and holding news to scheduled briefings. | Founder, optional |
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
