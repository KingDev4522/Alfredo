-- PRD 18 — Static/Motion classification flag.
-- Paste into Supabase Dashboard > SQL Editor, then Run. Safe to re-run.
-- Old rows keep working: the column defaults to 'motion'.

alter table if exists main_recordings
  add column if not exists recording_type text not null default 'motion'
  check (recording_type in ('static', 'motion'));

alter table if exists user_recordings
  add column if not exists recording_type text not null default 'motion'
  check (recording_type in ('static', 'motion'));

create index if not exists idx_main_recordings_type on main_recordings (recording_type);
create index if not exists idx_user_recordings_type on user_recordings (recording_type);

-- Fixes 503 PGRST002 after altering tables.
notify pgrst, 'reload schema';
