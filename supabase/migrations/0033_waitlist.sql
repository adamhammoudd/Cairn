-- Pre-launch waitlist.
--
-- One public form on the marketing site collects an email address. There is no
-- account yet, so this is not `auth.users` and not `profiles` - it is a flat
-- table read and written only by the server (the join server action and the
-- confirmation route), both using the service-role client.
--
-- Founding-member offer: the first 50 people to CONFIRM their email (not the
-- first 50 to submit the form) get 2 months of free Premium once the app
-- launches. "Confirm", not "submit", so a script cannot burn through all 50
-- slots with addresses it does not control - an unconfirmed row holds nothing.
--
-- Everything a client could lie about (founding status, waitlist position, the
-- confirmed flag, the signup IP) is set server-side. The client supplies only
-- the email and a timezone string. RLS is enabled with NO anon/authenticated
-- policy, exactly like `auth_attempts`: PostgREST cannot read or write this
-- table at all, so it can never become an email-harvesting endpoint.

create table if not exists waitlist (
  id                 bigint generated always as identity primary key,
  -- The address as the user typed it (for the confirmation email's To: line and
  -- for display), plus a normalised form that is the uniqueness key.
  email              text not null,
  email_normalized   text not null,
  status             text not null default 'pending'
                       check (status in ('pending', 'confirmed')),
  -- Sent in the confirmation link. UUID v4 - not guessable, single use in
  -- practice because confirm_waitlist() is idempotent once status='confirmed'.
  confirmation_token uuid not null default gen_random_uuid(),
  confirmed_at       timestamptz,
  -- Assigned by confirm_waitlist() in confirmation order, across ALL confirmed
  -- rows. Null while pending. founding_member is just (position <= 50), stored
  -- so it cannot drift if the limit is ever revisited.
  waitlist_position  integer,
  founding_member    boolean not null default false,
  -- Lightweight risk signals for a MANUAL review pass before the founding list
  -- is finalised - never used to auto-reject. inet so same-network signups
  -- (households, offices) are visible without being punished.
  signup_ip          inet,
  user_agent         text,
  client_timezone    text,
  -- Set true when another row within a short window shares BOTH this IP and
  -- this user agent - i.e. worth a human glance, not worth blocking.
  review_flag        boolean not null default false,
  created_at         timestamptz not null default now()
);

-- One row per address. Case/whitespace-insensitive via the normalised column.
create unique index if not exists waitlist_email_normalized_key
  on waitlist (email_normalized);

-- confirm_waitlist() counts confirmed rows; the join action counts recent rows
-- per IP for soft rate limiting.
create index if not exists waitlist_status_idx on waitlist (status);
create index if not exists waitlist_ip_recent_idx on waitlist (signup_ip, created_at desc);

alter table waitlist enable row level security;
-- Deliberately no policy. Service-role reads and writes only. An unauthenticated
-- caller must not be able to read anyone's address or claim a position directly.

comment on table waitlist is
  'Pre-launch waitlist signups. Service-role only (RLS enabled, no policy). '
  'Founding members = first 50 rows to reach status=confirmed, by confirmed_at order.';

-- ----------------------------------------------------------------------------
-- confirm_waitlist(token): idempotent double-opt-in confirmation.
--
-- Returns the row's outcome so the confirmation page can render it:
--   outcome = 'confirmed' (just now) | 'already' (was already confirmed)
--           | 'invalid'   (no such token)
--
-- The advisory lock serialises concurrent confirmations so two callers cannot
-- both read "40 confirmed" and both take position 41. Held for the transaction
-- only; contention here is a handful of clicks, not a hot path.
-- ----------------------------------------------------------------------------
create or replace function public.confirm_waitlist(p_token uuid)
returns table (outcome text, list_position integer, founding_member boolean, founding_limit integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       bigint;
  v_status   text;
  v_position integer;
  v_founding boolean;
  c_limit    constant integer := 50;
begin
  perform pg_advisory_xact_lock(hashtext('waitlist_confirm'));

  -- Columns are table-qualified because `founding_member` is also the name of
  -- an OUT parameter of this function - an unqualified reference is ambiguous.
  select w.id, w.status, w.waitlist_position, w.founding_member
    into v_id, v_status, v_position, v_founding
  from waitlist w
  where w.confirmation_token = p_token;

  if v_id is null then
    return query select 'invalid'::text, null::integer, false, c_limit;
    return;
  end if;

  if v_status = 'confirmed' then
    return query select 'already'::text, v_position, v_founding, c_limit;
    return;
  end if;

  select count(*) + 1 into v_position from waitlist w where w.status = 'confirmed';
  v_founding := v_position <= c_limit;

  update waitlist w
     set status = 'confirmed',
         confirmed_at = now(),
         waitlist_position = v_position,
         founding_member = v_founding
   where w.id = v_id;

  return query select 'confirmed'::text, v_position, v_founding, c_limit;
end;
$$;

-- Callable by the server only. The confirmation route uses the service-role
-- client; anon/authenticated have no business invoking this directly. Supabase
-- grants EXECUTE to anon/authenticated by default on functions in `public`, so
-- revoking from PUBLIC alone is not enough - name the roles.
revoke all on function public.confirm_waitlist(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- waitlist_founding_slots_remaining(): real count for the marketing page.
--
-- Never a padded or fabricated number - if it says 12 places left, 38 people
-- have confirmed. Returns 0 once full.
-- ----------------------------------------------------------------------------
create or replace function public.waitlist_founding_slots_remaining()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0, 50 - count(*))::integer
  from waitlist
  where status = 'confirmed' and founding_member;
$$;

revoke all on function public.waitlist_founding_slots_remaining() from public, anon, authenticated;
