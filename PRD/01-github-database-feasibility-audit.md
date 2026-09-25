# PRD 01 — READ-ONLY AUDIT: isl-interpreter — GitHub-as-Database Feasibility

> Date: 2026-09-24
> Scope: Complete directory read + `git pull origin main` (905e8db..80c8464 fast-forward, working tree clean).
> Constraint: No code changes made for this audit.

## 1. Architecture Map (verified)

**Frontend `vite + React 19` — `src/App.jsx:1`, `vite.config.js:1`**

```
src/pages/ HomePage / LandingPage / InterpretPage / RecordPage / TranslatePage / DeletePage
  -> components/ RecordingTool.jsx:26 | LiveInterpreter.jsx:33 | Avatar.jsx:55 | MediaInterpreter.jsx | ReviewFlagged.jsx
  -> lib/ recordingStorage.js:1 (API client) | recognizer.js:50 | dtw.js:129 | normalize.js:23
         | vocabulary.js:9 | customWords.js:21 | segmentation.js:39
  -> hooks/ usePoseHandTracker.js:4 | useHandLandmarker.js | useSignStream.js
  -> utils/ scrollTo.js
public/wasm/ (MediaPipe WASM) | public/avatar/human.glb | public/models/include_stgcn.onnx
```

**Backend `FastAPI` — `isl-backend/main.py:31`**

```
routers/database.py:122 /api/db/*   -> JSON file CRUD + gloss sync
routers/documents.py:55 /api/upload-doc  (PyMuPDF/docx -> T5 chunk queue)
routers/media.py:73 /api/process-youtube  (yt-dlp -> Whisper large-v3 -> chunks)
routers/text_input.py:24 /api/process-text
routers/stream.py:16 /ws/stream (WebSocket AI pipeline + backpressure, job_manager.py:1)
routers/pose_import.py:34 /api/import-poses
utils/ai_pipeline.py:21 (FLAN-T5 + gloss_poses lookup -> pose frames)
utils/splitter.py:44 | utils/job_manager.py:1
lifespan loads WhisperModel + FLAN-T5-base on CUDA int8_float16 : main.py:10
CORS allow_origins=["*"] : main.py:36
```

**Data flow**

`RecordingTool.jsx:277` captures raw `body + left_hand(21) + right_hand(21)` per frame
(2s @ ~30fps, avg 41 frames) -> `normalizeSequence()` shoulder-midpoint/scale
`normalize.js:23` -> `saveRecording()` POST `VITE_API_URL || http://localhost:8000/api/db`
`recordingStorage.js:1` -> `database.py:163 _add_recording_sync()` append +
`save_db()` atomic tmp->replace `database.py:149` +
`sync_golden_takes_to_gloss_db()` picks **longest per signId** -> writes `gloss_poses.json`.
`LiveInterpreter.jsx:68 loadTemplates()` GETs **all** recordings every session ->
`buildTemplateLibrary()` -> local DTW `dtw.js:129` with `maxFrames=18` downsample,
`bandFraction=0.2`, `fingertipWeighted 2.5x` -> `classifySequence()`.
Translate tab uses `gloss_poses.json` (one template per sign) +
`fingerspell_poses.json` via `ai_pipeline.py:44`.

**Current storage:** Flat JSON file, NOT a DB engine.

- `isl-backend/database/recordings.json` — **is tracked in git** (`git ls-files` shows it),
  343,307 bytes, **2 recordings** only (`hello:1, food:1`)
- `isl-backend/gloss_poses.json` 286,896 bytes (derived, not source-of-truth)
- `isl-backend/fingerspell_poses.json` 2 bytes
- `customWords` in `localStorage` `customWords.js:19` + synced from DB
  `syncCustomWordsWithDatabase():88`
- No `.env` / `VITE_API_URL` configured — defaults to `localhost:8000`
  -> not publicly accessible when frontend is hosted.

## 2. Recording Size — Measured (not guessed)

| Metric | 2-handed (current) | 1-handed (vocabulary is now 100% `twoHanded:false` `vocabulary.js:10`) |
|---|---|---|
| Pretty JSON `indent=2` (what `save_db():154` writes) | **~90,081 bytes** / rec | **~53,735 bytes** / rec |
| Compact JSON `separators=(',',':')` | ~77,892 | ~46,671 (42% smaller) |
| Frames / rec | 41 avg (min 41 max 41) | same |
| Landmarks / frame | `body 6 joints + 21+21 hand` = 48 points x 3 floats | body + 21 single hand |
| Frontend fetch cost per rec | same as file bytes — `getAllRecordings():13` returns full array over HTTP | same |

**Projections (pretty, 1-handed — current vocabulary):**

| Recordings | File size | Fits GitHub? | Fetch time (5 Mbps) | DTW classify estimate* |
|---|---|---|---|---|
| 75 (3/rep) | **12.3 MB** | YES | ~2s | ~14 ms |
| 100 | **16.4 MB** | YES | ~2.6s | ~19 ms |
| 200 | **32.7 MB** | YES | ~5s | ~38 ms |
| 375 = 25x15 target | **19.2 MB** 1-hand / **33 MB** 2-hand | YES | 3-5s | ~71 ms |
| 500 | **25.6 MB / 22.3 compact** | YES | 4-7s | ~94 ms |
| 1000 | **51.3 MB / 44.5 compact** | EXCEEDS 50 MB warn | 8-14s | ~189 ms |
| 1951 | **100 MB** | HARD REJECT | — | — |
| 2000 | **105 MB / 89 compact** | NO | — | 377 ms |
| 5000 | 263 MB | NO | — | >1s lag |

*DTW scales linearly: `evaluate.mjs` measured 50 ms for 265 templates after downsample;
`recognizer.js:69` merges both hand buckets so cost = N.

Git history evidence:

- `71d4ae5`: 2 recs, 411,302 chars
- `47fd699`: 4 recs, 735,730 chars
- `905e8db`: 2 recs, 327,297 chars
- current: 2 recs, 343,307 bytes

## 3. GitHub-as-Database Feasibility

**GitHub hard limits:** single file **100 MB hard block**, **50 MB warning** (UI refuses push),
repo **5 GB soft / 10,000 warnings / 100 GB hard**, LFS free **1 GB storage + 1 GB bandwidth/mo**.

**Verdict: Technically feasible for 100-200 recordings, but architecturally wrong for CRUD cloud.**

| Question | Answer |
|---|---|
| Can you `git push` 100-200 recordings today? | **Yes.** 100 -> 16 MB, 200 -> 33 MB — well under 100 MB. `recordingStorage.js` would need a rewrite to `fetch("https://raw.githubusercontent.com/KingDev4522/Alfredo/main/isl-backend/database/recordings.json")` for reads. |
| Can you do **Create/Update/Delete at runtime** via GitHub? | **No clean way.** Requires GitHub Contents API `PUT` with PAT + SHA + base64 + commit message per write. Latency 1-3s + CI deploy + CDN cache (raw.githubusercontent caches ~5 min). **Exposes token to browser if done frontend-only (critical security flaw).** No atomic multi-writer lock — `database.py:129 db_lock` is lost; concurrent pushes = merge conflicts. History bloat: every `Keep` adds full file to git history forever. |
| Can everyone see it anytime after frontend is hosted? | Read yes (raw URL is public). Write no, unless you build a proxy backend anyway — which defeats the purpose. |
| Can frontend just bundle `recordings.json`? | If you `import recordings from '../isl-backend/database/recordings.json'` Vite will inline it into the JS bundle — 33 MB bundle = **instant frontend weight disaster**, no lazy load, no CRUD. Current code correctly fetches at runtime via `recordingStorage.js:13`. |
| Repo size drift? | Current `isl-backend/database/recordings.json` + `gloss_poses.json` already change on every recording (`git status` will always show dirty). Past log `71d4ae5..905e8db` shows churn 20k-39k lines per commit. |

**Read works, write doesn't — GitHub is a versioned file store, not a database.**

## 4. What You Actually Need (Cloud CRUD, Huge Limit)

Keep the **existing `recordingStorage.js` API contract** — just swap the server.
Minimal code change: set `VITE_API_URL` to a hosted backend.

**Option A — Keep FastAPI `database.py:131 load_db/save_db` (smallest migration, recommended for demo):**

Host `isl-backend` on **Render / Fly.io / Railway** (free tier + $5/mo persistent disk or mount S3/R2).
File stays JSON but on a real server with `db_lock`. Frontend sets
`VITE_API_URL=https://your-api.onrender.com/api/db`.
Pros: zero frontend rewrite, keeps `gloss_poses` sync.
Cons: disk ephemeral on serverless — must attach volume or move JSON to `S3/R2`.

**Option B — Proper managed DB (scales to 10k+ recordings, pennies):**

| Service | Free tier | Change required |
|---|---|---|
| **Supabase Postgres** (recommended) | 500 MB DB, 50k MAU, REST+Realtime+RLS — store `frames JSONB` | Replace `load_db/save_db` with `supabase-py`, or replace `recordingStorage.js` with direct Supabase client. ~30 lines. |
| **Firebase Firestore** | 1 GB, 50k reads / 20k writes/day | Similar, best for multi-user realtime |
| **Turso (SQLite edge) / Cloudflare D1** | generous free, <10 ms global | Keep `database.py` but swap file for libSQL |
| **MongoDB Atlas M0** | 512 MB | Use Motor, frames as document |
| **R2 / S3 + tiny API** | 10 GB free on R2, $0.015/GB after | Store each recording as object `{signId}/{uuid}.json` — unlimited, cheapest for blobs |

**Option C — GitHub as snapshot backup (hybrid, good practice):**

Keep live DB on cloud (A or B), add nightly `Export all recordings (.json)`
`RecordingTool.jsx:695` commit to `data/snapshots/isl-recordings-export-YYYY-MM-DD.json`
via GitHub Action — gives you public versioned history without making GitHub the live write path.
You already track `isl-backend/uvicorn.log` (should be gitignored) — add
`database/recordings.json` to `.gitignore:12` after moving to cloud to avoid accidental 100 MB push.

## 5. Immediate Action (No Code Change Audit Recommendation)

1. **For 100-200 demo recordings next week: GitHub raw read is okay as throwaway.**
   Expect `RecordPage` load to fetch 16-33 MB on every `InterpretPage:68` open;
   mobile on 3G will stutter. Writes will not propagate until you
   `git add && commit && push` manually — not multi-user.
2. **For production / team / "anyone can add/delete via case ID": You MUST host the backend
   or use Supabase/Firebase.** Set `VITE_API_URL` env at build time to the hosted URL —
   `recordingStorage.js:1` already honors it. Migrate `database.py:131` to `JSONB` or R2;
   keep `api/db/import` `POST /import:236` for bulk.
3. **Fix now even before migration:** add `isl-backend/database/recordings.json` and
   `isl-backend/gloss_poses.json` and `isl-backend/*.log` to `.gitignore`,
   compact JSON (`separators=(',',':')`) would halve bandwidth, add pagination
   `GET /recordings?signId=hello&limit=50` to avoid loading all 375 at once for `LiveInterpreter`.

## 6. Amendment 2026-09-24 — locked decisions (see PRD 02 v2)

- Decision: live DB is **Supabase Postgres**, not GitHub. GitHub keeps only nightly snapshots.
- Decision: whole site is **login-gated** — anonymous visitors see only login, Record UI is hidden.
- Decision: admin writes to main require **double-confirm Publish** modal (not `git push`).
- Decision: custom user recordings **always outrank main**; inside main, avatar prefers **2-hand > 1-hand**;
  interpreter searches **all templates** (no motion-based exclusion).
