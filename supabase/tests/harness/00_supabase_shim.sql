-- Minimal local stand-in for the Supabase-managed pieces the app schema
-- depends on: the auth schema, auth.users, auth.uid(), and the anon /
-- authenticated / service_role roles. Mirrors Supabase's real behaviour:
-- auth.uid() reads the sub claim out of the request.jwt.claims GUC, which is
-- what PostgREST sets per request from the caller's JWT.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- Read by beta_invite_active_users() (migration 0064).
  last_sign_in_at timestamptz
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'anon');
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema public, auth to anon, authenticated, service_role;

-- Supabase grants anon/authenticated broad table privileges on the public
-- schema and relies on RLS for row filtering. Emulating that faithfully
-- matters: without these grants the test would "pass" on a permission error
-- rather than on the policy actually denying the row.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
