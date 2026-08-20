-- Brute-force protection for the credential endpoints.
--
-- There was none. Supabase Auth applies its own limits upstream, but they are
-- not visible to or tunable from this app, and the remediation brief asks for
-- a specific, verifiable policy: 5 attempts per 15 minutes.
--
-- DB-backed rather than in-memory on purpose. Next.js server actions run in
-- whatever instance the platform hands them, so an in-process Map is a counter
-- that resets under exactly the load a brute-force attempt generates. This is
-- one small table with a partial index, checked on the auth paths only.
--
-- Identifier is a hash, never the email itself: this table would otherwise be
-- a plaintext list of every address anyone has tried to log in as, readable by
-- anyone who reaches the database, which is a worse problem than the one it
-- solves.

create table if not exists auth_attempts (
  id bigserial primary key,
  -- sha256(lower(email) || ':' || salt) or sha256(ip), never the raw value
  identifier_hash text not null,
  kind text not null check (kind in ('sign_in', 'sign_up', 'password_reset')),
  succeeded boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index if not exists auth_attempts_lookup_idx
  on auth_attempts (identifier_hash, kind, attempted_at desc);

alter table auth_attempts enable row level security;
-- No policy: service-role writes and reads only. An unauthenticated caller
-- must not be able to read or clear its own attempt history.

-- Attempts age out; nothing here is worth keeping beyond the window.
create or replace function public.prune_auth_attempts() returns void
language sql
as $$
  delete from auth_attempts where attempted_at < now() - interval '24 hours';
$$;

comment on table auth_attempts is
  'Rate-limit ledger for credential endpoints. Identifiers are hashed. Pruned to 24h by prune_auth_attempts().';
