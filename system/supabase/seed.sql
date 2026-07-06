-- Test seed: one supervisor + two drivers.
-- Replace the telegram_id / email values with real ones before running.
-- Get a numeric Telegram id by messaging @userinfobot, or use a group id
-- (negative number) for a shared channel.

insert into public.supervisors (name, telegram_id, active) values
  ('Supervisor One', '111111111', true)
on conflict (telegram_id) do nothing;

insert into public.drivers (name, email, telegram_id, active) values
  ('Driver A', 'driver-a@example.com', '222222222', true),
  ('Driver B', 'driver-b@example.com', '333333333', true)
on conflict (telegram_id) do nothing;
