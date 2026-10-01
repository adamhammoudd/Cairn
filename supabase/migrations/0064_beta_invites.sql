-- Personal, single-use beta invites, sent automatically from the waitlist.
--
-- Numbered 0064, not 0061: 0061-0063 are already taken by unmerged branches
-- (feat/framework-in-assistant: 0061_capital_use, 0063_stockholders_equity;
-- feat/business-profile: 0062_business_profile). Taking 0061 here would collide
-- with whichever of those merges first.
--
-- Before this, the only way into the closed beta was a shared code in the
-- BETA_INVITE_CODES env var pasted into a link by hand. That path still works
-- (src/lib/public-paths.ts, "manual override"); this adds the automatic one:
--
--   waitlist (confirmed) --send-beta-invites job--> beta_invites row + email
--   /signup?invite=<code> --signUp action--> claim + account, once
--
-- Same posture as `waitlist` (0033) and `email_send_log` (0036): RLS enabled
-- with NO policies, functions revoked from anon/authenticated. Only the
-- service-role client touches any of this, so an invite can never be read,
-- listed or guessed through the public API.
--
-- The invite code itself is never stored - only its SHA-256 (hex). A database
-- read alone cannot produce a working link.

create table if not exists beta_invites (
  id                bigint generated always as identity primary key,
  -- One invite per waitlist row, ever. A re-invite by an admin reissues this
  -- row (new hash, new expiry) rather than adding a second one, so "no one gets
  -- more than one invite" is a constraint, not a convention.
  waitlist_id       bigint not null unique references waitlist(id) on delete cascade,
  token_hash        text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at        timestamptz not null default now(),
  -- Set only after the mail provider accepted the message. Null = not yet
  -- delivered (new, or the last send failed) and the next job run retries it.
  emailed_at        timestamptz,
  expires_at        timestamptz not null default now() + interval '14 days',
  -- The one reminder, sent ~7 days after emailed_at if still unclaimed.
  reminded_at       timestamptz,
  -- Emails that reached the provider for this invite (invite + reminder, plus
  -- any admin resend). The job never sends when this is already >= 2.
  emails_sent       integer not null default 0 check (emails_sent >= 0),
  send_attempts     integer not null default 0 check (send_attempts >= 0),
  -- Short provider reason ("provider-422", "smtp-error") - never the message,
  -- never the code.
  last_send_error   text,
  -- Two-phase claim: claim_started_at reserves the invite while the account is
  -- created; claimed_at/claimed_by mark it used. A reservation older than five
  -- minutes with no claimed_at is treated as abandoned (a crashed request).
  claim_started_at  timestamptz,
  claimed_at        timestamptz,
  claimed_by        uuid references auth.users(id) on delete set null,
  revoked_at        timestamptz,
  source            text not null default 'job' check (source in ('job', 'admin'))
);

create index if not exists beta_invites_open_idx
  on beta_invites (expires_at)
  where claimed_at is null and revoked_at is null;
create index if not exists beta_invites_claimed_idx on beta_invites (claimed_at) where claimed_at is not null;

alter table beta_invites enable row level security;
-- Deliberately no policy.

comment on table beta_invites is
  'Personal single-use beta invites. token_hash = sha256(code), the code is never '
  'stored. Service-role only (RLS enabled, no policy).';

-- One row per job run, for the admin page's "last run" line and as the lock
-- that stops two overlapping runs. Counts only - no addresses.
create table if not exists beta_invite_runs (
  id          bigint generated always as identity primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  outcome     text,
  detail      jsonb not null default '{}'::jsonb
);
-- At most one unfinished run. A second concurrent run fails to insert and
-- exits; a run that died mid-way is closed as 'abandoned' after 15 minutes by
-- beta_invite_start_run() below.
create unique index if not exists beta_invite_runs_one_open
  on beta_invite_runs ((true)) where finished_at is null;
create index if not exists beta_invite_runs_started_idx on beta_invite_runs (started_at desc);

alter table beta_invite_runs enable row level security;

-- Every admin action (send now, revoke, resend) writes a row here.
create table if not exists beta_invite_audit (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor        uuid references auth.users(id) on delete set null,
  action       text not null check (action in ('send_now', 'revoke', 'resend')),
  invite_id    bigint references beta_invites(id) on delete set null,
  waitlist_id  bigint references waitlist(id) on delete set null,
  outcome      text not null
);
create index if not exists beta_invite_audit_at_idx on beta_invite_audit (at desc);

alter table beta_invite_audit enable row level security;

-- ----------------------------------------------------------------------------
-- beta_invite_active_users(): the number the cap is measured against.
--
-- Distinct users who either claimed an invite in the last p_days days or
-- signed in within the last p_days days. A union of ids, so someone who did
-- both counts once. auth.users is not exposed over the API, hence a definer
-- function.
-- ----------------------------------------------------------------------------
create or replace function public.beta_invite_active_users(p_days integer default 30)
returns integer
language sql
stable
security definer
set search_path = public, auth
as $$
  select count(*)::integer from (
    select claimed_by as id from beta_invites
     where claimed_by is not null and claimed_at > now() - make_interval(days => p_days)
    union
    select id from auth.users
     where last_sign_in_at > now() - make_interval(days => p_days)
  ) active;
$$;

-- ----------------------------------------------------------------------------
-- beta_invite_next_in_line(n): confirmed waitlist rows with no invite yet,
-- founding members first, then waitlist_position. Used by the job (who to
-- invite) and by the admin page (who is next).
-- ----------------------------------------------------------------------------
create or replace function public.beta_invite_next_in_line(p_limit integer)
returns table (waitlist_id bigint, email text, waitlist_position integer, founding_member boolean)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.email, w.waitlist_position, w.founding_member
    from waitlist w
   where w.status = 'confirmed'
     and not exists (select 1 from beta_invites i where i.waitlist_id = w.id)
   order by w.founding_member desc, w.waitlist_position asc nulls last, w.id asc
   limit greatest(p_limit, 0);
$$;

-- ----------------------------------------------------------------------------
-- beta_invite_start_run(): take the run lock. Returns the run id, or null when
-- another run is already in progress. A run left open for 15+ minutes (the
-- function was killed) is closed as 'abandoned' first, so one crash cannot
-- wedge the job forever.
-- ----------------------------------------------------------------------------
create or replace function public.beta_invite_start_run()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  update beta_invite_runs
     set finished_at = now(), outcome = 'abandoned'
   where finished_at is null and started_at < now() - interval '15 minutes';

  insert into beta_invite_runs default values returning id into v_id;
  return v_id;
exception when unique_violation then
  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- beta_invite_begin_claim(hash, email): the atomic half of sign-up.
--
-- One UPDATE ... WHERE claimed_at IS NULL AND (no live reservation). Two
-- simultaneous requests with the same code both reach this statement; Postgres
-- takes the row lock for the first, and the second re-checks the WHERE clause
-- against the row the first just wrote (READ COMMITTED re-evaluation), finds a
-- live claim_started_at, and updates nothing. Exactly one caller gets a row
-- back, and only that caller goes on to create an account.
--
-- The email is part of the WHERE clause, so a code presented with any other
-- address reserves nothing.
-- ----------------------------------------------------------------------------
create or replace function public.beta_invite_begin_claim(p_token_hash text, p_email text)
returns table (invite_id bigint, email text)
language sql
security definer
set search_path = public
as $$
  update beta_invites i
     set claim_started_at = now()
    from waitlist w
   where i.token_hash = p_token_hash
     and w.id = i.waitlist_id
     and w.email_normalized = lower(btrim(p_email))
     and i.claimed_at is null
     and i.revoked_at is null
     and i.expires_at > now()
     and (i.claim_started_at is null or i.claim_started_at < now() - interval '5 minutes')
  returning i.id, w.email_normalized;
$$;

-- Marks the reserved invite used by the account that was just created.
create or replace function public.beta_invite_finish_claim(p_invite_id bigint, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with done as (
    update beta_invites
       set claimed_at = now(), claimed_by = p_user_id
     where id = p_invite_id and claimed_at is null and claim_started_at is not null
    returning 1
  )
  select exists (select 1 from done);
$$;

-- Releases a reservation when account creation failed, so the person can try
-- again with the same link.
create or replace function public.beta_invite_abort_claim(p_invite_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update beta_invites set claim_started_at = null where id = p_invite_id and claimed_at is null;
$$;

-- ----------------------------------------------------------------------------
-- beta_invite_stats(): one round trip for the admin page and the job's cap
-- math. Counts only.
-- ----------------------------------------------------------------------------
create or replace function public.beta_invite_stats()
returns table (
  confirmed_waitlist integer,
  sent integer,
  claimed integer,
  expired integer,
  revoked integer,
  pending integer,
  unsent integer,
  outstanding integer,
  active_users integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from waitlist where status = 'confirmed')::integer,
    (select count(*) from beta_invites where emailed_at is not null)::integer,
    (select count(*) from beta_invites where claimed_at is not null)::integer,
    (select count(*) from beta_invites where claimed_at is null and revoked_at is null and expires_at <= now())::integer,
    (select count(*) from beta_invites where claimed_at is null and revoked_at is not null)::integer,
    -- Emailed, still usable, not yet used.
    (select count(*) from beta_invites where emailed_at is not null and claimed_at is null and revoked_at is null and expires_at > now())::integer,
    -- Created, not yet accepted by the mail provider (failed send awaiting retry).
    (select count(*) from beta_invites where emailed_at is null and claimed_at is null and revoked_at is null and expires_at > now())::integer,
    -- Every invite that still holds a place under the cap: usable and unclaimed,
    -- whether or not the email has gone out yet.
    (select count(*) from beta_invites where claimed_at is null and revoked_at is null and expires_at > now())::integer,
    public.beta_invite_active_users(30);
$$;

-- Server only. Supabase grants EXECUTE to anon/authenticated by default on
-- functions in `public`, so name the roles (same as 0033).
revoke all on function public.beta_invite_active_users(integer) from public, anon, authenticated;
revoke all on function public.beta_invite_next_in_line(integer) from public, anon, authenticated;
revoke all on function public.beta_invite_start_run() from public, anon, authenticated;
revoke all on function public.beta_invite_begin_claim(text, text) from public, anon, authenticated;
revoke all on function public.beta_invite_finish_claim(bigint, uuid) from public, anon, authenticated;
revoke all on function public.beta_invite_abort_claim(bigint) from public, anon, authenticated;
revoke all on function public.beta_invite_stats() from public, anon, authenticated;
