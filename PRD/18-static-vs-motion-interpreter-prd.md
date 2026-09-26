# PRD 18 — Interpreter: Static vs Motion Signs (with X/Y/Z tolerances)

> Date: 2026-09-26. Status: IMPLEMENTED in working tree (not committed).
> Scope: Interpreter tab ONLY. Translate tab does not change.
> Audience: team members. Simple English. Read point by point.
>
> Build notes: `src/lib/staticMatch.js` (box test + split + index),
> `LiveInterpreter.jsx` (static fast-path every 6th frame + 1.5s cooldown,
> motion DTW on motion-only library), `recordingStorage.js` + `RecordingTool.jsx`
> + `routers/database.py` + `supabase/migrations/002_recording_type.sql`
> (recording_type flag). Verified: oxlint clean, self-hit 42/42 ratio 1.0,
> cross-sign rejected, old rows default to motion.
>
> Follow-up (2026-09-26, same day): record-flow stale-closure fix, single-word
> sentence rule, joint-usage verification (§13), and the full decision/mistake
> log (§14). Translate/avatar follow-ups live in PRD 19, not here.

## 1. Goal in one line

1. The Interpreter gets 2 kinds of signs: **Static** (one pose) and **Motion** (full movement).
2. The person who records picks the kind at record time. The app remembers it.

## 2. Small words we all use

1. **Static sign:** one hand shape + one wrist spot. One frame is enough to know it.
2. **Motion sign:** a movement over time. Needs all ~60 frames (same as today).
3. **Interpreter tab:** camera sees you, app speaks the word. This PRD is only for this tab.
4. **Translate tab:** text or video becomes the avatar. No change. It always uses full motion.
5. **Main data:** admin (dev) database. It always wins when both Main and Custom match.
6. **Custom data:** normal user database. Used only for new words that Main does not have.
7. **1-hand / 2-hand:** a 1-hand sign only matches 1-hand live video. Same for 2-hand.

## 3. What we have today (facts)

1. One recording = about **60–61 frames** in 2 seconds (`RECORDING_DURATION_MS = 2000`, `RecordingTool.jsx`).
2. Each frame has: 6 body points (2 shoulders, 2 elbows, 2 wrists) + 21 finger points per hand.
3. All points are **normalized**: 1.0 = one shoulder width. Rounded to 4 decimals (`normalize.js`).
4. Motion match today = DTW over 18 downsampled frames, threshold 0.36 (`dtw.js`, `recognizer.js`).
5. Live motion segment = 550 ms min to 3000 ms max, pause 350 ms (`segmentation.js`).

## 4. What changes at recording time

1. New required choice on the Record screen: **Static** or **Motion**. No default. No save without it.
2. The choice is saved with the recording as `recording_type = "static" | "motion"`.
3. Same rule for Main (admin) and Custom (user). Same for 1-hand and 2-hand.
4. Everything is still recorded and stored the same way (all joints). Only the flag is new.
5. Old recordings without the flag count as `motion`, so nothing breaks.

## 5. Screen shows all, code checks less (Interpreter only)

1. The skeleton on screen still draws **all** joints. No visual change.
2. Behind the screen, the Interpreter checks **only wrist + fingers**.
3. These 4 joints are **ignored on Interpreter only**: left shoulder, right shoulder, left elbow, right elbow.
4. These are **used**: left wrist, right wrist, 21 finger points per visible hand.
5. Why: hand height/spot changes from person to person. Shape of fingers is the real ID.
6. Translate tab, avatar, and stored files keep using all joints as today.

## 6. Z coordinates — what they are (real numbers from our data)

1. We DO record Z (depth) today. Every frame has X, Y, and Z.
2. Body Z (shoulder/elbow/wrist): big numbers, noisy. Example frame 30 of sign `a`:
   `left_wrist z = -2.0329` (take range `-2.29` to `-1.88`), `left_elbow z = -0.6022`, `left_shoulder z = -0.165`.
3. Hand Z (fingers, relative to wrist, `0` = wrist base): small numbers, useful shape. Same frame:
   `lm0 z = 0`, `lm4 z = -0.0669`, `lm8 z = -0.126`, `lm12 z = -0.1077`, `lm16 z = -0.0898`, `lm20 z = -0.0963`.
4. Full-take hand Z range: about `-0.16` to `+0.01`.
5. Jitter per frame: fingers ~0.003 mean / 0.012 max; body wrist ~0.03–0.05 mean / 0.09–0.20 max.
6. Cross-sign gap: fingers 0.09–0.22; body wrist 0.77–1.16. So body-wrist Z separates signs strongly but drifts a lot inside one take.

## 7. Tolerance table (the actual numbers to build)

All values are normalized units (1.0 = shoulder width). A live point matches a template point only if X AND Y AND Z all pass.

| Joint group | X | Y | Z | Why |
|---|---|---|---|---|
| Fingers (21 per hand) | ±0.10 | ±0.10 | ±0.05 | Tight. Jitter is 0.003, cross-sign gap is 0.08+. Z range is tiny so Z box is smallest. |
| Wrist (left + right) | ±0.15 | ±0.15 | ±0.30 | Loose. Wrist spot moves per person (same-sign drift 0.02–0.14, cross-sign 0.40+). Wrist Z is the noisiest (jitter up to 0.20), so it gets the biggest box. |
| Shoulder + elbow (4 joints) | ignored | ignored | ignored | Not compared on Interpreter. No number needed. |

Notes:

1. Z is used for wrist + fingers only, same as X/Y.
2. `lm0` (hand base) always has `z = 0` — skip its Z check (X/Y only), check Z on lm1–lm20.
3. If a hand is missing on either side, use the existing `MISSING_HAND_PENALTY` path, do not count it as a match.

## 8. Static rule (Interpreter only)

1. Take each live frame (of the ~60) and compare it to each static template with the same hand count.
2. A finger point = hit if it is inside its ±X/Y/Z box. Wrist point = hit if inside its box.
3. A frame = hit if: both visible wrists hit AND at least **80% of finger points** hit (17 of 21 for 1-hand).
4. **Any 1 hitting frame = answer shown at once.** No waiting for full motion.
5. Order: Static Main first, then Static Custom. Main wins ties.

## 9. Motion rule (Interpreter only, same as today)

1. Trim to last 2 seconds (~60 frames), downsample to 18, DTW, threshold 0.36.
2. Only change: distance uses wrist + fingers (the 4 ignored joints stay ignored — `dtw.js frameDistance` already skips body, keep it so).
3. Order: Motion Main first, then Motion Custom.

## 10. Final order in the Interpreter

1. Static Main.
2. Static Custom.
3. Motion Main.
4. Motion Custom.
5. Static short-circuits: if static hits, answer now and skip DTW. Else run motion as today.

## 11. What is NOT changing

1. No Translate change. No avatar change. No new model.
2. No motion threshold change (stays 0.36).
3. No visual change (all joints still drawn).
4. Stored format does not lose any joint — matching just reads a subset.

## 12. How we test it

1. Record 1 static + 1 motion sign for the same word, check the flag is stored.
2. Hold the static pose in Interpreter: word appears from a single frame.
3. Sign a motion word: word appears via DTW path, no static false hit.
4. Re-run `scripts/evaluate.mjs`: motion accuracy must not drop.

## 13. Joint-usage verification (checked in code 2026-09-26, not assumed)

Which joints each Interpreter path actually reads:

| Path | File | Shoulders/elbows | Wrists | Fingers |
|---|---|---|---|---|
| Static box test | `src/lib/staticMatch.js` (`staticFrameHits`) | never read | every visible wrist must hit its box | >= 80% must hit |
| Motion DTW | `src/lib/dtw.js` (`frameDistance`) | never read | NOT compared | only the 2x21 finger arrays |
| Shape prefilter | `src/lib/shapePrefilter.js` | never read | only as the origin fingers are measured from (position-free) | mean finger vectors |
| Bucketing | `src/lib/recognizer.js` | never read | never read | hand count only (1 vs 2) |

Two facts follow:

1. Shoulders and elbows are ignored everywhere in the Interpreter. That part
   of the design holds exactly.
2. DEVIATION (known, accepted): §5/§9 say motion uses "wrist + fingers", but
   `frameDistance` compares fingers only — wrist position plays no role in
   motion matching. This predates PRD 18 (`dtw.js` untouched; threshold 0.36
   and gate 0.12 were tuned on fingers-only). The Interpreter works well as
   is, so motion matching is NOT changed now. Rule: adding wrist position to
   DTW needs a re-tune of the threshold on real data (`scripts/evaluate.mjs`)
   and real data does not exist yet (database wiped 2026-09-26, re-recording
   in progress). Revisit only after fresh takes exist and evaluate runs green.

## 14. Build log — every change, decision and mistake after PRD 18 (2026-09-26)

F1. Stale-closure take bug (mistake in the first PRD 18 implementation).
The camera loop subscribes once, so `finishRecording()` ran a stale closure
(sign `hello`, type null). Takes were filed under the wrong word with a null
flag, so Keep/Publish refused them with "Classify this take..." even though
Static was visibly selected. Fix (`RecordingTool.jsx`): latest-value refs
(`selectedSignIdRef`, `recordingTypeBySignRef`, `finishRecordingRef`) so the
take always stamps the current sign + flag. Also fixed: publish callback deps,
modal label now shows the take's word, left classifier stays enabled during
review (it was the only way out of an unclassified take and it was disabled).

F2. Supabase wiring (decision). Admin mail is `debjeetmazumder3232@gmail.com`
(profile already `is_admin = true`; migration 002 already applied — both
verified live, nothing to run). Backend `.env` got the service_role key
(gitignored, never committed). Backend restarted; avatar source flipped from
file to Supabase as designed. Keys were posted in chat: rotate the
service_role key in Supabase Dashboard if that channel was not private.

F3. Single-word sentence rule (decision + mistake fix). The sentence AI
received single tokens (`A`, `WATER`) with a prompt demanding a full
sentence, so it fabricated one ("I need water"). Locked rule now: 1 token is
spoken literally, no LLM call. Frontend (`sentenceAI.js`) skips `/api/sentence`
for <= 1 token; backend (`routers/sentence.py`) returns the literal word
(`a` -> `A`, `thank_you` -> `Thank you`, `watr` -> completes to `water`,
still literal) plus a prompt guard. Verified live: 4/4 single inputs HTTP 200
literal. Multi-word behaviour unchanged.

F4. What was NOT changed. Motion matching math, thresholds, tolerances,
conversion constants, the GLB rig — all byte-identical. `Avatar.jsx` was
untouched by all of the above (its later elbow fix is PRD 19, Translate
scope, and does not feed back into matching).

F5. Offline sync-button gating (normal-user audit fix). The two localhost
bridges ("Sync localhost file → Main", "Sync Supabase → localhost file")
were visible on every machine, but on any machine without the backend they
only produced "backend offline" errors. `RecordingTool.jsx` now probes the
file backend once on mount and hides both buttons when unreachable. All
other paths (Keep/Publish/import/export/delete) already degrade gracefully
and are untouched. Verified: oxlint clean, production build green.
