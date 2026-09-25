-- SignSpeak / ISL Interpreter — full setup (idempotent)
-- Paste entire file into Supabase Dashboard > SQL Editor, then Run.
-- Safe to re-run. After Run: green "Success" expected on every statement.

-- ========== 1. TABLES ==========

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

create table if not exists main_recordings (
  id uuid primary key default gen_random_uuid(),
  sign_id text not null,
  recorded_by text not null default 'admin',
  condition_label text default 'unspecified',
  hand_count int not null check (hand_count in (1,2)),
  frames jsonb not null,
  frame_count int generated always as (jsonb_array_length(frames)) stored,
  created_at timestamptz default now(),
  created_by uuid references profiles(id)
);
create index if not exists idx_main_recordings_sign on main_recordings (sign_id);

create table if not exists user_recordings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  sign_id text not null,
  recorded_by text,
  condition_label text default 'unspecified',
  hand_count int not null check (hand_count in (1,2)),
  frames jsonb not null,
  frame_count int generated always as (jsonb_array_length(frames)) stored,
  created_at timestamptz default now()
);
create index if not exists idx_user_recordings_owner_sign on user_recordings (owner_id, sign_id);

create table if not exists custom_words (
  owner_id uuid references profiles(id) on delete cascade,
  word_id text not null,
  label text not null,
  is_global boolean default false,
  created_at timestamptz default now(),
  primary key (owner_id, word_id)
);

-- ========== 2. ROW LEVEL SECURITY ==========

alter table profiles enable row level security;
alter table main_recordings enable row level security;
alter table user_recordings enable row level security;
alter table custom_words enable row level security;

-- profiles: user reads/updates own row; inserts own row on first login.
-- is_admin cannot be self-granted (stays false until you run the admin UPDATE below).
drop policy if exists "profiles select own" on profiles;
create policy "profiles select own"
on profiles for select to authenticated
using (auth.uid() = id);

drop policy if exists "profiles insert own" on profiles;
create policy "profiles insert own"
on profiles for insert to authenticated
with check (auth.uid() = id and is_admin = false);

drop policy if exists "profiles update own non-admin" on profiles;
create policy "profiles update own non-admin"
on profiles for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id and is_admin = false);

-- main_recordings: all logged-in users read; only admins write/delete.
drop policy if exists "read main for authenticated" on main_recordings;
create policy "read main for authenticated"
on main_recordings for select to authenticated
using (true);

drop policy if exists "admin insert main" on main_recordings;
create policy "admin insert main"
on main_recordings for insert to authenticated
with check (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

drop policy if exists "admin update/delete main" on main_recordings;
create policy "admin update/delete main"
on main_recordings for update to authenticated
using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
)
with check (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

drop policy if exists "admin delete main" on main_recordings;
create policy "admin delete main"
on main_recordings for delete to authenticated
using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

-- user_recordings: owner-only CRUD.
drop policy if exists "own select" on user_recordings;
create policy "own select"
on user_recordings for select to authenticated
using (auth.uid() = owner_id);

drop policy if exists "own insert" on user_recordings;
create policy "own insert"
on user_recordings for insert to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "own update" on user_recordings;
create policy "own update"
on user_recordings for update to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "own delete" on user_recordings;
create policy "own delete"
on user_recordings for delete to authenticated
using (auth.uid() = owner_id);

-- custom_words: read own + globals; write own only.
-- is_global=true only allowed for admins (insert/update).
drop policy if exists "read own + global words" on custom_words;
create policy "read own + global words"
on custom_words for select to authenticated
using (auth.uid() = owner_id or is_global = true);

drop policy if exists "insert own words" on custom_words;
create policy "insert own words"
on custom_words for insert to authenticated
with check (
  auth.uid() = owner_id
  and (
    is_global = false
    or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  )
);

drop policy if exists "update own words" on custom_words;
create policy "update own words"
on custom_words for update to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and (
    is_global = false
    or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  )
);

drop policy if exists "delete own words" on custom_words;
create policy "delete own words"
on custom_words for delete to authenticated
using (auth.uid() = owner_id);

-- ========== 3. RELOAD POSTGREST SCHEMA CACHE ==========
-- Fixes 503 PGRST002 after tables are created.

notify pgrst, 'reload schema';

-- ========== 4. VERIFY (expect empty result sets = OK) ==========
-- Uncomment to sanity-check after Run:

-- select 'profiles' as tbl, count(*) from profiles
-- union all select 'main_recordings', count(*) from main_recordings
-- union all select 'user_recordings', count(*) from user_recordings
-- union all select 'custom_words', count(*) from custom_words;

-- ========== 5. AFTER FIRST GOOGLE LOGIN ==========
-- Set your admin email (run separately after you sign in once):

-- update profiles set is_admin = true where email = 'debjeetmazumder3232@gmail.com';
