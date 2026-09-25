# PRD 03 — Supabase Verification, Admin Model, Whisper Audit, Recording Readiness

> Date: 2026-09-24
> Project ref: `qyvwtfpeaokmdqpuqegx` (`https://qyvwtfpeaokmdqpuqegx.supabase.co`)
> Status: verification done live. Code pushed in `1d9ec4d`. Tables NOT yet created (SQL pending).

## 1. What was verified today (with evidence)

### 1.1 Supabase SDK + env — PASS
- `npm list @supabase/supabase-js` → `2.117.1` installed (`package.json`).
- `.env.local` exists with all 5 keys set (names only checked, values never printed):
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, `VITE_API_BASE`, `VITE_WS_URL`.
- `.env.local` is gitignored (`.gitignore:6`), `.env.example` is committed as template.
- Live probe: `GET /auth/v1/health` with real key → **HTTP 200** (project reachable, anon key valid).
- Live probe: `GET /rest/v1/{profiles,main_recordings,user_recordings,custom_words}` →
  **HTTP 503 `PGRST002` schema-cache** on all four = **tables do not exist yet**.
  Conclusion: connection works; `supabase/migrations/001_schema.sql` has NOT been run.
  Until it is run, the app uses the legacy localhost FastAPI JSON fallback (§5).

### 1.2 Hardcoded credentials — NONE (proven)
- Grep `password|passwd|admin123|hardcode.*(pass|email|admin)` over `src/` → **no files found**.
- Grep `@gmail.com|is_admin = true|ADMIN_EMAIL` over repo → only hits are:
  `supabase/migrations/001_schema.sql:4` comment placeholder `'you@gmail.com'`,
  RLS `is_admin` checks, and PRD docs. **No real email, no password anywhere.**
- Admin model: **no password exists.** Admin = any Google account whose
  `profiles.is_admin` is `true`. Set once via SQL after first login (§4.2).
  Enforcement is Postgres RLS, not client string compare.

### 1.3 Login theme + routing — PASS
- `src/pages/LoginPage.jsx` (new): same dark theme as site (`#050505`, `#2DE2E6` eyebrow,
  `Space Grotesk` headline, pill button). Single `Continue with Google` button + missing-env warning.
- `src/components/RequireAuth.jsx` (new): all routes except `/login` redirect when logged out.
  Dev hatch: passes through when Supabase env is absent so localhost never bricks.
- `src/App.jsx:27-34`: `/login` public; `/`, `/home`, `/interpret`, `/translate`, `/record`,
  `/delete` all wrapped. `*` → `/`.
- Decision on your "homepage → landing page" suggestion: **kept both, gated both.**
  `/` = `LandingPage` (marketing front door), `/home` = `HomePage` (studio dashboard).
  After login → `/home`. No separate signup page — Google OAuth is signup+login in one click;
  first sign-in auto-creates `profiles` row (`useAuth.jsx:ensureProfile`). No extra buttons needed:
  Navbar shows email + ADMIN badge + Sign out when logged in; login wall handles the rest.

### 1.4 Pollution isolation — holds by construction (pending SQL)
- Writes: `saveRecording(rec, 'main'|'mine')` → `main_recordings` (admin JWT only) vs
  `user_recordings` (`owner_id = auth.uid()`). RLS: user rows filtered by `auth.uid() = owner_id`;
  main writes rejected for non-admins at the DB layer.
- Reads: interpreter builds `buildMergedLibrary(main, mine)` — your rows + shared rows only.
  Another account's custom rows are never queried (and RLS would reject even a crafted query).
- Custom storage: **Supabase `user_recordings` is source of truth** (cross-device via Google login);
  IndexedDB/export JSON remains as offline cache only. Nothing personal touches `main`,
  nothing shared is filtered out of your view.

### 1.5 Whisper large-v3 pipeline — WORKS LOCALLY (evidence)
- `isl-backend/uvicorn.err.log:8-9`: `Application startup complete. Uvicorn running on
  http://127.0.0.1:8000`. `uvicorn.log:3-4`: `WhisperModel loaded successfully`,
  device `cpu`. FLAN-T5 weights: `282/282` shards loaded.
- Today: `curl localhost:8000/` → **HTTP 200** (backend currently up).
- Weights on disk `isl-backend/weights/` total **~2.79 GB**:
  `gloss_to_pose/transformer-model-100000-steps.tar.gz` (~1.3 GB),
  `sign_to_text/model_best.pth` (~1.4 GB), `include_stgcn/checkpoint.ckpt` (~353 MB).
  Faster-Whisper `large-v3` (~3 GB, int8) downloads to HF cache on first `lifespan` run
  (`main.py:18`), then reuses. Torch installer wheel in repo root is 2.4 GB (not runtime).
- What it does per request: `media.py:46 transcribe_audio` (yt-dlp audio → Whisper translate) →
  `splitter.py:44` chunk → `stream.py:53 translate_and_generate_poses` (T5 gloss → pose frames).
  So yes, it loads and does real work — TTS/avatar path depends on it.
- Render fit: **possible but heavy.** Needs Docker (python + ffmpeg + yt-dlp binaries),
  ≥4 GB RAM, persistent model cache (else 3 GB re-download per cold start), 60s+ cold start on
  free tier, ~$7-25/mo Starter/Standard. Int8 CPU inference works (proven by `device: cpu`
  log) but slow. Recommendation stands: keep FastAPI on localhost for now; host only when
  Translate-tab uptime is required. Nothing in the Supabase recordings flow needs it.

## 2. Where exactly each byte lives (Supabase map)

| Data | Supabase location | Not in | Notes |
|---|---|---|---|
| Google identity | `auth.users` (managed) | code, GitHub | Enable Google provider once (§4.3). |
| Admin flag | `profiles.is_admin` | frontend | One SQL update per admin email (§4.2). |
| Main golden signs | `main_recordings.frames JSONB` | `recordings.json` live path, bundles | Read by all; admin-write only. |
| Your custom signs | `user_recordings.frames JSONB` + `owner_id` | `main_recordings`, others' views | Same Google login = same rows on any device. |
| Word labels | `custom_words` | localStorage only (now write-through cache) | |
| Nightly backup | GitHub `data/snapshots/` (future Action) | live reads | |
| Secrets | `.env.local` (ignored) + Vercel env | git | Anon key is public-safe; service_role key never created/needed. |

## 3. Recording readiness — YES, after 3 one-time steps (then safe, no rework)

You can start recording the Main DB from localhost and have any account consume it,
**without hosting the frontend**, once §4.1–4.3 are done (10–15 min). Recordings are then
safe: Postgres-persisted, RLS-guarded, per-account isolated, exportable via
`Export all recordings (.json)` any time. Schema changes later (if ever) would be additive;
recorded `frames` JSON needs no migration.

## 4. Elaborate how-tos (the three steps you asked about)

### 4.1 "Run the SQL" — what and why, click by click
Why: your Supabase project is empty (proven §1.1 — 503 on all tables). The app's tables
+ anti-pollution RLS rules exist only as a file so far: `supabase/migrations/001_schema.sql`.
Running it creates `profiles`, `main_recordings`, `user_recordings`, `custom_words` + policies.
1. Open `supabase.com` → your project `qyvwtfpeaokmdqpuqegx` → left sidebar **SQL Editor**.
2. Click **New query**, open local file `supabase/migrations/001_schema.sql`, paste all, **Run**.
3. Verify: **Table Editor** should now list the four tables. Re-run the probe from §1.1 mentally:
   REST should return `200 []` instead of 503. No code change needed — the app switches from
   localhost-file fallback to Supabase automatically once tables respond.

### 4.2 "Reply with one admin gmail" — what it means
There is no admin password to invent. Flow:
1. `npm run dev`, open `http://localhost:5173`, **Continue with Google** using the Gmail you
   want as admin. This creates `auth.users` + `profiles` row (`is_admin=false` initially).
2. In Supabase → **Table Editor → profiles**, find your email, or SQL Editor → run:
   `update profiles set is_admin = true where email = 'YOUR@gmail.com';`
3. Sign out/in once. Navbar shows **ADMIN** badge; Record shows `Save to: [My Space | Shared Main]`.
So "reply with one admin gmail" = just tell me (or keep private and run the SQL yourself) which
Gmail gets the flag. I hardcode nothing — the flag lives in your database.

### 4.3 "Enable Google" — what it means
Supabase Auth supports Google, but Google must authorize Supabase as an OAuth client:
1. Supabase → **Authentication → Providers → Google** → enable.
2. It asks for a Google Cloud **Client ID + Secret**: create at `console.cloud.google.com` →
   APIs & Services → Credentials → OAuth client (Web) → authorized redirect URI =
   `https://qyvwtfpeaokmdqpuqegx.supabase.co/auth/v1/callback` → paste ID/secret back.
3. Supabase → **Authentication → URL Configuration**: Site URL = `http://localhost:5173` for now;
   after `vercel deploy`, add `https://<your>.vercel.app` to **Redirect URLs** (that is the
   "paste the Vercel URL back" step you described). Until then, Google login works on localhost
   only; email magic-link works as fallback with zero setup.

### 4.4 Vercel frontend hosting (when ready — optional for recording)
`vercel.com → Add New → import KingDev4522/Alfredo → framework Vite → env vars`
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL=http://localhost:8000/api/db`,
`VITE_WS_URL=ws://localhost:8000/ws/stream`) → Deploy. Then do §4.3 step 3 redirect.
Caveat (accepted scope): Translate/media tabs need your localhost FastAPI, so they work only
for you locally; Record/Interpret/Delete via Supabase work for every Vercel visitor.

## 5. Deltas shipped in `1d9ec4d` (recap)
Auth (`useAuth.jsx`, `LoginPage.jsx`, `RequireAuth.jsx`, `supabaseClient.js`),
gated routes (`App.jsx`), email+ADMIN Navbar, Supabase-first `recordingStorage.js`
(`getMainRecordings/getMyRecordings/saveRecording(target)/getCountsSplit`) with localhost
fallback, cloud-mirrored `customWords.js`, `libraryMerge.js`
(two-stage custom-first + `pickAvatarGolden` user > main-2hand > main-1hand),
`RecordingTool.jsx` (My Space/Shared Main toggle, `PublishModal.jsx` type-PUBLISH confirm,
`shared + yours` counts), `LiveInterpreter.jsx` (merged library), env-driven URLs
(`MediaInterpreter.jsx`, `useSignStream.js`), `.env.example`, `001_schema.sql`.

## 6. What is left (owner actions only — no code gaps)
1. Run §4.1 SQL (5 min). 2. First Google login + §4.2 admin flag (5 min).
3. §4.3 Google provider (10 min, needs Google Cloud console).
4. Record Main reps as admin (Publish flow), verify from a second Google account
   (sees shared, own space empty). 5. Optional: Vercel deploy + redirect URL (§4.4).
6. Optional later: FastAPI Docker/Render (§1.5) + nightly snapshot Action.
