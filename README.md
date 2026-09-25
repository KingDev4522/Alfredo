# ISL Interpreter — Phase 1

This is Phase 1 of the real-time Indian Sign Language interpreter project.
This phase has one job only: prove that live hand tracking works smoothly
in the browser, on your actual laptop, before anything else gets built on
top of it.

## What this phase does

- Opens your webcam
- Tracks **up to two hands** in real time using Google's MediaPipe Hand
  Landmarker (since some signs in our vocabulary are naturally two-handed)
- Draws each hand's skeleton in a different color so it's obvious when
  both are being tracked at once
- Shows a live FPS counter, which engine (GPU or CPU) is active, and the
  camera's actual negotiated resolution/frame rate
- Automatically and transparently scales down processing resolution if it
  detects a sustained real slowdown, to recover speed on weaker hardware
  — you'll see "auto-scaled to X% for speed" appear if this happens
- Shows a clear message for: camera permission denied, no camera found,
  no hand currently visible, or more than one hand visible

There is no sign recognition or speech yet — that comes in later phases.

## How to run it

You need [Node.js](https://nodejs.org) installed (any recent version, 18+).

1. Open a terminal in this folder
2. Install dependencies:
   ```
   npm install
   ```
3. Start the app:
   ```
   npm run dev
   ```
4. Open the link it prints (usually `http://localhost:5173`) in Chrome or
   Edge
5. Allow camera access when prompted
6. Hold one hand up — you should see the skeleton tracking it smoothly

## Phase 2 — Recording Tool

Open the app and you'll land on the **"Record Signs"** tab by default (the
Phase 1 camera test is still there as a second tab, unchanged).

### How to record a sign

1. Pick a sign from the list on the right. Signs marked as needing two
   hands will warn you live if only one hand is currently visible — get
   both hands in frame before starting.
2. Type your name in the "Recorded by" box, and optionally a "Batch
   label" describing the current lighting/angle/position (e.g.
   "daylight", "lamp-lit", "angled-left", "far-distance"). Set the batch
   label once, then record all 25 signs through before changing it —
   don't switch it per sign, that's needlessly tedious.
3. Click **Start Recording**. You'll get a 3-2-1 countdown, then a 2-second
   recording window — perform the sign during that window.
4. Immediately after, you'll see an animated skeleton replay of exactly
   what was recorded. Check it looks right.
5. Click **Keep** to save it, or **Discard & Retry** if it looked wrong
   (cut off, wrong gesture, hand dropped out, etc.) — retry as many times
   as needed, discarding costs nothing.
6. The counter next to each sign in the list shows how many recordings
   exist so far. The target is **15 per sign**, shown as `x / 15` — this
   is a target to aim for, not a hard cap. You can keep recording past it
   (it'll show a ✓ once reached), which is genuinely useful if you're
   deliberately varying angle/lighting/position across multiple batches.

### Exporting your data

Once you've recorded everything (or want to back up progress), click
**"Export all recordings (.json)"** — this downloads one JSON file
containing every recording made in this browser. Keep this file safe;
it's what Phase 3 will use to build the actual recognition engine.

Recordings are stored locally in the browser (IndexedDB), so they persist
across reloads, but they do NOT sync between different browsers/computers.
If a teammate records on their own laptop, have them export their file too
and send it to you — we'll merge multiple export files together in Phase 3.

### Phase 4 — Live Interpreter (Sentence Building + Speech)

The **"Interpret"** tab (now the default when the app opens) is the real
demo-facing feature: sign naturally in front of the camera — no countdown,
no button presses — and it builds a spoken sentence automatically.

### How it actually works

1. **Motion-based segmentation** (`lib/segmentation.js`) — since there's no
   countdown telling the system when a sign starts/ends, it watches hand
   movement instead. While your hand is moving, it's presumably mid-sign;
   when movement stops and stays stopped for a short confirmation window,
   that's treated as a natural pause between signs, and everything
   captured since the last pause becomes one candidate sign.
2. That candidate sequence gets normalized the same way recordings are
   (`normalizeSequence`) and classified against your actual recorded
   templates, loaded live from IndexedDB — using the exact tuned settings
   (band width 0.35, k=1, fingertip weighting) that Phase 3's evaluation
   confirmed as best.
3. If confidence clears the tested threshold (0.42), the word is accepted
   and added to the sentence. Below that, it's shown as "not recognized"
   and nothing gets added — no wrong guesses get through silently.
4. **Grammar smoothing** (`lib/sentenceGrammar.js`) — real ISL doesn't
   sign prepositions or joining verbs the way English needs them, so a
   literal reading ("I. Pain. Help. Doctor.") sounds broken. A small,
   readable set of rules inserts the connecting words English needs
   ("I am in pain. I need help. I need a doctor.") without requiring any
   custom signs. You can watch this transformation happen live in the
   "Will be spoken as" preview as you sign.
5. **Speech is deliberately deferred, not per-word** — it fires
   automatically about 2.2 seconds after the last recognized sign (long
   enough not to cut you off mid-thought), or instantly via the **Speak
   Now** button. The visual side (each word appearing, confidence meter)
   stays real-time regardless — only the audio waits for the full,
   grammar-smoothed sentence, since speaking word-by-word would sound
   exactly as broken as what we're trying to avoid.

### Important: segmentation timing isn't validated against recorded data

Everything else in this app was tuned against your actual 265+ recordings.
Segmentation timing (`movementThreshold`, `pauseConfirmMs` in
`segmentation.js`) genuinely can't be — that data was all pre-segmented by
the Phase 2 countdown, so it can't tell us how fast real continuous
signing moves. These are a reasonable starting point; expect to adjust
them after testing with your actual camera and signing speed.

## Speed, no-repeat, and custom words (post-Phase-4 refinement)

After moving the whole vocabulary to one-handed, static signs (a
deliberate, confirmed-working decision — two-handed tracking has more
ways to fail live than one hand does), three more refinements landed:

- **Segmentation is much faster** — the minimum segment time dropped from
  1200ms to 550ms, since static signs don't need as long a window to
  capture reliably. This is safe now specifically because of the next
  point below.
- **No more duplicate signs in a row.** If a held sign causes the
  segmenter to fire again before you've moved on (which can still happen
  — it's not a bug, just how segmentation works), it no longer grows the
  sentence with a repeat. It's still shown as recognized, it just doesn't
  duplicate in the sentence. A genuine intentional repeat just means
  briefly dropping your hand out of frame between the two.
- **Custom words**, right in the Record Signs tab — for anything with no
  fixed ISL sign (a name, most commonly). Type a word, hit Add, and record
  it exactly like any other sign. This works with zero extra recognition
  code: the recognizer already just groups recordings by whatever signId
  exists in the data, so a custom word is picked up by the live
  interpreter the moment you've recorded a few reps for it — no retraining
  step. Custom word definitions live in localStorage (tiny metadata, not
  landmark data, so it doesn't need IndexedDB).

- **Recognition is now ~6x faster** — sequences are downsampled to at
  most 18 frames before comparison (redundant near-duplicate frames from
  held static signs cost real computation without adding real
  information). Measured on the actual recorded data: 297ms → 50ms to
  search the full template library, and — verified, not assumed —
  accuracy actually went up slightly (96.1% → 96.8%) rather than costing
  anything. Worth knowing: search time still scales roughly linearly with
  how many signs/reps exist, so if the vocabulary grows a lot further,
  this is the first place to revisit.

## Phase 5 — Full Interface & Real-World Robustness

The app now has a real front door. Opening it, you see:

1. **Hero** — the SignSpeak wordmark, a live stat row (word count, cost,
   on-device), and the signature visual: a canvas "constellation" of
   glowing tracked points connected by faint trailing lines, drifting
   gently and pulling toward your cursor. This isn't decoration — it's
   literally what MediaPipe does to a hand, made ambient. It's the one
   deliberately bold visual risk; everything else stays quiet around it.
2. **The interpreter itself** — right below the hero, prominent, exactly
   as built in Phase 4.
3. **How It Works** — a compact, scroll-revealed band (Camera → Recognize
   → Speak) connected by a trail line that draws itself in as you scroll
   past, using GSAP ScrollTrigger correctly (scrollTrigger lives on the
   timeline itself, scrub only, animating the line/cards — never the
   scrolling container itself). This is a real pipeline, not a decorative
   numbered list, which is why the sequence is honest to show.
4. **Developer tools** — Record Signs, Camera Test, and Review Flagged are
   now tucked behind a small, deliberately unobtrusive "▸ Developer tools"
   toggle at the very bottom, collapsed by default. A judge sees a
   finished product; you still have full access to everything that built
   it, one click away.

### A transparency note on visual QA this round

I verified this build carefully but differently than usual: Puppeteer's
browser download and the live MediaPipe model fetch are both blocked by
this sandbox's network restrictions (the same restrictions that apply to
package installs), so I couldn't test the live camera view the way you
can. I did get real screenshots working via a different tool already
present in the environment, and verified objectively — exact background
color match, confirmed the constellation is actually drawing distinct
colors (not blank), confirmed the scroll section and all 3 stage cards
render, zero console errors beyond the expected sandbox-only camera/model
limitations. But true aesthetic judgment — does it actually look
fabulous — needs your own eyes on your own browser first, the same way
anything camera-dependent always has.

## Notes on recording

- Don't worry about making all 10 reps of a sign identical — natural,
  slightly varied repetitions actually help the recognition engine
  generalize better than 10 identical ones would.
- Record in the same lighting/background you plan to demo in if possible —
  we found background and lighting genuinely affect tracking quality.
- Use the **↻ Replay** button in the review panel to watch a recording
  again as many times as you want before deciding to Keep or Discard it.

### Important fix: sequence-level normalization

Recordings are now normalized using ONE fixed reference point and scale for
the entire recording, computed once it's finished — not recalculated fresh
on every single frame. An earlier version normalized frame-by-frame, which
silently erased any sign involving real hand translation (like "Hello,"
where the hand moves away from the head) — the hand's shape relative to
itself looked identical whether near the head or far away, so playback
looked frozen even though the recording had captured real motion. Raw
landmarks are now captured live during recording, and normalization happens
once in `normalizeSequence()` right when a recording finishes.

## General notes (both phases)

- The hand-tracking engine itself runs fully locally (it's bundled in the
  `public/wasm` folder), so once the page has loaded, it does not depend on
  an internet connection for the tracking itself.
- The one exception is the very first page load: the actual hand-tracking
  model file (around a few MB) is downloaded from Google's free, public
  model hosting the first time you run the app. After that, your browser
  will typically cache it. If the page shows "Could not load the hand
  tracking model," check your internet connection and reload.
- Use Chrome or Edge for testing — they have the most reliable webcam and
  WASM support. Safari can be inconsistent with camera permissions.
- If the skeleton looks laggy, try closing other apps using the camera or
  heavy background processes, and check the FPS counter in the corner —
  anything consistently above ~20 FPS should feel smooth enough for the
  recognition phases that come next.

## Project structure

```
src/
  components/
    HandTracker.jsx      — Phase 1: camera feed, detection loop, skeleton, FPS
    RecordingTool.jsx     — Phase 2: sign picker, countdown, recording, review
    SkeletonPlayback.jsx  — Phase 2: animated replay of a saved recording
    StatusBanner.jsx      — Phase 1: the status message shown at any time
  hooks/
    useHandLandmarker.js  — loads the MediaPipe model once (GPU with CPU fallback)
  lib/
    camera.js             — shared camera constraints
    normalize.js          — landmark normalization math (position + scale independence)
    vocabulary.js         — the fixed 25-sign list
    recordingStorage.js   — IndexedDB storage + JSON export
  App.jsx                 — top-level page layout, tab switcher
public/
  wasm/                   — the local hand-tracking engine files
```
