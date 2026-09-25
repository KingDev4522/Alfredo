# PRD 05 — Dual Storage: GitHub-Tracked File + Supabase, Same Format, Both Ways Open

> Date: 2026-09-24
> Decision (owner-locked): Main recordings live in BOTH places. Nothing is gitignored.
> Status: implemented, build green, pushed.

## 1. The rule

- `isl-backend/database/recordings.json` **stays tracked in git. It is NOT in `.gitignore`
  and must never be added there.** Verified: `.gitignore` contains no `recordings`/`gloss` entry.
- Every admin Publish writes the **same payload object** to Supabase `main_recordings`
  AND the localhost file, in the identical app format
  `{ signId, recordedBy, conditionLabel, handCount, frames, recordedAt }`
  (Supabase maps it 1:1 to `sign_id, recorded_by, condition_label, hand_count, frames`).
- Personal (`My Space`) recordings stay Supabase-only (plus legacy fallback while unconfigured).

## 2. The two directions (both open)

**A. Recording now (Supabase API blind) → safe in file → later to Supabase.**
Record as usual; with the API down, `saveRecording` falls back to the localhost file,
which is git-committed as before. When the API turns green, admin presses
**Sync localhost file → Main** (`RecordingTool.jsx:handleSyncFileToMain` →
`syncLegacyFileToMain()` in `recordingStorage.js`): reads the whole file, inserts every
valid recording into `main_recordings` in chunks of 20 (admin JWT, RLS-enforced).
Run once per batch — repeats duplicate. File import also honors the admin target:
importing while `Save to: Shared Main` lands in Main (with confirm).

**B. Recording once Supabase is online → both stores at once.**
`confirmPublishToMain()` dual-writes: Supabase insert first (source of truth), then
best-effort `saveToLegacyFile()` with the same object. If the backend is offline the
Supabase copy is still safe and the message says so; sync the file later via export/import.
`git add/commit/push` of `recordings.json` remains the owner's manual step for GitHub sharing.

## 3. Files changed (this increment)

- `src/lib/recordingStorage.js`: added `saveToLegacyFile()`, `syncLegacyFileToMain()`.
- `src/components/RecordingTool.jsx`: dual-write in `confirmPublishToMain()`,
  `handleSyncFileToMain()` + admin **Sync localhost file → Main** button,
  import honors `saveTarget` for admins, admin target auto-defaults Main (prior commit).
- `.gitignore`: deliberately untouched (recordings stay tracked).
- Commits: `2a79612` (admin-default), this push (dual-storage + PRD 05).

## 4. State kept in mind

- Remote `main` was `Already up to date` on pull — no foreign changes to reconcile.
- Supabase API still `503 schema-cache` at last probe; tables confirmed present in diagram.
  Pending owner action remains: `NOTIFY pgrst, 'reload schema'` → re-probe → admin flag →
  Google provider → record.

## 5. Dual-delete semantics (delete-trace fixes)

- `deleteRecording(id)`: deletes from BOTH Supabase tables (RLS permits only the legal one),
  requires ≥1 row actually removed (else throws "not yours and not admin" — fixes a silent
  no-op where Main deletes previously succeeded-without-effect), then best-effort mirrors
  into the file by (signId + batch + hand + frame-length) match, Main deletions only
  (a personal delete must never touch shared file goldens).
- `deleteRecordingsForSign(signId, target)`: mirrors to file ONLY for `target=main`;
  Record-page clear button now passes the admin target with scope-correct confirms.
- `clearAllRecordings()`: under Supabase it wipes only YOUR space (never Main, never file);
  confirm text states the scope. Legacy unconfigured mode keeps whole-file wipe.
- `ReviewFlagged` surfaces delete errors and file-mirror counts instead of assuming success.
