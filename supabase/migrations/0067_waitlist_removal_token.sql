-- Self-service waitlist removal (audit 2026-10-02, item 3.10) and the "Reply STOP"
-- path (item 3.4).
--
-- Every email to a waitlist member now carries a personal link,
-- /waitlist/remove?token=..., that removes their row without a login. The token
-- is its own random value, not the confirmation token: the confirmation link is
-- single-purpose and the removal link must keep working after it. Existing rows
-- are backfilled with their own random token (a volatile default is evaluated
-- per row).
--
-- Removing deletes the waitlist row (and, through the existing cascade, any
-- invite attached to it) - the person asked to be taken off, so nothing about
-- them is kept. Only the service role touches this table (RLS on, no policies).

alter table public.waitlist
  add column if not exists removal_token uuid not null default gen_random_uuid();

create unique index if not exists waitlist_removal_token_key on public.waitlist (removal_token);
