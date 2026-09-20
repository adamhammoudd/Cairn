-- The Planning section (Calculators + Calendar pages) was removed. Goal
-- tracking was the only Calculators feature with stored state (see
-- 0011_phase11_goals.sql); nothing reads or writes this table any more.
--
-- Destructive: this discards every saved goal. Apply deliberately.

drop table if exists goals;
