# PRD 10 — Handedness Correctness + Distinct Per-Hand Colors

> Date: 2026-09-24
> Request: verify Left hand is treated as left and Right as right; give the two hands
> distinct bright colors; apply across every front-end view.
> Status: implemented in 4 components + 1 new shared module, build green, pushed.

## 1. Handedness audit (verified — logic was already correct, now documented)

All capture/draw loops route on MediaPipe's own label, never on array order:

```js
handResult.handednesses.forEach((h, i) => {
  if (h[0].categoryName === "Left")  leftHand  = handResult.landmarks[i];
  if (h[0].categoryName === "Right") rightHand = handResult.landmarks[i];
});
```

- `RecordingTool.jsx:217` (capture) → stores into `left_hand` / `right_hand`.
- `LiveInterpreter.jsx:202` (live) → feeds the frame object the recognizer/segmenter see.
- `HandTracker.jsx` → previously colored by **detection index** (`HAND_COLORS[index]`), which
  could swap colors frame-to-frame. Now colors by handedness label — the same hand always keeps
  the same color. This was the one real defect found.

Pose joint indices are MediaPipe-standard and correctly paired:
`11=left_shoulder, 13=left_elbow, 15=left_wrist` and `12/14/16` for the right arm.

Data cross-check on the real 2 stored recordings: `left_hand[0].x ≈ +0.67`,
`right_hand[0].x ≈ -0.68` (torso-relative). In raw unmirrored camera space a person's left hand
sits on the image's right → positive x after shoulder-midpoint subtraction. **Consistent — the
stored left/right assignment is right.** The video/canvas are both `-scale-x-100` (mirrored
together), so the on-screen view matches what the user expects.

## 2. Color system (new shared source of truth: `src/lib/handColors.js`)

| Token | Value | Use |
|---|---|---|
| `LEFT_HAND_COLOR` | `#FFB627` (amber/orange) | left-hand skeleton + joints + legend |
| `RIGHT_HAND_COLOR` | `#22E55F` (green) | right-hand skeleton + joints + legend |
| `HAND_JOINT_COLOR` | `#FFFFFF` | joint dots in skeleton replay (contrast on dark) |
| `BODY_COLOR` | `#3DF5FF` (cyan) | pose/shoulder lines — deliberately kept cyan so body never reads as a hand |
| `handColorFor(cat)` | — | `Left → #FFB627`, else `#22E55F` |

Left = orange, right = green (owner-locked). Body/shoulder lines stay cyan so they can never be
mistaken for either hand. Single source of truth — no duplicated hexes for hands anywhere.

## 3. Changes per file

- `src/lib/handColors.js` — **new** shared constants + `handColorFor()`.
- `src/components/RecordingTool.jsx` — hand color by handedness; joints now match their hand's
  color (were all one pink); added **Left/Right legend** overlay on the camera (filled dot = seen).
- `src/components/LiveInterpreter.jsx` — same color + legend changes.
- `src/components/HandTracker.jsx` — color by handedness (index-order bug fixed); **legend added**.
- `src/components/SkeletonPlayback.jsx` — replay uses the same two colors; joints white.

## 4. Verification

`npm run build` → `✓ built in 1.49s`. Lint: no new warnings from these files (remaining warnings
are pre-existing). Hand color path is pure client-side canvas drawing; visual confirmation needs a
camera in Chrome — open `/record`, raise both hands, the legend and skeleton colors must agree.

## 5. State notes

- Remaining `#FF2D9A` / `#A855F7` occurrences are UI chrome (buttons, progress bars, headings),
  intentionally untouched — the request was specifically about the two hand skeletons.
- Supabase/Google/admin items unchanged by this PR; see `PRD/OPEN_ISSUES.json`.

## 6. Pipeline verification performed this round (live probes)

| Check | Result |
|---|---|
| Backend `GET /` | `200` — FastAPI up |
| Backend `GET /api/db/recordings` | `200`, **2 file rows** (hello, food) |
| Supabase `profiles` | reachable; **2 rows now exist** → login flow works end to end |
| Supabase `main_recordings` | reachable, **0 rows** (no Publish yet) |
| Supabase `user_recordings` | reachable, **0 rows** |
| Supabase `custom_words` | reachable, **0 rows** |
| Google OAuth | `external_google_enabled=true` |
| Site URL | `https://alfredo-seven.vercel.app` |

**Admin flag applied this round.** Two accounts had signed in; neither was admin. Per owner's
instruction that `debjeetmazumder3232@gmail.com` is the sole admin, `profiles.is_admin` was set
to `true` for exactly that row and verified by re-read:
`deb***@gmail.com → is_admin: true`, second account remains `false`. Isolation therefore has a
live test subject: the second account is the perfect "other user" for verifying that Main is
readable but not writable.

Recording is therefore ready to start. Remaining step is the owner's own: record and click
Keep/Publish — the write path itself (`saveRecording`) was verified by code review and table
reachability, not by a live write, because performing a real recording requires a webcam.
