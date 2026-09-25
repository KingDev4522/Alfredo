# PRD 13 — Avatar Pose: Source-of-Truth Divergence + Depth Noise + Force Field

> Date: 2026-09-24
> Triggers: avatar showed a completely different pose than the recording the user had just
> made; hands would not come together; fingers crooked; owner suspected a "force field".
> All findings below are numeric measurements on the real data, not guesses.

## 1. THE PRIMARY BUG — the two stores had diverged

| Store | Content at time of investigation |
|---|---|
| `isl-backend/database/recordings.json` (file) | `food`, `a` (id `60d6f571`) — an **older** take |
| Supabase `main_recordings` | `a` (id `289e5ed7`) — the take the user **actually just made** |

The avatar reads **`gloss_poses.json`**, which the backend regenerates from the **file**.
The Record / Delete UI reads **Supabase**. So the user recorded `289e5ed7`, reviewed it
(correctly, via Supabase), and then the avatar animated `60d6f571` — a completely different
take. That alone explains "the avatar is not doing what I recorded".

Additional evidence of drift found on the way: an earlier `a` recording had been deleted from
Supabase but was still present in the file, and `hello` existed in one store and not the other.

### Fixes
1. **Backend now treats Supabase as authoritative when configured.**
   `load_source_recordings()` in `database.py` reads `main_recordings` via
   `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, falling back to the file when unset, and logs
   which source was used (`[database] gloss rebuilt from supabase: [...]`).
2. **Reconciliation scripts** (`scripts/reconcile_file_to_supabase.py`,
   `scripts/rebuild_gloss_from_supabase.py`) pushed the file-only `food` recording into
   Supabase and regenerated the gloss DB from Supabase, so nothing was lost.

## 2. THE SECOND BUG — MediaPipe depth is noise, and it stretched the arms

Pose landmarks carry image-normalised `x`/`y` plus a hip-relative depth `z` that is **not in
the same unit**. Measured on the user's `a` recording:

- `|z|` ranged **1.38 → 3.59 shoulder-widths** (a real arm reach is well under 1).
- elbow `|x|` ranged **1.04 → 1.13**, i.e. **outside the image** (>1.0).

Feeding that through the old constant produced anatomically impossible bones:

| Segment | Old | Human | New |
|---|---|---|---|
| upper arm | 0.369 m | ~0.30 m | **0.265 m** |
| forearm | **0.467 m** | ~0.26 m | **0.301 m** |
| shoulder→wrist | **0.750 m** | ~0.56 m max | — |

A 0.47 m forearm cannot exist, so the avatar threw the hands forward and apart and they could
never meet. The arm direction was wrong, which is what `Avatar.jsx` actually consumes (it sets
bone *directions* and uses the model's own bone lengths).

### Fix
`BODY_Z_SCALE = 0.15` (was `0.2`) and `BODY_Z_CLAMP = 1.2`. `x`/`y` are trusted — the whole
torso-relative normalisation is built on them. Depth is now a weak, bounded hint. Hand depth is
wrist-relative and small (0 at wrist, ~-0.1 at fingertips), so it is left untouched.

Verified by sweeping the scale before choosing (`scripts/verify_z_fix.py`).

## 3. The "force field" — measured, then minimised

The face sphere is `FACE_CENTER [0, 1.50, -0.08]`, `FACE_RADIUS 0.08`, with a cosine soft zone
of `radius * 1.5` and a `+0.03 m` push.

Measured on the real dataset (`scripts/check_collision.py`):

| Sign | closest elbow→wrist→face | frames inside soft zone |
|---|---|---|
| HELLO | 0.638 m | **0 / 82** |
| FOOD | 0.605 m | **0 / 82** |

The soft zone is 0.12 m, so the collision code **never executed** on any real frame. It was not
what separated the hands. Nevertheless it was rewritten to be strictly anti-clip:

- `FACE_RADIUS` 0.08 → **0.05**; soft push 0.03 → **0.006**.
- It now returns immediately unless there is **genuine penetration**.
- It only ever modifies **+Z (depth)**. There is no lateral term, so two hands can always meet.

### Where the face actually is
`public/avatar/human.glb` is a Sketchfab export whose skeleton nodes carry identity transforms;
the real bind pose lives in the skin's `inverseBindMatrices` (decoded in
`scripts/analyze_head.py`). Recovered anchors:

| Bone | Position |
|---|---|
| `LeftEye_09` | `[0.1132, -0.0039, 0.0386]` |
| `RightEye_010` | `[0.3007, -0.0052, 0.0219]` |
| **eye midpoint (recommended face centre)** | **`[0.207, -0.005, 0.030]`** |
| `Head_08` | `[0.1219, -0.0138, 0.1253]` |

These are in the GLB's own bind space. The runtime avatar works in the `to_model_space` frame
(shoulders at y≈1.335), which is a different space, so the eye midpoint cannot be copied across
directly. It is recorded here as the correct anatomical anchor if the force field is ever
re-tuned. **Given the collision is now a no-op on real data, the safest default is to leave it
minimal rather than chase an exact centre.**

## 4. Handedness — checked, correct
Every capture path routes on MediaPipe's `categoryName`, never array order. On the user's data
`left_hand.x = +0.483` and `right_hand.x = -0.434`, i.e. each hand is on its own side in raw
camera space. No swap bug.

Note: the **replay canvas is not mirrored** while the live camera is (`-scale-x-100`), so in
`SkeletonPlayback` the orange left hand appears on the right of the canvas. That is geometrically
faithful to the captured frame; it is a display-consistency question, not a data error.

## 5. Case sensitivity — already correct (re-verified)
`ai_pipeline.py` uppercases input; `database.py` stores gloss keys uppercase. `a` and `A` both
resolve. The `a` recording in Supabase is `sign_id = "a"` and the gloss key is `A`.

## 6. What is still open (honest)
The **finger twist** is a separate, unresolved issue. `Avatar.jsx` rotates each finger with
`Quaternion.setFromUnitVectors`, the minimum-angle rotation, which twists fingers because it has
no anatomical roll reference. The wrist already solves this with an explicit swing-twist
decomposition; fingers do not. This is a visual-quality change that should not be shipped blind —
it needs eyes on the render.

Also note the **wrist gap is 0.261 m in the data itself** and is not something to "fix away":
MediaPipe's hand landmark 0 is the *wrist joint*, so even with palms touching, wrists sit about a
palm-width apart. The replay in the owner's screenshot is faithful.

## 7. Files changed
- `isl-backend/routers/database.py` — Supabase-first source, z damping/clamp, minimal face collision.
- `scripts/analyze_arm_geometry.py`, `scripts/verify_z_fix.py`, `scripts/analyze_head.py`,
  `scripts/check_collision.py` — the measurements behind every number above.
- `scripts/reconcile_file_to_supabase.py`, `scripts/rebuild_gloss_from_supabase.py` — drift repair.
- `isl-backend/gloss_poses.json` — regenerated from Supabase (`A`, `FOOD`).
- Backend restarted with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set.

## 8. Verification
```
gloss keys: ['A', 'FOOD']
A    frames=41  upper=0.265  fore=0.301  wrist-gap=0.261
FOOD frames=41  upper=0.288  fore=0.286  wrist-gap=0.813
backend: 200
```
Forearm reduced from 0.467 m to 0.301 m; upper arm 0.265 m — both now within human range.
