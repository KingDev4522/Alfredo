# PRD 08 — Button-by-Button Audit (37 buttons, all traced)

> Date: 2026-09-24
> Method: repo-wide `<button` census (37) + `onClick` pairing (31 single-line + 6 verified
> multi-line submits) + live backend OpenAPI route check. No clicks executed headless;
> browser-only APIs (camera, speech, mic, clipboard) are code-guarded, need owner Chrome run.
> Status: all wired. No dead buttons. Two pre-existing caveats (Vercel envs, Google provider).

## 1. Backend routes buttons depend on — all live (`/openapi.json` 200)

`GET /`, `GET+POST /api/db/recordings`, `POST /api/db/import`,
`DELETE /api/db/recordings/all`, `DELETE .../sign/{sign_id}`, `DELETE .../{id}`,
`POST /api/import-poses`, `/api/process-text`, `/api/process-youtube`, `/api/upload-doc`
(+ `ws/stream` websocket in code). Every fetch URL in the app matches one of these.

## 2. Verdict table

| # | Location | Button | Handler → downstream | Verdict |
|---|---|---|---|---|
| 1-2 | RecordPage | Start Recording CTA, Camera test toggle | `scrollToId` / `setShowCameraTest` | ✅ |
| 3 | LoginPage | Continue with Google | `signInWithGoogle` → Supabase OAuth | ✅ code; needs Google provider on for visitors |
| 4-6 | Landing/Interpret/Home | scroll CTAs | `scrollToId` | ✅ |
| 7 | Navbar | Sign out | `signOut` → `/login` | ✅ |
| 8-20 | RecordingTool (13) | Start, My Space/Shared Main, Add/Remove word, Replay, Keep/Publish, Discard, Export, Import, Sync→Main, Clear sign/all, picker | verified paths incl. dual-write/sync/mirror, scoped confirms | ✅ |
| 21-22 | PublishModal | Cancel, Publish (gated on typing PUBLISH) | props → `confirmPublishToMain` | ✅ |
| 23-28 | LiveInterpreter (6) | Copy All, Clear transcript, Auto-sentences, Speak Now, Clear, Reload | clipboard-guarded, speechSynthesis, `loadTemplates` merged lib | ✅ |
| 29-33 | MediaInterpreter (5) | Import Dictionary, YT Translate, mic, Text Translate, Process | env URLs, `toggleListening` guarded | ✅ works; Import not admin-gated (PRD 07 gap 7) |
| 34-36 | ReviewFlagged (3) | Load recordings, Replay, Delete | merged list, error-surfaced dual-delete | ✅ |
| 37 | Navbar CTA | Start interpreting | route `/interpret` | ✅ |

## 3. Cannot-verify-from-here list (owner's Chrome run)

- Camera/mic/speech/clipboard actual behavior (all have error states in code).
- Vercel env vars baked into the deployed build (dashboard-only visibility).
- Google button end-to-end (provider still off at last Management API read).
