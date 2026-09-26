-- 0053: Premium analysis content is read only on the server, after the plan
-- gate (feat/analysis-display-v2, docs/decisions/2026-09-27-analysis-rebuild.md).
--
-- Free vs Premium is enforced in attachMethodology / loadAnalysisSummary
-- (getUserPlan), which drop Premium fields before anything is serialised. That
-- is only enforcement if a Free account cannot read the same rows straight from
-- the REST API with the public anon key and its own login - the hole 0051
-- closed for the analog rows. Three tables still had it:
--
--   ai_analyses                   carries the >=5% move band (probability_low/
--                                 high), now a Premium trader figure.
--   ai_analysis_factors           the RSI / volatility / drawdown readings behind
--                                 each analysis. Nothing in the app reads it
--                                 through a user's client.
--   company_financials_quarterly  the quarterly company table (Premium). The
--   company_financials_annual     scorecard, which is free, reads them on the
--                                 server with the service role.
--
-- Every app read of these tables now uses the service role (lib/actions/
-- analysis.ts, lib/ai/briefing.ts, lib/ai/context.ts, the Base Camp page,
-- lib/scorecard-data.ts, lib/ai/similar-moments-data.ts); the Edge Functions
-- already did. ai_analysis_sources keeps its policy, which checks the parent
-- through ai_analyses: with the grant below revoked, a signed-in read of it now
-- fails with "permission denied for table ai_analyses". The app reads it with
-- the service role too, so nothing depends on that path.
--
-- earnings_releases stays public: it is a list of results dates, which the free
-- calendar and scorecard already show.
--
-- Apply AFTER the app code that ships with it is deployed: the old code reads
-- these tables with the signed-in client and would show empty analyses.

drop policy if exists "public read" on public.ai_analyses;
drop policy if exists "public read validated" on public.ai_analysis_factors;
drop policy if exists "public read" on public.company_financials_quarterly;
drop policy if exists "public read" on public.company_financials_annual;

-- RLS stays enabled on all four, so with no select policy anon and
-- authenticated read nothing. The grants are revoked too, so a policy added
-- later by mistake does not quietly reopen them.
revoke select on public.ai_analyses from anon, authenticated;
revoke select on public.ai_analysis_factors from anon, authenticated;
revoke select on public.company_financials_quarterly, public.company_financials_annual from anon, authenticated;
