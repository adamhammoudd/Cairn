-- Reconciles the two disagreeing definitions of `subscriptions`.
--
-- schema.sql creates the table with a `plan` column; 0012_phase12_billing.sql
-- creates it with a `tier` column but guards the statement with
-- `create table if not exists`, so on any database provisioned from
-- schema.sql first the 0012 body is a silent no-op and `tier` never exists.
-- Every billing read in the app selects `tier`
-- (src/lib/actions/billing.ts) and Database["subscriptions"]["Row"] declares
-- `tier`, so on such a database getUserPlan() -- the gate CLAUDE.md requires
-- every premium feature to route through -- has its query error out and falls
-- back to "free" for everyone, and setTier() fails outright.
--
-- `tier` is canonical (it is what the types and every call site use). This
-- adds it where missing, backfills from `plan`, and retires `plan`.

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'plan')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'tier')
  then
    alter table subscriptions rename column plan to tier;
    alter table subscriptions rename constraint subscriptions_plan_check to subscriptions_tier_check;
  end if;
end $$;

alter table subscriptions add column if not exists tier text not null default 'free';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_tier_check') then
    alter table subscriptions add constraint subscriptions_tier_check check (tier in ('free', 'premium'));
  end if;
end $$;

-- Backfill any row that predates the rename and still carries only `plan`.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'plan')
  then
    update subscriptions set tier = plan where tier is distinct from plan and plan is not null;
    alter table subscriptions drop column plan;
  end if;
end $$;

-- schema.sql and 0012 each installed an identical owner-scoped policy under a
-- different name. Two policies on the same table are OR-ed, so the duplicate is
-- harmless today but makes the effective grant harder to audit. Keep one.
drop policy if exists "own row" on subscriptions;
drop policy if exists "own subscription" on subscriptions;
create policy "own subscription" on subscriptions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
