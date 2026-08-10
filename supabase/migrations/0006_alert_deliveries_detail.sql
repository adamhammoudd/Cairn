-- Phase 8: alerts need a bit more than the Phase 1 skeleton carried.
--
-- alert_deliveries originally stored only (alert_id, channel, sent_at, status).
-- An in-app notification has to render *what* fired and whether it's been seen,
-- and reconstructing that from the alert row alone is wrong — the alert's
-- condition can be edited after a delivery, which would retroactively rewrite
-- the text of a past notification. So the message is snapshotted at send time.

alter table alert_deliveries
  add column if not exists message text,
  add column if not exists read_at timestamptz;

-- Which channels a given alert should fan out to. Kept on the alert rather than
-- as a user-level setting so one alert can be in-app-only while another emails.
alter table alerts
  add column if not exists channels text[] not null default array['in_app'];

create index if not exists alert_deliveries_alert_id_idx on alert_deliveries (alert_id);
create index if not exists alert_deliveries_sent_at_idx on alert_deliveries (sent_at desc);
