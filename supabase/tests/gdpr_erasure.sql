-- ============================================================================
-- Right-to-erasure: does deleting the auth user actually remove their data?
--
-- deleteAccount() calls admin.auth.admin.deleteUser(user.id) and relies
-- entirely on ON DELETE CASCADE from auth.users. That is a reasonable design,
-- but it had never been tested, and a single table missing the cascade (or
-- referencing a parent that lacks it) leaves personal data behind after a user
-- has been told their account is deleted - which is the claim the privacy
-- policy makes and GDPR Art. 17 requires.
--
-- Covers the two-level chains too: watchlist_items -> watchlists -> user,
-- chat_messages -> chat_sessions -> user, alert_deliveries -> alerts -> user.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
\o /dev/null

begin;

create temp table results (case_name text, expected text, actual text, passed boolean);
grant all on results to public;

insert into auth.users (id, email) values ('eeeeeeee-0000-4000-8000-00000000000e', 'erasure@test.invalid');

insert into holdings (user_id, symbol, quantity, purchase_price, purchase_date)
  values ('eeeeeeee-0000-4000-8000-00000000000e', 'AAPL', 1, 100, '2026-01-02');
insert into watchlists (id, user_id, name)
  values ('eeee1111-0000-4000-8000-00000000000e', 'eeeeeeee-0000-4000-8000-00000000000e', 'list');
insert into watchlist_items (watchlist_id, symbol)
  values ('eeee1111-0000-4000-8000-00000000000e', 'AAPL');
insert into chat_sessions (id, user_id, title)
  values ('eeee2222-0000-4000-8000-00000000000e', 'eeeeeeee-0000-4000-8000-00000000000e', 'thread');
insert into chat_messages (session_id, role, content)
  values ('eeee2222-0000-4000-8000-00000000000e', 'user', 'personal financial question');
insert into alerts (id, user_id, alert_type, scope_value, condition)
  values ('eeee3333-0000-4000-8000-00000000000e', 'eeeeeeee-0000-4000-8000-00000000000e', 'price', 'AAPL', '{}');
insert into alert_deliveries (alert_id, channel)
  values ('eeee3333-0000-4000-8000-00000000000e', 'in_app');
insert into saved_screens (user_id, name, filters)
  values ('eeeeeeee-0000-4000-8000-00000000000e', 'screen', '{}');
insert into daily_briefings (user_id, briefing_date, content)
  values ('eeeeeeee-0000-4000-8000-00000000000e', '2026-08-20', '{}');
insert into subscriptions (user_id, tier)
  values ('eeeeeeee-0000-4000-8000-00000000000e', 'premium')
  on conflict (user_id) do update set tier = 'premium';
insert into discussion_threads (symbol, user_id, body)
  values ('AAPL', 'eeeeeeee-0000-4000-8000-00000000000e', 'a public comment');
insert into ai_usage_events (user_id) values ('eeeeeeee-0000-4000-8000-00000000000e');
insert into chat_usage_events (user_id) values ('eeeeeeee-0000-4000-8000-00000000000e');

-- What deleteAccount() actually does.
delete from auth.users where id = 'eeeeeeee-0000-4000-8000-00000000000e';

-- Direct children.
insert into results select 'holdings removed', '0', count(*)::text, count(*) = 0
  from holdings where user_id = 'eeeeeeee-0000-4000-8000-00000000000e';
insert into results select 'watchlists removed', '0', count(*)::text, count(*) = 0
  from watchlists where user_id = 'eeeeeeee-0000-4000-8000-00000000000e';
insert into results select 'chat_sessions removed', '0', count(*)::text, count(*) = 0
  from chat_sessions where user_id = 'eeeeeeee-0000-4000-8000-00000000000e';
insert into results select 'alerts removed', '0', count(*)::text, count(*) = 0
  from alerts where user_id = 'eeeeeeee-0000-4000-8000-00000000000e';
insert into results select 'saved_screens removed', '0', count(*)::text, count(*) = 0
  from saved_screens where user_id = 'eeeeeeee-0000-4000-8000-00000000000e';
insert into results select 'daily_briefings removed', '0', count(*)::text, count(*) = 0
  from daily_briefings where user_id = 'eeeeeeee-0000-4000-8000-00000000000e';
insert into results select 'subscriptions removed', '0', count(*)::text, count(*) = 0
  from subscriptions where user_id = 'eeeeeeee-0000-4000-8000-00000000000e';
insert into results select 'profiles removed', '0', count(*)::text, count(*) = 0
  from profiles where user_id = 'eeeeeeee-0000-4000-8000-00000000000e';
insert into results select 'user_settings removed', '0', count(*)::text, count(*) = 0
  from user_settings where user_id = 'eeeeeeee-0000-4000-8000-00000000000e';
insert into results select 'ai_usage_events removed', '0', count(*)::text, count(*) = 0
  from ai_usage_events where user_id = 'eeeeeeee-0000-4000-8000-00000000000e';
insert into results select 'chat_usage_events removed', '0', count(*)::text, count(*) = 0
  from chat_usage_events where user_id = 'eeeeeeee-0000-4000-8000-00000000000e';
insert into results select 'discussion_threads removed', '0', count(*)::text, count(*) = 0
  from discussion_threads where user_id = 'eeeeeeee-0000-4000-8000-00000000000e';

-- Two-level chains: the child of a child must go too.
insert into results select 'watchlist_items removed via parent watchlist', '0', count(*)::text, count(*) = 0
  from watchlist_items where watchlist_id = 'eeee1111-0000-4000-8000-00000000000e';
insert into results select 'chat_messages removed via parent session', '0', count(*)::text, count(*) = 0
  from chat_messages where session_id = 'eeee2222-0000-4000-8000-00000000000e';
insert into results select 'alert_deliveries removed via parent alert', '0', count(*)::text, count(*) = 0
  from alert_deliveries where alert_id = 'eeee3333-0000-4000-8000-00000000000e';

-- Every table carrying user_id must cascade. Catches a table added later that
-- forgets ON DELETE CASCADE, which is the realistic way this regresses.
insert into results
select 'every user_id column cascades on auth.users delete',
       '0 without cascade',
       coalesce(string_agg(tablename, ', '), 'none') || ' without cascade',
       count(*) = 0
from (
  select c.relname as tablename
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join information_schema.columns col
    on col.table_name = c.relname and col.column_name = 'user_id' and col.table_schema = 'public'
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (
      select 1 from pg_constraint con
      where con.conrelid = c.oid and con.contype = 'f' and con.confdeltype = 'c'
        and exists (
          select 1 from unnest(con.conkey) k
          join pg_attribute a on a.attrelid = c.oid and a.attnum = k
          where a.attname = 'user_id'
        )
    )
) t;

\o
select case when passed then 'PASS' else 'FAIL' end as result, case_name, expected, actual
from results order by passed, case_name;

do $$
declare f int;
begin
  select count(*) into f from results where not passed;
  if f > 0 then raise exception 'GDPR ERASURE TEST FAILED: % case(s) left data behind', f; end if;
  raise notice 'GDPR ERASURE TEST PASSED: % cases', (select count(*) from results);
end $$;

rollback;
