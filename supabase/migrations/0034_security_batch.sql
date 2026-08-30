-- Stage 5 security batch (30 Aug 2026 combined scan).
--
-- Applied to the live project via the Supabase MCP on 2026-08-30 and verified:
--   * anon/authenticated/PUBLIC can no longer EXECUTE public.is_admin(uuid)
--   * a non-validated ai_analyses row's child sources/analogs are invisible to anon
--   * pg_net relocated to the `extensions` schema (advisor `extension_in_public` cleared)

-- 5.1  is_admin(uuid) is SECURITY DEFINER and was EXECUTE-able by PUBLIC/anon/
-- authenticated via /rest/v1/rpc/is_admin. It is an internal helper for RLS
-- policies and server code (service_role); no client should call it.
revoke execute on function public.is_admin(uuid) from public;
revoke execute on function public.is_admin(uuid) from anon;
revoke execute on function public.is_admin(uuid) from authenticated;

-- 5.3  ai_analysis_sources / ai_analysis_historical_analogs had a "public read"
-- policy with USING (true) - world-readable regardless of whether the parent
-- analysis is validated. The parent ai_analyses only exposes status='validated'
-- rows. Match the child tables to the parent via an EXISTS check so a
-- draft/rejected analysis does not leak its sources or historical analogs.
drop policy if exists "public read" on public.ai_analysis_sources;
create policy "public read validated" on public.ai_analysis_sources
  for select
  using (
    exists (
      select 1 from public.ai_analyses a
      where a.id = ai_analysis_sources.analysis_id
        and a.status = 'validated'
    )
  );

drop policy if exists "public read" on public.ai_analysis_historical_analogs;
create policy "public read validated" on public.ai_analysis_historical_analogs
  for select
  using (
    exists (
      select 1 from public.ai_analyses a
      where a.id = ai_analysis_historical_analogs.analysis_id
        and a.status = 'validated'
    )
  );

-- 5.6  pg_net was installed in the public schema. pg_net does not support
-- `ALTER EXTENSION ... SET SCHEMA`, so it was relocated out of band with:
--
--   begin;
--   drop extension pg_net;
--   create extension pg_net with schema extensions;
--   commit;
--
-- pg_net's callable objects stay in the hardcoded `net` schema either way, so
-- the `net.http_post(...)` references in the cron jobs are unaffected (verified
-- with a live call after the move). The async-response log net._http_response
-- is recreated empty by this - it holds no business data.
--
-- Not run here because DROP/CREATE EXTENSION cannot share this migration's
-- transaction safely; recorded for the ledger.
