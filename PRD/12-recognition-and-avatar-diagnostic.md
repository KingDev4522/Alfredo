# PRD 12 — Recognition Fix (hand-dropout) + Avatar Hand Diagnostic

> Date: 2026-09-24
> Triggers: (a) interpreter cannot recognize a freshly recorded 2-hand sign ("a");
> (b) avatar hands look crooked and show a gap the owner did not see in the real pose.
> Method: numeric reproduction against the actual stored recording, GLB inspection, model-space audit.

## 1. Recognition failure — ROOT CAUSE FOUND AND FIXED

### 1.1 First, ruling out the easy suspects
| Hypothesis | Verdict | Evidence |
|---|---|---|
| Recording never saved | **False** | file `recordings.json` = 3 rows incl. `a`; Supabase `main_recordings` = `a`, `hand_count=2`, `frame_count=41` |
| DTW math broken | **False** | self-match distance `0.0000`, confidence `1.0000`; other signs rejected (0.05 / 0.09) |
| Avatar/gloss cache stale | **False** | `gloss_poses.json` keys now `[HELLO, FOOD, A]` |
| Handedness swapped | Cosmetic only | raw stream is unmirrored but MediaPipe assumes mirrored; labels swap consistently in both record and live, so DTW still matches |

### 1.2 The actual cause
`src/lib/dtw.js → frameDistance()` charged a flat **`PENALTY = 999.0`** for *any* frame where one
sequence had a hand and the other did not, then **summed** per-hand distances.

Consequences, both fatal:
1. **Any** single-frame tracking dropout poisoned the entire sequence — a 999 buried under a
   `/pathLength` average still dominated completely.
2. A 2-hand frame summed two hand distances while a 1-hand frame summed one, so **hand count
   itself changed the distance scale**; 1-hand and 2-hand templates were never comparable.

This is fatal specifically for this sign: the "a" pose has both hands close together, so
MediaPipe's two-hand separation flickers frame to frame. Measured on the real recording:

| Condition | Distance | Confidence | Result (threshold 0.36) |
|---|---|---|---|
| Exact replay | 0.000 | 1.0000 | recognized |
| 5% jitter | 0.264 | 0.6947 | recognized |
| **30% left-hand dropout** | **333.0** | **0.0018** | **rejected** |
| **50% left-hand dropout** | **555.0** | **0.0011** | **rejected** |
| **One hand fully lost** | **999.0** | **0.0006** | **rejected** |

### 1.3 The fix
`frameDistance` now:
- uses a bounded `MISSING_HAND_PENALTY = 3.0` instead of 999;
- **averages over the hands actually compared** (`total / compared`) so 1-hand and 2-hand frames
  share one scale;
- keeps the existing per-hand left/right matching and fingertip weighting untouched.

### 1.4 Post-fix measurements (same recording, same threshold 0.36)
| Condition | Distance | Confidence | Result |
|---|---|---|---|
| Exact replay | 0.000 | 1.0000 | recognized |
| 5% jitter | 0.132 | 0.8198 | recognized |
| **30% dropout** | **0.500** | **0.5455** | **recognized** |
| **50% dropout** | **0.833** | **0.4186** | **recognized** |
| One hand fully lost | 1.500 | 0.2857 | correctly rejected |
| Wrong sign (`hello`) | 10.69 | 0.0531 | correctly rejected |
| Wrong sign (`food`) | 5.94 | 0.0918 | correctly rejected |

The penalty value 3.0 was chosen deliberately: it is the point where *total* loss falls below
threshold (0.286) while *partial* dropout stays above it (0.42–0.55). Wrong signs stay an order
of magnitude away, so discrimination is preserved.

## 2. Case sensitivity — ALREADY CORRECT (verified, no change needed)

| Layer | Behaviour |
|---|---|
| `ai_pipeline.py:41,49` | input text uppercased → `clean = word.strip(".,!?\"'").upper()` |
| `database.py:73` | gloss keys stored as `str(sign_id).upper()` |
| Live interpreter | DTW on geometry only; string case is irrelevant |

So a custom word saved as `a` is found whether the user types `a`, `A`, `"A,"` or `A.`.
The label shown in the UI preserves the owner's original casing.

## 3. Avatar hands — investigation results (honest status)

**Confirmed correct:**
- All 30 finger bone names in `FINGER_MAP` exist in `public/avatar/human.glb`. The odd-looking
  `RightHandMiddle1_00` is the model's *actual* name (inconsistent Sketchfab export), not a typo.
  An earlier suspicion of a typo was checked and disproved.
- The transform pipeline is sound: `recordings.json` holds normalized landmarks;
  `database.py:to_model_space()` converts to avatar world space; `gloss_poses.json["A"]` contains
  41 frames with coherent values.
- The stored "a" pose is genuinely ~0.20 m wrist-to-wrist. MediaPipe's hand landmark 0 is the
  **wrist joint**, not the palm edge — when palms touch, wrists are still ~a palm-width apart, so
  the small gap in the replay is faithful to the data, not a rendering artifact.

**Not a cause (ruled out):** the hardcoded `0.2845` scale in `to_model_space()`. It scales x, y
and z uniformly, and `Avatar.jsx` converts landmarks to **directions** (`setFromUnitVectors`)
rather than positions, so a uniform scale cannot change finger orientation at all.

**Remaining suspect for the crooked/twisted fingers (needs visual iteration):**
`Avatar.jsx` rotates each finger with `Quaternion.setFromUnitVectors(defaultDir, targetDir)`,
which yields the *minimum-angle* rotation between two directions. For fingers this is a known
source of unnatural twist, because the rotation has no anatomical roll reference. The wrist
already avoids this by using an explicit swing-twist decomposition with a palm normal; the
fingers do not.

**Recommended next step (not done here — it needs eyes on the render):** give each finger the same
swing-twist treatment the wrist already uses, deriving a stable per-finger reference normal from
the palm plane, so finger curl bends without twist. This is a visual-quality change that should
not be shipped blind.

## 4. Files changed

- `src/lib/dtw.js` — dropout-tolerant, scale-normalized `frameDistance`.
- `scripts/diagnose_dropout.mjs` — **new**, reproduces the dropout/jitter table above.
- `scripts/diagnose_recognizer.mjs` — **new**, template self/cross-match check.
- Four exploratory GLB scripts used during this investigation were removed after their findings
  were folded into this document.

## 5. Verification

`npm run build` → `✓ built in 1.03s`. Recognition tables reproduced by running
`node scripts/diagnose_dropout.mjs` and `node scripts/diagnose_recognizer.mjs`.

**Caveat:** `scripts/evaluate.mjs` (the full sweep that originally tuned `bandFraction`/`k`/
`CONFIDENCE_THRESHOLD`) expects the older 265-recording export and could not be re-run, because
the project now holds only 3 recordings. The threshold was therefore NOT re-tuned; it was kept at
0.36 and the penalty was tuned against the new distance scale instead. Re-running `evaluate.mjs`
on a larger corpus is recommended before any further threshold change.
