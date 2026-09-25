# PRD 04 — Live Server Verification: SQL Status, Backend, Frontend

> Date: 2026-09-24
> Scope: verify Step 1 (SQL run) against live Supabase + boot-check backend/frontend on localhost.
> Method: REST probes with anon key (values never printed), `curl` health checks, process inspection.
> Code changes: none. `npm run build` green on current tree (prior commit `2a79612`).

## 1. Verdicts (one line each)

| # | Check | Verdict | Evidence |
|---|---|---|---|
| 1 | Step 1 SQL landed in project `qyvwtfpeaokmdqpuqegx` | **NOT OCCURRED — tables absent** | REST `503 PGRST002 schema-cache` on all 4 tables (see §2) |
| 2 | Backend (FastAPI, localhost:8000) | **RUNNING, ours, healthy** | `GET /` → `{"message":"ISL Interpreter Backend API is running."}`; `GET /api/db/recordings` → 200, 2 recordings |
| 3 | Frontend (Vite, localhost:5173) | **RUNNING, ours, but STALE — restart required** | Serves ISL title + `/src/main.jsx`; processes predate `.env.local` + latest push |
| 4 | Whisper large-v3 / T5 pipeline | **LOADED, working locally** | `uvicorn.err.log:8-9` startup complete; `uvicorn.log:3-4` Whisper loaded, device `cpu`; T5 `282/282` shards |

## 2. SQL verification detail (the red item)

Probe (Node, key names only, anon key from gitignored `.env.local`):

```
profiles         -> HTTP 503 :: {"code":"PGRST002","message":"Could not query the database for the schema cache..."}
main_recordings  -> HTTP 503 :: (same)
user_recordings  -> HTTP 503 :: (same)
custom_words     -> HTTP 503 :: (same)
```

Control probe `GET /auth/v1/health` → **200**, so project + key are valid; only the tables are missing.
The file itself was re-read and confirmed intact (`supabase/migrations/001_schema.sql`, 93 lines,
all statements idempotent). Conclusion: the Run did not land in this project.
Checklist given to owner: (a) browser URL must contain ref `qyvwtfpeaokmdqpuqegx`,
(b) editor bar must read green `Success. No rows returned` — any red, screenshot it,
(c) Table Editor must list the four tables. Until the probe returns `200 []`,
the app stays on the legacy localhost JSON fallback by design — no data loss path exists.

## 3. Backend verification detail (green)

- Processes: `python` PIDs alive since 11:07 AM; `curl localhost:8000/` → `http-code:200`.
- `GET /api/db/recordings` → 200 with **2 recordings** (`hello:1, food:1`), matching
  `isl-backend/database/recordings.json` (343,307 bytes). Legacy path intact.
- Model state per logs: Whisper `large-v3` via `faster-whisper` loaded (`main.py:18`
  `WhisperModel("large-v3", ...)`), FLAN-T5-base weights fully loaded, server on
  `127.0.0.1:8000`, `device: cpu` (int8). Weights on disk `isl-backend/weights/` ≈ 2.79 GB.
- No action required. Leave the terminal running.

## 4. Frontend verification detail (green, one restart owed)

- `curl localhost:5173/` returns our Vite dev shell (`@vite/client`, `/src/main.jsx`,
  `<title>ISL Interpreter — Phase 1</title>`).
- Problem: `node` worker processes date from ~10:43–11:07 AM, **before** `.env.local`
  (Supabase URL/key) and before today's push (`1d9ec4d` Auth/gating, `2a79612` admin-default).
  Vite hot-reloads code but never hot-reloads env vars, so this instance cannot see Supabase.
- Required action (owner, 30 s): in the frontend terminal `Ctrl+C`, `npm run dev`,
  hard-refresh the browser. Expected after restart: `/login` wall → Continue with Google →
  gated site with AuthProvider/RequireAuth active. (Localhost JSON fallback still serves
  recordings until §2 turns green.)

## 5. What is left (ordered, owner actions)

1. Re-run Step 1 SQL in the correct project; reply "ran it" for instant re-probe.
2. Restart vite (see §4).
3. First Google login as `debjeetmazumder3232@gmail.com`; flag admin:
   `update profiles set is_admin = true where email = 'debjeetmazumder3232@gmail.com';`
   then sign out/in (ADMIN badge).
4. Enable Google provider (needs Google Cloud client ID/secret) so other accounts can sign in.
5. Record Main reps via Publish flow; verify from a second Gmail (shared visible, customs isolated).
6. Optional later: Vercel deploy + redirect URL; FastAPI Docker/Render; nightly snapshot Action.

## 7. Addendum — tables confirmed in schema diagram, API cache is the fault

Owner provided the Supabase schema diagram: `main_recordings`, `user_recordings`,
`profiles` (→ `auth.users.id`), `custom_words` all exist with the exact columns/keys
from `001_schema.sql`. The SQL run was therefore correct and error-free.

Re-probe immediately after (same anon key, same project): all four tables still
`503 PGRST002 schema-cache`. Verdict revised: **tables exist; PostgREST's schema cache
has not reloaded**, so the REST API cannot see them yet. This is a known Supabase
stuck-cache state, not a missing-table state.

Fix prescribed (owner action, SQL Editor, 1 min): run `NOTIFY pgrst, 'reload schema';`,
wait ~30–60 s, then ask for a re-probe (expect `200 []`). If 503 persists: check
Settings → API → Exposed schemas includes `public`; else pause/unpause the project
(forces PostgREST restart) or contact Supabase support. App behavior unchanged meanwhile:
localhost JSON fallback serves recordings; Supabase path activates on first `200`.

## 8. Resolution — API green (re-probe)

Re-probe after owner ran the reload: `profiles`, `main_recordings`, `user_recordings` →
**HTTP 200 `[]`**; `custom_words` → first `400 column custom_words.id does not exist`
(probe artifact: that table's PK is `(owner_id, word_id)`, it has no `id` column),
re-probed with `select=owner_id,word_id` → **HTTP 200 `[]`**. All four tables live and
queryable. App Supabase path is active from this point; localhost file remains as
dual-storage second copy (PRD 05).

## 6. Files of record

- Schema executed by owner: `supabase/migrations/001_schema.sql`
- This report: `PRD/04-server-verification-sql-status.md`
- Prior: `PRD/01-github-database-feasibility-audit.md`,
  `PRD/02-supabase-auth-main-vs-user-prd.md`,
  `PRD/03-supabase-verification-whisper-readiness.md`
- Implementation: commits `1d9ec4d` (Auth + isolation), `2a79612` (admin-default Main).
- Never committed: `.env.local` (gitignored), anon key, passwords.
