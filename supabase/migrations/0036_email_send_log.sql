-- Daily email-send counter, for the temporary Gmail SMTP bridge in
-- src/lib/waitlist.ts (sendConfirmationEmail -> sendViaGmailSmtp).
--
-- WHY THIS EXISTS: until a real domain is verified on Resend, waitlist
-- confirmation emails go out through a personal Gmail account over SMTP. Gmail
-- caps a normal account at ~500 messages/day; blow past that and Google can
-- temporarily lock outbound sending on the account. The bridge stops sending
-- at a lower threshold (GMAIL_SMTP_DAILY_CAP, default 400) and this table is
-- how it counts - one row per UTC day, service-role only, same RLS posture as
-- `waitlist` and `auth_attempts` (enabled, no policy).
--
-- This whole table can be dropped once WAITLIST_EMAIL_FROM points at a
-- verified Resend domain and the Gmail path is deleted.

create table if not exists email_send_log (
  -- UTC calendar day. new Date().toISOString().slice(0,10) on the app side.
  day  date not null primary key,
  -- Count of messages the Gmail bridge has handed to SMTP for this day. Not a
  -- delivery guarantee - just "we attempted this many", which is what Gmail's
  -- rate limit actually counts against the account.
  sent integer not null default 0 check (sent >= 0)
);

alter table email_send_log enable row level security;
-- Deliberately no policy. The app touches this only through the service-role
-- client; PostgREST callers have no business reading or writing it.

comment on table email_send_log is
  'Per-UTC-day outbound email counter for the temporary Gmail SMTP bridge '
  '(src/lib/waitlist.ts). Service-role only. Safe to drop once waitlist email '
  'moves to a verified Resend domain.';

-- ----------------------------------------------------------------------------
-- record_email_send(p_cap): atomically claim one send slot for today.
--
-- Returns TRUE and bumps today's counter when the day is still under p_cap;
-- returns FALSE and leaves the counter untouched when the cap is already
-- reached. One statement, so two concurrent callers can't both read "399" and
-- both send - the row lock on the upsert serialises them.
-- ----------------------------------------------------------------------------
create or replace function public.record_email_send(p_cap integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day  date := (now() at time zone 'utc')::date;
  v_sent integer;
begin
  insert into email_send_log (day, sent)
  values (v_day, 1)
  on conflict (day) do update
    set sent = email_send_log.sent + 1
    where email_send_log.sent < p_cap
  returning sent into v_sent;

  -- No row returned => the ON CONFLICT guard failed, i.e. already at the cap.
  return v_sent is not null;
end;
$$;

-- Server-only, same as the waitlist functions in 0033.
revoke all on function public.record_email_send(integer) from public, anon, authenticated;
