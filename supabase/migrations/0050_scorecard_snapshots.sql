-- 0050: one scorecard snapshot per symbol per day (feat/daily-briefing)
--
-- The daily briefing's "Changed" card and the ticker page's "Nothing in the
-- company's numbers weakened this week" line both compare today's scorecard
-- levels with the card from a week ago. Levels are computed on the fly from
-- filings and prices (src/lib/scorecard.ts) and not stored anywhere, so a
-- week-old card has to be kept. Only the levels and verdicts are stored: the
-- numbers behind them stay in their own tables.
--
-- Written by the app (service role) the first time a held symbol's card is
-- built on a given day; one row per (symbol, as_of), so re-reading the page
-- the same day changes nothing. Until a week of rows exists, the briefing
-- makes no "changed" claim at all rather than comparing with nothing.
--
-- Not personal data: a scorecard describes a symbol, the same for everyone.

create table if not exists scorecard_snapshots (
  id bigserial primary key,
  symbol text not null,
  as_of date not null,
  -- { "<dimension key>": { "level": "strong|mixed|weak|not_applicable", "verdict": "..." } }
  levels jsonb not null,
  created_at timestamptz not null default now(),
  unique (symbol, as_of)
);
create index if not exists scorecard_snapshots_symbol_asof_idx on scorecard_snapshots (symbol, as_of desc);

alter table scorecard_snapshots enable row level security;
drop policy if exists "public read" on scorecard_snapshots;
create policy "public read" on scorecard_snapshots for select using (true);
grant select on scorecard_snapshots to anon, authenticated;
grant all on scorecard_snapshots to service_role;
