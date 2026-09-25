# PRD 02 — Cloud DB + Auth + Main vs User Recordings Isolation
`isl-interpreter` — Supabase + Vercel + FastAPI backend

> Date: 2026-09-24
> Version: v2 (locked decisions applied — see §10)
> Status: PRD only, no code changes yet.

## 0. Direct answer to your confusion

> "Shall I host complete backend + database on Supabase and frontend on Vercel?"

**Half-yes:**

| Layer | Host on | Why |
|---|---|---|
| Frontend `vite` | **Vercel** | Correct. Static + env `VITE_API_URL`, `VITE_WS_URL`. |
| Auth + Recordings DB + custom-words metadata | **Supabase** | Correct. Postgres + Google OAuth + RLS. This is your real cloud DB. |
| Heavy Python `isl-backend/main.py:10` Whisper `large-v3` + FLAN-T5 `utils/splitter.py:6` + `ws/stream` `routers/stream.py:16` | **NOT Supabase, NOT Vercel.** Keep on **Render / Fly.io / Railway / GPU VPS** | Supabase has no Python GPU compute. Vercel serverless has 10-60s timeout, 1-3 GB RAM, no `torch`, no `faster-whisper`, no `yt-dlp` binary. Your `lifespan` alone OOMs serverless. |
| `recordings.json` file | **Delete as source-of-truth.** Migrate once into Supabase, keep only as nightly backup snapshot in GitHub. | GitHub cannot do runtime CRUD (see PRD 01: 100 MB hard block, no locks, token-in-browser flaw). |

Mental model:

```
Vercel (React) --REST--> Supabase (Auth + main_recordings + user_recordings)
              --REST/WS--> FastAPI on Render (Whisper/T5/avatar poses, reads gloss from Supabase)
```

There is **no `git push` at record time**. Recording = Supabase `INSERT` (milliseconds).
`git push` only happens for code + nightly snapshots. §4.2 explains exactly what lives where.

Do not put hardcoded admin password in frontend. It is visible in `dist/*.js` to anyone.
Use Supabase Auth + `is_admin` flag instead. Section 3 covers this.

## 1. Goals / Non-goals

**Goals (locked):**

1. Whole site is **login-gated**: nobody gets inside the website without sign-in/sign-up.
   Anonymous visitors see only the login page; Record UI is **hidden**, not just disabled.
2. `main` recordings can only be written by admin **with double-confirm Publish**. Never polluted by users.
3. Logged-in (Google) users record personal/custom signs into their own cloud space,
   accessible from mobile/any device via the same Google login, never mixed into `main`.
4. Priority is deterministic: **custom always outranks main**; inside main, avatar prefers 2-hand;
   interpreter searches **all** templates for a word (motion or still, 1-hand or 2-hand).
5. Huge limit: 1000s of recordings, not 50-100 MB JSON file.

**Non-goals:**

- Retrain ML model. DTW `src/lib/dtw.js:129` stays.
- Video upload storage. Only landmark JSON (`~54KB` 1-hand, `~90KB` 2-hand pretty).
- Offline-first conflict merge beyond last-write-wins + local cache.

## 2. Roles (locked)

| State | Login | Sees | Can record | Where it goes | Can delete |
|---|---|---|---|---|---|
| Logged out | none | **Login page only.** No navbar tabs, no Record, no Interpret, no Translate. | no | — | no |
| User | Google OAuth via Supabase Auth | everything except admin Publish toggle | yes | `user_recordings` (`owner_id = auth.uid()`) + local IndexedDB cache | own only |
| Admin | Google OAuth + `profiles.is_admin=true` | everything + `Publish to Everyone` flow + `Main \| Mine` toggles | yes, with `Save to: [Shared Main \| My Space]` | `main_recordings` or `user_recordings` depending on toggle | main + own; never other users' rows |

There is no anonymous-interpret mode anymore. If you later want a public demo link, add an
explicit `?demo=1` read-only route — out of scope for this build.

## 3. Auth design

### 3.1 What to build

1. New `src/pages/LoginPage.jsx` + public route `/login` in `src/App.jsx:21`.
   Supabase `signInWithOAuth({provider:'google'})` + email magic-link fallback. No custom password table.
2. `src/lib/supabaseClient.js` (new): `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)`.
3. `src/hooks/useAuth.jsx` (new): session, `profile`, `isAdmin`, `signOut`.
   `Navbar.jsx` shows avatar/email + Admin badge + Login/Logout.
4. `profiles` table: `id uuid PK = auth.users.id, email, is_admin bool default false, created_at`.
   - Set `is_admin=true` manually in Supabase dashboard SQL for your 1-2 emails.
     That is the "admin control" — server-enforced, not client string compare.
5. App-wide gate in `src/App.jsx`:
   - `RequireAuth` wrapper around all routes except `/login`.
   - Logged-out → `Navigate to /login`. No tab content is even mounted (camera never starts).
   - `/record`, `/delete`, `/interpret`, `/translate`, `/home` all require session.
   - Master Dictionary Import `MediaInterpreter.jsx:445` + `POST /api/import-poses`
     `routers/pose_import.py:34`: render only if `isAdmin`.

### 3.2 Why not hardcoded password

`if (input === "admin123")` in `RecordingTool.jsx` ships to Vercel bundle.
Anyone opens DevTools → bypasses → `POST /api/db/recordings` `routers/database.py:211`
today has **zero auth** so they pollute main. RLS fixes this at DB layer.

## 4. Data model (Supabase Postgres)

Do **two tables**, not one. This is your anti-pollution guarantee — physical separation,
not just `where` clause.

```sql
-- profiles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

-- MAIN: golden, shared by everyone
create table main_recordings (
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
create index on main_recordings (sign_id);

-- USER: per-Google-account, cross-device
create table user_recordings (
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
create index on user_recordings (owner_id, sign_id);

-- custom word labels (replaces localStorage customWords.js:19)
create table custom_words (
  owner_id uuid references profiles(id) on delete cascade,
  word_id text not null,
  label text not null,
  is_global boolean default false,
  created_at timestamptz default now(),
  primary key (owner_id, word_id)
);
```

Size math: 1-hand compact `~47KB` → 500 MB free tier ≈ **~10,000 user recs + 375 main recs**.
No GitHub 50/100 MB wall.

### 4.1 RLS (the pollution firewall)

```sql
alter table main_recordings enable row level security;
alter table user_recordings enable row level security;
alter table custom_words enable row level security;

-- Logged-in users can READ main (anon read disabled because site is gated;
-- keep `using (true)` so any valid JWT reads main)
create policy "read main for authenticated"
on main_recordings for select to authenticated using (true);

-- Only admins can WRITE main
create policy "admin insert main"
on main_recordings for insert with check (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);
create policy "admin update/delete main"
on main_recordings for all using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

-- Users can only touch OWN rows
create policy "own select" on user_recordings for select using (auth.uid() = owner_id);
create policy "own insert" on user_recordings for insert with check (auth.uid() = owner_id);
create policy "own update/delete" on user_recordings for all using (auth.uid() = owner_id);
```

Even if frontend is hacked, Postgres rejects `INSERT INTO main_recordings` from non-admin JWT.
Current `database.py:211` has no such check — this is the core fix.

### 4.2 Where exactly is what stored — your "am I wrong?" question answered

You are right that the database is on Supabase. Precise mapping:

| Data | Stored in Supabase | NOT in | Notes |
|---|---|---|---|
| Login identity (Google) | `auth.users` (managed by Supabase Auth) | frontend, GitHub | You only configure Google provider + redirect URL. |
| Admin flag | `profiles.is_admin` | frontend | Set once via SQL. Frontend only *reads* it to show/hide Publish UI; enforcement is RLS. |
| **Main recordings (golden, shared)** | `main_recordings` table, `frames JSONB` column | GitHub live file, frontend bundle, `recordings.json` | Every `signId` row readable by all logged-in users. This drives Interpret + Avatar for everyone. |
| **Custom recordings of a user** | `user_recordings` table with `owner_id = auth.uid()`, `frames JSONB` | `main_recordings`, GitHub, other users' views | Same Google login on mobile/laptop returns same rows via `where owner_id = me`. Never queried when building another user's library. |
| Custom word labels | `custom_words` (`owner_id` or `is_global=true`) | `localStorage` only (localStorage becomes write-through cache) | |
| Avatar gloss cache | FastAPI builds in-memory per request from Supabase (`main` + requesting `owner_id` rows); optional `gloss_cache` materialized table | `gloss_poses.json` file (deprecated as source-of-truth) | No more file sync `database.py:66` writing JSON to disk. |
| Auth tokens | Supabase session in browser memory/localStorage (managed SDK) | your code, GitHub | |
| Nightly backup | GitHub `data/snapshots/*.json` (export only) | Supabase live path | For history, not reads. |

So: **no `git push` when recording**. `Keep` → Supabase `INSERT` → visible to interpret/avatar on next fetch (ms).
`git push` is only for code + snapshots.

## 5. Priority / resolution rules (locked)

### 5.1 Global rule — custom always wins

If the logged-in user has **any** recording for `signId X`, that user's copy outranks every
`main` copy of `X` for that user only. Other users are unaffected. This holds for both tabs below.
Implementation is a hard override, not an epsilon tie-break.

### 5.2 Avatar / 3D model tab (`MediaInterpreter.jsx:7`, `Avatar.jsx:55`, `ai_pipeline.py:21`) — locked

Resolution order per requested word, evaluated server-side per request (`owner_id` from JWT):

1. **User custom golden** for `owner_id + signId` (latest by `created_at`) — use its frames as-is,
   whatever its `hand_count` is. If user recorded it, only that is shown for them.
2. Else **Main 2-handed golden** for `signId` (latest `hand_count=2`) — always preferred over 1-hand
   when both exist in main, because arms + both hands drive the avatar richer.
3. Else **Main 1-handed golden** for `signId` — used only when no 2-hand main exists.
4. Else **fingerspelling fallback** `ai_pipeline.py:72` (unchanged).

`POST /api/process-text`, `/api/process-youtube`, `/api/upload-doc` must accept
`Authorization: Bearer <supabase_jwt>` and forward `owner_id` to
`translate_and_generate_poses()`. Logged-out cannot reach these routes (site gate).

`handleImportDictionary` `MediaInterpreter.jsx:245` → admin-only, writes `main` gloss only.

### 5.3 Interpret tab (`LiveInterpreter.jsx:66 loadTemplates`, `recognizer.js:50 classifySequence`) — locked

Requirements from you: every recording for a word must be able to win — 3 reps means all 3
participate; motion vs still must not exclude; custom must win on doubt.

Implement `buildMergedLibrary(mainRecs, userRecs)`:

1. Fetch in parallel: `main` (always) + `user` (`owner_id=me`). No anonymous fetch (gated).
2. Union = `[...userRecs(source='user'), ...mainRecs(source='main')]` — **no template is dropped**
   for `handCount`, frame length, or movement amount. Keep existing soft-bucket behavior
   `recognizer.js:59` (search matching bucket first, other bucket second) — do not hard-filter.
3. Two-stage classify (hard custom priority):
   - Stage A: DTW against **user templates only**. If best user match confidence >=
     `CONFIDENCE_THRESHOLD` (`recognizer.js:130`), accept it immediately, tag `source:'you'`.
   - Stage B (only if Stage A rejects): DTW against **main templates**, accept if >= threshold.
   - This guarantees custom wins whenever it plausibly matches, while main still catches
     everything the user never personalized. All 3 reps of a word stay searchable in their stage.
4. Segmentation `segmentation.js:39` (`minSegmentMs=550`, `pauseConfirmMs=350`) is untouched —
   static held signs already fire via timeout path; "be it in motion be it not in motion" is satisfied
   because classification input is the trimmed segment `LiveInterpreter.jsx:137`, not a motion gate.
5. UI: chip shows `You` vs `Shared`; counter shows `main N + yours M`.

### 5.4 Record tab (`RecordingTool.jsx:26`) — locked with double-confirm

- `Save to: [Shared Main | My Space]` toggle rendered **only if `isAdmin`**.
  Non-admin sees fixed label `Saving to My Space` (no toggle).
- Flow for `Shared Main` (admin only):
  1. `Keep` → review panel stays open with summary (`signId`, reps, hand count).
  2. Button reads `Publish to Everyone` (not `Keep`).
  3. Click → modal: `"Publish N recording(s) for 'Hello' to the shared Main database?
     Everyone will see them immediately. This is not a git push — it inserts into
     Supabase main_recordings."` + `[Cancel] [Publish]`.
  4. Confirm → `INSERT INTO main_recordings` with admin JWT → success toast
     `"Published to Main — visible to all users."`.
- Flow for `My Space`: existing `Keep` → `INSERT INTO user_recordings`, no modal.
- `keepRecording()` `RecordingTool.jsx:417` → Supabase insert per toggle.
  Remove `saveRecording()` POST to `localhost:8000` for landmarks
  (keep FastAPI only for media/AI routes).
- `getCountsPerSign()` `recordingStorage.js:39` → two counts: `sharedCount[signId]`, `myCount[signId]`.
  Picker shows `Hello (12 shared + 3 yours)`.
- `customWords.js:48 addCustomWord` → insert into `custom_words`
  (`owner_id=me` or `is_global=true` if admin + double-confirm).
  `syncCustomWordsWithDatabase():88` becomes Supabase query, not `getAllRecordings()` scan.

### 5.5 Delete tab (`ReviewFlagged.jsx:34`)

- User mode: `loadFlagged()` queries `user_recordings` where `owner_id=me`.
- Admin mode: segmented control `Main|Mine`, delete calls correct table.
  `Main` deletes also require confirm modal (`"Remove from everyone?"`).
  Never list other users' rows (RLS enforces even if UI bugs).

## 6. File-by-file change list

**New:**

- `src/lib/supabaseClient.js`, `src/hooks/useAuth.jsx`, `src/pages/LoginPage.jsx`,
  `src/components/RequireAuth.jsx` (route gate), `src/components/PublishModal.jsx` (admin double-confirm),
  `src/lib/libraryMerge.js` (`buildMergedLibrary` + two-stage custom-first classify),
  `supabase/migrations/001_schema.sql` (SQL in §4),
  `supabase/migrations/002_seed_main.sql` (import of current 2 recs), `.env.example`.

**Edit:**

- `src/App.jsx:21` — add `/login` public route, wrap all others in `RequireAuth`, add `AuthProvider`.
- `src/components/Navbar.jsx` — auth state, login/logout, admin badge; render nothing extra for logged-out
  (they never see it — gate redirects first).
- `src/lib/recordingStorage.js:1` — replace `fetch(API_URL/recordings)` with Supabase queries;
  keep `exportAllRecordingsAsFile():80`, `importRecordingsFromFile():48` but retarget
  to Supabase batch insert. Keep function signatures so `RecordingTool`, `LiveInterpreter`,
  `ReviewFlagged` barely change. Add `getMainRecordings()`, `getMyRecordings()`, `publishToMain()`.
- `src/lib/customWords.js:19` — localStorage → Supabase `custom_words` + local cache fallback.
- `src/components/RecordingTool.jsx:59,417` — gate (unreachable when logged out), target toggle,
  Publish modal wiring, dual counts.
- `src/components/LiveInterpreter.jsx:66` — two-stage merged library load (§5.3), source badge.
- `src/components/MediaInterpreter.jsx:165,198,229,254` — replace hardcoded
  `http://localhost:8000` with `VITE_API_URL`; attach JWT header; hide import unless `isAdmin`;
  pass `owner_id` through for §5.2 resolution.
- `src/hooks/useSignStream.js:29` — `ws://localhost:8000` → `VITE_WS_URL`
  (`wss://...` in prod) + `?job_id=&resume_from=` unchanged; add JWT query/header.
- `src/components/ReviewFlagged.jsx:34,49,60` — per-role queries + admin Main confirm.
- `isl-backend/routers/database.py:122` — replace `load_db/save_db` file IO with
  `supabase-py` (service_role) OR deprecate landmark routes entirely
  (prefer direct Supabase from frontend, less backend code).
  Replace `sync_golden_takes_to_gloss_db():66` file write with Supabase-backed golden lookup
  implementing §5.2 order (user custom → main 2-hand → main 1-hand).
- `isl-backend/utils/ai_pipeline.py:43` — accept `owner_id`, implement §5.2 lookup order.
- `isl-backend/main.py:36` — restrict CORS from `"*"` to `https://your-vercel.app` + `http://localhost:5173`.
- `.gitignore:1` — add `isl-backend/database/recordings.json`, `isl-backend/gloss_poses.json`,
  `isl-backend/*.log`, `.env.local`. Commit a one-time `data/snapshots/` export, not live DB.

**No change:** `dtw.js`, `normalize.js`, `segmentation.js`, `sentenceGrammar.js`,
`Avatar.jsx` kinematics, `usePoseHandTracker.js`.

## 7. Migration + deploy steps

1. Create Supabase project → enable Google provider → run `001_schema.sql` →
   create `profiles` rows for your emails with `is_admin=true`.
2. One-time script: read current `isl-backend/database/recordings.json` (2 recs) →
   `INSERT INTO main_recordings`. Reuse `importRecordingsFromFile` validation
   `recordingStorage.js:62`.
3. Set Vercel env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `VITE_API_URL=https://<fastapi>.onrender.com`, `VITE_WS_URL=wss://<fastapi>/ws/stream`.
   Set Render env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (never expose to frontend).
4. Deploy frontend to Vercel, backend to Render. Test matrix:
   logged-out sees login only → user records + cross-device sync → admin publishes to main
   with modal → avatar 2-hand preference → interpret custom-first.
5. Add nightly GitHub Action: `pg_dump` or `Export all` → commit to `data/snapshots/`
   for public history.

## 8. Frontend-saved vs cloud-saved — resolved (locked)

- **Source of truth:** Supabase `user_recordings` (cross-device via Google login).
- **Cache:** IndexedDB (keep current export/import path as offline buffer).
  On login, pull `user_recordings` → warm cache; on record while offline, queue → push on reconnect.
- **Logged-out:** sees login wall only. No scratch recording. Explicit copy:
  "Sign in to enter SignSpeak."

## 9. Costs / limits

Supabase free: 500 MB DB, 50k MAU, 1 GB storage, unlimited API calls within quota —
holds ~10k landmark recs. Vercel free: 100 GB bandwidth — 20 MB Interpret fetch × 5k visits = 100 GB,
so add pagination `?signId=&limit=` before demo day. Render free: sleeps;
use $7/mo Starter to avoid Whisper cold-start 60s+. No GitHub LFS needed.

## 10. Locked decisions (was §10 open questions)

1. Anonymous visitors see Record UI disabled or hidden? → **LOCKED: whole site gated.
   Logged-out sees `/login` only. Record UI hidden (route unreachable).**
2. Should admin `main` writes require second confirm? → **LOCKED: yes.
   `Publish to Everyone` modal per §5.4. Not a git push — Supabase INSERT with confirm.**
3. Avatar: user 1-hand custom vs main 2-hand golden? → **LOCKED: custom always wins (§5.1).
   Within main only: 2-hand > 1-hand > fingerspelling (§5.2).**
4. Interpreter: all reps searchable regardless of motion? → **LOCKED: yes.
   Union search, no motion exclusion; two-stage custom-first (§5.3).**
