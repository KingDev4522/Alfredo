# PRD 15 — Brainstorm: Why the Palms Won't Meet and Why Fingers Twist (Before Any Fix)

> Date: 2026-09-24 — **No code changed in this PRD. This is the required brainstorm before the next edit.**
> Inputs: four comparison images (avatar vs recording at chest `Hello` and above-head `A`),
> live measurements on the actual `a`/`hello` recordings, GLB mesh bounds, and the full
> history of what was tried and why each attempt broke.
> Read this with `PRD/09-master-record.md` §4–§5 to preserve the reverted baseline.

## 1. What you see right now (your four images, decoded)

| Image | Avatar | Recording replay | Meaning |
|---|---|---|---|
| Avatar `Hello` (chest) | hands together but fingertips overlap / a few fingers bent backwards | hands together, fingertips almost touching, gap tiny | renderer twist, not data |
| Avatar `A` (above head) | hands raised, palms forward, **huge gap** between palms, fingers look OK | hands together, fingertips meeting at the top | gap measured in data is still ~0.02 m, rendered as ~0.20 m |
| Recording `Hello` `a4ea298b` | — | small cyan trapezoid, two hand clouds close together near center | data is clean |
| Recording `A` `16918a51` | — | tall trapezoid, two white clouds at the top meeting at a point | data is clean |

**Stable state to protect:** after the last revert the avatar is back to the `9bb32d7`
baseline (face sphere minimal `0.05`/`0.006`, depth clamped `1.2`/`0.15`). From here forward
no more simultaneous data + renderer edits — that is what caused every regression
(see §5).

## 2. The overhead "force field" — exact code, exact location

Only one piece of code has a fixed spatial position **above** the head:

```py
# isl-backend/routers/database.py:10-11  (still present in the reverted baseline)
FACE_CENTER = [0.0, 1.50, -0.08]   # y=1.50 is ~0.16 m above the shoulder line (y≈1.335)
FACE_RADIUS = 0.05                # soft zone 0.05*1.5 = 0.075 m
```

`apply_capsule_collision(elbow, wrist, FACE_CENTER, FACE_RADIUS)` projects the
elbow→wrist segment onto that sphere and, if `dist < 0.05`, pushes the **wrist in +Z
only** by at most `0.006`. Measured on real signs it never fired
(`closest distance 0.60 m` vs `0.075`, **0 / 82 frames**), but for the *above-head*
pose the segment passes within ~0.20 m of the sphere, so the test does run.
There is **no other spatial force field** — `Avatar.jsx` has only a `MAX_ANGLE 145°`
hinge clamp and a wrist `swing-twist` that uses no fixed position.

In `bb48427` this block was already disabled (`return wrist`). After the revert it is
back enabled as the "minimal" variant. Per your instruction **it must be removed if it
is the cause**. §6 recommends disabling it entirely.

## 3. Why the gap is opposite above vs below — the measured truth

Recomputed on the two live takes you just made (not the old `a`):

| Sign | Recording replay (`recordings.json` normalized) | Gloss (`to_model_space` output, before any palm hack) |
|---|---|---|
| `Hello` down (chest) | `left_wrist.x: +0.48, right -0.43` — **palms together in X**, but `z` depth is large → avatar pushes them **forward** and the fixed bone lengths make them **overlap** when viewed from front | `wrist-gap 0.207, palmGap ~0.013` → one-handed, no closure attempted |
| `A` up (above head) | `left_wrist.x: +0.48, right -0.43` — **palms together at X≈0**, tips at X≈±0.06 | `wrist-gap 0.202, palmGap ~0.01` after the `0.01` closure → still rendered **far apart** |

Wait — the rebuilt gloss *did* close `A` to `0.01` (see last rebuild log: `A palmGap 0.0100`),
yet your new avatar image still shows a **huge** gap. Two possibilities:

1. **Stale data:** the avatar is still animating an *older* `A` take from `gloss_poses.json`
   that was built from the file, not from the Supabase `A` you just re-recorded. The file at
   this moment holds `food` + `a` (old), while Supabase now holds `food` + `hello` + the new
   `A`. The backend's `load_source_recordings()` prefers Supabase only when the env keys
   `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set — otherwise it falls back to the file.
   Your backend was restarted with those keys, but if the process lost them on the last
   `Stop-Process` kill, the next regeneration may have fallen back to the file and re-broadcast
   the old, wider `A`. Verify `TARGET_PALM_GAP` in the running `gloss_poses.json` (it was 0.01
   after the last build) vs what the avatar actually streams.
2. **Gap measured on the wrong axis:** palm closure in `database.py` closes **X only**.
   The `A`-above-head recording has palms facing **forward** (+Z), not toward each other
   (±X). The gap between palms is then a **Z gap**, not an X gap. Closing X does nothing
   — the palms remain separated in depth by ~0.14 m (`left_hand[0].z 0.136` vs body `z 0.10`).
   For the down-chest `Hello`, palms face each other, so X closure *does* close them — but
   the extra `HAND_FORWARD_PUSH (+0.10)` then shoves them into the torso, causing the
   **overlap / hand-inside-body** you see in the down pose.

Both hypotheses were missed because we kept editing data and renderer at once.

## 4. Why fingers are distorted only down, not up

`Avatar.jsx` finger path:

```js
// Avatar.jsx:444 — hand/fingers direct quaternion mapping
setVecDirect(tempVec0, handData[parentIdx]);   // e.g. MCP
setVecDirect(tempVec1, handData[childIdx]);    // e.g. PIP
tempQuat.setFromUnitVectors(defaultDir, normalize(tempVec1 - tempVec0));
```

This is the **minimum-angle rotation**. It ignores hand roll. The wrist already avoids this
by decomposing into `swing (forward)` + `twist (palm normal via cross(vAcross, vFwd))`.

- **Hands above head:** palms face forward, finger direction is mostly `+Y` (up) — the
  minimum-angle rotation happens to align with the model's bind pose, so it *looks* OK.
- **Hands at chest, curled:** fingers point `±X` (inward, toward each other). The minimum-angle
  rotation then spins the finger around its long axis, twisting the nail toward the palm —
  the crooked look in your down image. It is the same code path; the orientation simply
  exposes the bug in one pose and hides it in the other.

Fixing it is a **renderer-only** change: give each finger the same swing-twist treatment.
That must not be mixed with a data-side palm-closure change.

## 5. History of what was tried and why each broke (so we don't repeat)

| Commit | What it touched | Why it broke |
|---|---|---|
| `5fd5244` `Avatar.jsx` wrist-IK | made both arm bones collinear with shoulder→wrist — arms went straight overhead, rigid | removed the natural elbow bend |
| `synthesize_elbow` (`database.py`) | re-derived elbow at mid-shaft + backward offset — pulled arms behind the torso | replaced a noisy but directionally informative landmark with a geometric guess |
| `WRIST_CONVERGENCE 0.18` + `HAND_FORWARD_PUSH 0.12` | moved **only** the wrist X, left hand landmarks behind → hands detached from wrists, crooked | direction-only finger code was unaffected by the X shift |
| `bb48427` palm-edge shift (wrist+landmarks) | correctly closed palms to `0.01`, but applied `+Z` even to chest pose → hands inside torso | forward push correct for above-head, wrong for chest — needs pose-dependent Z or no Z |

## 6. Candidate fixes, evaluated (do not apply together)

| Fix | Scope | Risk | Why it would help the gap / distortion / inside-body |
|---|---|---|---|
| **A. Disable face collision entirely** | `database.py:10-44` → `FACE_RADIUS=0.0`, `apply_capsule_collision` no-op | **Low** — was a no-op in 80/82 frames anyway | removes the only fixed spatial blocker above the head; nothing else creates a force field there |
| **B. Data-side palm closure that respects orientation** | `database.py`/`rebuild` — compute palm *normal* per hand, close along that normal, move wrist+landmarks together, **no** blind X-only shift, add forward push **only for above-head** (y > 1.45) | **Medium** — requires distinguishing chest vs overhead pose by wrist height | closes `A`-above correctly (Z gap), closes `Hello`-down correctly (X gap), avoids overlap |
| **C. Fix finger twist** | `Avatar.jsx:444` — replace `setFromUnitVectors` with per-finger swing-twist (derive `defaultFwd`/`defaultNorm` per finger bone as the wrist already does) | **Medium** — visual, needs eyes | fixes crooked fingers at chest without changing arm data |
| **D. Avatar scale** | `to_model_space` `0.2845` vs model height `1.41` | **High** — touches every frame | explains why 1.023 m shoulder→wrist exceeded 0.56 m reach; already mitigated by `z-clamp 1.2`, leave alone |

## 7. Recommended order (one change, verify, stop)

1. **A alone** — disable the overhead sphere, rebuild gloss, have you re-test **both** heights.
   Expected: hands above no longer pushed aside, gap at `A` still there but no longer caused by
   face code, so its true cause (gap axis) becomes visible.
2. **B alone** — palm closure that closes along the *actual* palm-normal axis, forward push
   only when `wrist.y > 1.45` (above-head). Keeps down-chest hands out of the torso.
3. **C alone** — finger swing-twist, after palms are right.

Each step regenerates gloss from Supabase and is **revertible by checking out a single
file**. No simultaneous data+renderer edits.

## 8. Verification checklist before the next change ships

- `python -c "import json,math; g=json.load(open('isl-backend/gloss_poses.json')); ... palmGap, wristGap, handZ"` must show `palmGap` matching the target (e.g. `0.01`) for the sign just recorded, and `handZ` > torso front (`~0.10`) so hands are not inside.
- `curl -s http://localhost:8000/` `200`, `curl -s http://localhost:5173/` `200`.
- `npm run build` green.
- Manual: record `Hello` (down) and `A` (up), check both avatar heights.
