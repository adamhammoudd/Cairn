-- Stage 4.4: ai_scope_guard_log retains raw_output / corrected_output, which
-- can contain the text of a rejected AI generation (and, if a user typed a
-- position into chat, an echo of that). The table has NO user_id column, so
-- deleteAccount() (src/lib/actions/settings.ts) cannot cascade to it or scrub
-- per-user. A time-based retention limit is therefore the control: no row of
-- real (non-test) audit data outlives this window, whichever user it came from.
--
-- 90 days: long enough for the guard-tuning replay work this log exists for
-- (scripts/replay-guard-log.ts, the weekly guard-stats pass), short enough that
-- user-adjacent text is not kept indefinitely. Revisit with counsel -
-- docs/legal/privacy-policy.md flags this log's retention as an open item.
--
-- Applied to the live project via the Supabase MCP on 2026-08-30 and verified:
-- the cron job `purge-scope-guard-log` is active and purge_scope_guard_log()
-- runs (0 rows purged on first run - nothing older than 90 days yet).

create or replace function public.purge_scope_guard_log()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer;
begin
  delete from public.ai_scope_guard_log
  where is_test is not true
    and created_at < now() - interval '90 days';
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke execute on function public.purge_scope_guard_log() from public, anon, authenticated;

select cron.schedule(
  'purge-scope-guard-log',
  '30 3 * * *',
  $$ select public.purge_scope_guard_log(); $$
);
