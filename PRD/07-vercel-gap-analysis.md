# PRD 07 — Vercel Frontend vs Local Backend: Gap Analysis, Routing, Buttons, Connections

> Date: 2026-09-24
> Question answered: what does the newly deployed Vercel frontend lack relative to the
> local setup, what must be added, how everything routes and connects.
> Method: `git pull` (Already up to date, tree clean), repo-wide grep for
> `LandingPage` / `isAdmin|useAuth` / secrets, live endpoint checks from prior turns.
> Secrets scan: `sbp_*` and the anon JWT appear in **zero** repo files. `.env.local` gitignored.

## 1. Connection map (as deployed today)

```
Browser (anywhere)
 ├─ https://alfredo-seven.vercel.app/            200, static build
 ├─ → Supabase (Auth + main/user/words, RLS)      tables 200, all empty
 └─ → http://localhost:8000 (FastAPI)             ONLY resolvable on the owner's laptop
      ├─ /api/db/*        file JSON (2 rows: hello, food)
      └─ /ws/stream, /api/process-*   Whisper large-v3 + T5 (loaded, device cpu)
```

Same-machine rule (verified reasoning, loopback exempt from mixed-content blocking):
on the owner's laptop the Vercel page reaches the local backend directly. Anywhere else,
Translate/media calls fail while Supabase features (login, Main/User recordings, Publish,
Interpret) work for every visitor. Permanent public-backend options: Cloudflare Tunnel
(free, laptop must stay on), LAN-IP mode (same WiFi), Render/Fly hosting ($, heavy).

## 2. Route map (verified in `src/App.jsx:26-34`)

| Route | Element | Gate | State |
|---|---|---|---|
| `/login` | `LoginPage.jsx` (Google button + missing-env warning, site theme) | public | ✅ present |
| `/` | `HomePage.jsx` | `RequireAuth` | ✅ present (4dcde4b moved Home here) |
| `/home` | → redirects `/` | — | ✅ present |
| `/interpret` | `InterpretPage` → `LiveInterpreter` (merged lib, custom-first §5.3) | `RequireAuth` | ✅ present |
| `/translate` | `TranslatePage` → `MediaInterpreter` (env URLs, JWT-ready backend pending) | `RequireAuth` | ✅ present, gaps §3.3 |
| `/record` | `RecordPage` → `RecordingTool` (Main/My Space toggle, Publish modal, Sync button) | `RequireAuth` | ✅ present |
| `/delete` | `DeletePage` → `ReviewFlagged` (merged list, surgical delete) | `RequireAuth` | ✅ present, gaps §3.4 |
| `*` | → `/` | — | ✅ present |

## 3. Gap list (what the Vercel build lacks vs what the local pipeline assumes)

### 3.1 Config gaps (no code, dashboard only)
1. **Vercel env vars unset (assumed — cannot inspect from here).** Without the five
   `VITE_*` vars baked at build time, the deployed app silently runs legacy-localhost mode:
   no login wall enforcement details, no Supabase. Fix: set vars → **Redeploy** (build-time bake).
2. **Google provider still `false`** (last Management API read). Google button inert for visitors
   until owner enables it with a Google Cloud client ID/secret. Fallback: email magic-link (on).
3. **`SITE_URL`/redirects: DONE** (`site_url=https://alfredo-seven.vercel.app`,
   allow-list includes Vercel + both localhost ports, verified by re-GET).
4. **Admin flag: not set** (0 `profiles` rows — nobody has logged in yet). First login as
   `debjeetmazumder3232@gmail.com` → run the flag UPDATE → sign out/in.

### 3.2 Routing/content gaps
5. **`LandingPage.jsx` orphaned** — exported, referenced nowhere (grep: 1 match, its own file).
   Since `/` → HomePage, either delete it or re-mount (e.g. public preview route). REQUIRED: decide;
   RECOMMENDED: delete to avoid dead code in the bundle.
6. **No public demo route.** Whole site gated by design (PRD 02 v2 §2) — anonymous visitors see
   only `/login`. If judges need a no-login peek, add explicit `?demo=1` read-only route. NOT required now.

### 3.3 Component gaps (backend-assumed, frontend-missing)
7. **Dictionary Import not admin-gated.** `MediaInterpreter.jsx` renders Import Dictionary to
   everyone and `POST /api/import-poses` has no auth; no `useAuth` in the file (verified by grep).
   REQUIRED before untrusted users arrive: hide unless `isAdmin` + enforce server-side (or remove
   the button and keep imports dashboard-side). Risk today: low (only the owner uses it) but real.
8. **Avatar gloss reads the local file, not Supabase.** `ai_pipeline.py` + `gloss_poses.json`
   derive from `recordings.json`. The dual-write (PRD 05) feeds this only when the backend is up
   at Publish time. If published while backend down, avatar misses the sign until re-sync.
   REQUIRED eventually: reverse pull (Main→file/gloss, ~20 lines) or backend Supabase read.
   Workaround today: publish/sync while backend runs.
9. **`ReviewFlagged.jsx` has no Main|Mine toggle** (no `useAuth` in file; PRD 02 §5.5 specified it).
   It lists the merged library and `deleteRecording` tries mine-then-main (RLS blocks illegal
   deletes, so safe but confusing). REQUIRED for admin hygiene: add the segmented control.

### 3.4 Buttons inventory (what exists, where)
- Navbar: email + ADMIN badge + Sign out (logged in); Start interpreting CTA; backend status dot
  (now env-driven `API_BASE_URL`). Login entry = forced `/login` redirect (no extra button needed).
- LoginPage: Continue with Google (+ env-missing warning). Email+password form: NOT built
  (only if owner requests it; no password exists anywhere — verified zero `admin123` hits).
- Record: Start Recording, Keep / Publish to Everyone (admin), Discard & Retry, Replay,
  My Space/Shared Main toggle (admin), Sync localhost file → Main (admin), Export/Import/Clear.
- Interpret: Speak Now, Clear, Reload recordings, Auto-sentences toggle, Copy/Clear transcript.
- Translate: YouTube/Text/File submits, mic dictation, Import Dictionary (see gap 7).
- Delete: Load recordings, per-row Replay + Delete this recording.

### 3.5 Backend gaps (local, unchanged scope)
- Binds `127.0.0.1:8000` — correct for same-machine + tunnel; LAN mode needs `--host 0.0.0.0`.
- CORS `*` (fine for tunnel/Vercel; tighten to the Vercel origin when public).
- `database.py` landmark routes have no auth — acceptable while local-only; MUST gate or retire
  before any public hosting (Supabase RLS is the auth layer for cloud data).

## 4. Recording flow verdict (reconfirmed)

Local `npm run dev` (restarted post-`.env.local`) + logged-in admin + flag + backend up ⇒
Publish writes Supabase Main AND the GitHub-tracked file in one object; others write own space
only. Preconditions from the prior turn still exact; nothing regressed (build green at merge).

## 5. Action order (owner)

1. Vercel env ×5 → Redeploy. 2. Google provider enable. 3. First login → admin flag.
4. Restart local vite. 5. Record Main (dual-write). 6. Later: gaps 5/7/8/9 + tunnel-or-host decision.
