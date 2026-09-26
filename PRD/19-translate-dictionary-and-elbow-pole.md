# PRD 19 — Translate Dictionary Lifecycle + Recorded-Elbow Pole

> Date: 2026-09-26. Status: IMPLEMENTED in working tree (not committed).
> Scope: Translate tab / avatar ONLY. Interpreter matching does not change.
> Audience: team members. Simple English. Read point by point.
> Parent docs: PRD 13 (avatar pose), PRD 16 (arm IK), PRD 18 (recording flag;
> its §14 log points here for avatar items).

## 1. Goal in one line

1. Translate always plays the newest recording of each sign, with elbows that
   follow the recording — and no stale file can ever override new takes.

## 2. The elbow regression and its fix

1. The old build's `solveArmIK(shoulder, elbowTarget, wristTarget, ...)` bent
   the elbow toward the RECORDED elbow (orthogonalised pole). Reference:
   `Downloads/Avatar.jsx` lines 83-113, 426-438 (kept outside the repo).
2. At some point the `elbowTarget` parameter was deleted and the pole became
   a fixed anatomical out+forward vector. Recorded elbows were demoted to a
   validity check. Avatar elbows stopped tracking recordings.
3. Fix (`src/components/Avatar.jsx` only): recorded elbow is the primary pole
   again (same orthogonalisation as the old code, mapped through the current
   midpoint-anchored transform for consistency with the wrist targets).
   The anatomical pole survives strictly as the fallback for missing or
   collinear elbow data (straight arm). Wrist exactness, bone lengths, and all
   wrist/torso/head passes are untouched.
4. Verified: numeric IK test (elbow on recorded side, wrist exact, lengths
   exact, straight-arm fallback finite), oxlint clean, production build green.

## 3. Dictionary lifecycle (what happened to the data, in order)

1. The served dictionary decayed to 1 take (file) / 1 gloss sign (`A`), so
   Translate could only fingerspell (with an empty fingerspell DB, frames
   were empty). B, HELLO, THANK_YOU were unplayable.
2. Restore: merged every surviving take by unique id (worktree 1 + backup 4
   + git HEAD 3 = 8 takes: a x4, b x2, hello, thank_you). Frames copied
   verbatim; only a missing `recordingType` was stamped (reads as motion;
   Translate ignores the flag — playback path has no static/motion logic).
   Pushed all 8 to Supabase Main, rebuilt gloss: A, B, HELLO, THANK_YOU.
3. Wipe (user-ordered fresh start): `main_recordings` 8 -> 0,
   `user_recordings` 0 -> 0, file `recordings.json` -> `[]`, gloss -> `{}`.
   Verified live, including an insert/delete roundtrip (201/204). Profiles
   (admin flag) and keys untouched. Translate fingerspells until fresh takes
   are published — that empty state is expected, not an error.

## 4. Locked rules going forward

1. Latest recording wins per sign for Translate (`_take_time_ms` over
   `created_at`/`recordedAt`, tie-break longest). Older takes stay as
   Interpreter templates only; they can never override the newest take.
   (This fixed a live case: the older B take was the golden over the newer
   one. After the switch the golden flipped — wrist moved accordingly.)
2. Backup files (`*.backup-*.json`) are never loaded by any code (proven by
   search: zero references backend + frontend) and no longer exist inside the
   repo (moved out). They cannot contradict new recordings, now or later.
3. Publish still dual-writes Supabase Main + the localhost file with the
   identical payload, then rebuilds gloss. Website deletes hit Supabase
   directly: per-sign clear -> that table; Review delete -> that row;
   "clear all" -> own rows only, never Shared Main.
4. The static/motion flag and all Interpreter tolerances have no path into
   playback (`utils/ai_pipeline.py` serves stored frames plus an idempotent
   floor-only safety net). Translate always gets original recorded values.
