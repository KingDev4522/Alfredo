# PRD 16 — Avatar Arms: Two-Bone IK (Exact Wrist Placement) + Palm-Closure Removal

> Date: 2026-09-25.
> Symptoms fixed (owner's four images): hands at chest rendered OVERLAPPING when
> recorded slightly apart; hands above head rendered WIDE APART when recorded
> together — while the recording replay (skeleton view) showed the true pose.
> Method: measured the real GLB bind pose with three.js, measured the real gloss
> data, simulated the old renderer and the new one on real frames, verified the
> fix with the same harness. No assumptions; every claim below has a number.

## 1. Root cause — proven, single bug, opposite symptoms

`Avatar.jsx` drove the arm bones with **direction-only FK**: it pointed the
upper arm along the recorded shoulder→elbow direction and the forearm along
elbow→wrist, but let the model's **fixed bone lengths** decide where the wrist
ended up. The recorded wrist **position** was never used.

Measured model truth (`scripts/extract_arm_geometry.mjs`, three.js on the real
`human.glb`): upper arm **0.536**, forearm **0.503** (reach 1.039), shoulders
x=±0.297 (width 0.594). Recordings are normalized to shoulder width, i.e. a
0.2845-wide skeleton — so directions alone guarantee wrong endpoints whenever
the recorded reach differs from 1.039 model units.

Simulation on the real takes (`scripts/diagnose_fk_reach.py`):

| Sign | Recorded wrist gap (model space) | Old FK rendered | Symptom |
|---|---|---|---|
| A (chest) | 0.503 | **0.332** | hands pulled inward → **overlap** |
| B (above head) | 0.413 | **0.530** | hands pushed outward → **gap** |

With arms raised, the recorded shoulder→wrist distance **exceeds** the model's
arm reach after direction-scaling, so both arms splay outward → apart. At
chest height with bent elbows the opposite happens → overlap. One code path,
two opposite-looking bugs. The replay canvas is faithful because it plots
positions directly.

**This confirms the other AI's diagnosis #1 (IK) and disproves its diagnosis
#2 (X-vs-Z palm-closure axis):** the closure never fired on these takes
(measured inner-edge gaps 0.0169/0.0158 < 0.04 target), and the gap/overlap
reproduces numerically without any closure at all.

## 2. What was changed

### 2.1 `src/components/Avatar.jsx` — renderer-only, arms only
- Added `solveArmIK()` (module-level, pre-allocated scratch): classic two-bone
  IK. The wrist is placed **exactly** on the recorded position (clamped to
  reach); the elbow is solved off the shoulder→wrist axis with the recorded
  elbow direction as pole vector (degenerate straight-arm case bulges outward
  via cross(dir, Z)).
- `applyArmIK(isLeft)`: lerps the recorded shoulder/elbow/wrist between frames,
  maps data→model space **rigidly** (anchored on that side's bind-pose shoulder,
  uniform scale `k = modelShoulderWidth / dataShoulderWidth`, clamped 0.5–4),
  solves IK, rotates the two arm bones to the solved directions, refreshes
  world matrices between the two solves. Order preserved: shoulders/elbows IK →
  wrists swing-twist → fingers swing-twist (unchanged).
- Bind-pose anchors + real bone lengths measured once in the setup effect
  (`armIKDefaultsRef`).
- Wrist/finger code untouched. The 145° elbow hinge clamp is superseded by the
  IK reach clamp (|upper−fore|+0.02 … upper+fore−0.02) and was removed with the
  old FK block.

### 2.2 `isl-backend/routers/database.py` — data pipeline
- **X-axis palm closure removed.** It was a no-op on real palm-together takes
  (gap 0.017 < 0.04) and would **squash genuinely wide signs** (arms raised
  sideways) now that the renderer shows true positions. Kept: uniform
  `HAND_FORWARD_PUSH` (+0.10 Z) so hands clear the torso mesh. Face collision
  stays disabled. `load_source_recordings` (Supabase-first) untouched.
- `gloss_poses.json` regenerated from the file (A, B) with the new code; verified
  wrist↔hand[0] continuity unchanged (B 0.0098; A 0.0465 — the A offset comes
  from the raw recording itself: MediaPipe pose-wrist vs hand-wrist disagree by
  ~0.15 shoulder-widths in that take; harmless, pre-existing).

## 3. Verification (all live this session)

- `scripts/diagnose_fk_reach.py`: old-FK 0.332/0.530 vs recorded 0.503/0.413;
  IK error 0.000 m (A) — reproduces both symptoms and the fix analytically.
- `scripts/verify_avatar_ik.mjs`: loads the real GLB, runs the exact shipped IK
  code on real gloss frames — A: target 0.512 → rendered **0.514** (wrist error
  0.0069 m); B: target 0.409 → rendered **0.411** (0.088/0.129 m = symmetric
  reach clamp on the fully-extended overhead arm; relative gap preserved).
- `npx vite build` green (4.7 s). Backend restarted detached, `GET /` → 200.
- Recording replay views are position-plotting and were never affected.

## 4. Guardrails honored (per PRD 15 §5 history)

One renderer change + one data-converter change, each independently revertible
by checking out one file; no simultaneous recording-data edits; gloss rebuilt
only from the existing recordings; no schema/UI/auth changes.

## 5. What to expect on screen now

- Both hands land **where they were recorded**, at every height, including
  above the head — no force field, no splay, no inward pull.
- Signs that genuinely keep the hands apart (wide signs) will now correctly
  render apart; signs recorded palm-to-palm will render palm-to-palm.
- If the recorded arm is longer than the model's (rare, fully-extended overhead
  takes), the arm straightens to full reach instead of separating the hands.

## 6. Files touched

- `src/components/Avatar.jsx` — two-bone IK for arms (+ this fix's harnesses).
- `isl-backend/routers/database.py` — palm-closure removal.
- `isl-backend/gloss_poses.json` — regenerated (no closure).
- `scripts/extract_arm_geometry.mjs`, `scripts/diagnose_fk_reach.py`,
  `scripts/verify_avatar_ik.mjs` — the measurements/verification (kept).
- `isl-backend/launch_backend.py`, `isl-backend/run_server.py` — pre-existing
  local launcher helpers (untracked), committed here for reproducibility.
