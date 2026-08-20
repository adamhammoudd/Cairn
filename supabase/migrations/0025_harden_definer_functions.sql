-- Found by the Supabase security advisor after Waves 7/10, not by code review:
-- four WARN-level findings that no amount of reading the schema would surface,
-- because they are about GRANTs and function attributes rather than table DDL.
--
-- 1. PostgREST exposes every function in `public` as an RPC endpoint. Both
--    handle_new_user() and rls_auto_enable() are trigger bodies -- nothing
--    should ever call them directly -- but both were left EXECUTE-able by
--    `anon`, and both are SECURITY DEFINER. That combination meant an
--    unauthenticated caller could invoke privileged code through
--    /rest/v1/rpc/handle_new_user and /rest/v1/rpc/rls_auto_enable.
--
--    Revoking EXECUTE does not affect the triggers that legitimately fire
--    them: trigger execution is not checked against the calling role's
--    EXECUTE privilege on the trigger function.
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;

-- 2. A function with a role-mutable search_path can be pointed at
--    attacker-controlled objects by a caller that sets its own search_path
--    before invoking it. Pin both functions added in this remediation pass.
alter function public.search_symbols(text, int) set search_path = public, pg_catalog;
alter function public.prune_auth_attempts() set search_path = public, pg_catalog;

-- Deliberately NOT changed, recorded so the next audit does not re-litigate:
--
--   * public.ai_scope_guard_log and public.auth_attempts report
--     "RLS enabled, no policy" (INFO). That is the intended posture -- both are
--     service-role-only ledgers. A policy would only ever grant access that
--     must not exist: a user must not be able to read, and especially not
--     clear, their own failed-login history or scope-guard trip log.
--
--   * pg_net lives in the public schema (WARN). It is installed and managed by
--     Supabase, and every cron job's net.http_post() call resolves through it.
--     Relocating it is a platform-level change with a real chance of silently
--     breaking the scheduler -- the exact failure class this whole remediation
--     exists to clean up. Left in place intentionally.
--
--   * Leaked-password protection (HaveIBeenPwned) is a dashboard/Auth setting,
--     not SQL. It cannot be enabled from a migration. Flagged to the founder.
