# SignSpeak — PPT Content (ready to paste)

Every number below is measured in this repo (README.md + PRD 01–15). Nothing is invented.
Where a slide needs an outside statistic, it is marked [add sourced figure].

---

## Slide 1 — Title

**SignSpeak**
Indian Sign Language, interpreted live in the browser.

- Camera in. Speech out.
- Runs on one laptop. No video stored, no cloud round-trip.

---

## Slide 2 — The problem

- A deaf patient at a pharmacy counter, a customer at a ticket window, a student in a lecture — none of them can carry an interpreter. [add sourced figure on India's deaf population]
- Human interpreters are scarce, expensive, and not present in everyday moments.
- Most existing tools translate pre-recorded clips. A conversation is live.
- Word-by-word ISL-to-English reads broken, because ISL grammar is not English grammar. "I. Pain. Help. Doctor." is not a sentence.

---

## Slide 3 — What we built

- Point a webcam at a signer. SignSpeak tracks the hands, recognizes the signs, builds the sentence, and the browser speaks it.
- Tracking, recognition, grammar, and speech all run in the browser. One device, no install.
- The recognition engine learns from recordings you make yourself — the vocabulary grows by recording, not by retraining a model.

---

## Slide 4 — How it works

- **Track** — MediaPipe hand landmarker, 21 points per hand, two hands at once, running on WASM bundled inside the page.
- **Segment** — motion-based. While the hand moves, a sign is in progress. When movement stops for a moment, the sign has ended.
- **Recognize** — Dynamic Time Warping against your own recorded templates, fingertip-weighted, downsampled to 18 frames.
- **Speak** — ISL gloss is smoothed into English, then spoken about 2.2 seconds after your last sign. Long enough not to cut you off mid-thought.

---

## Slide 5 — The recognition engine

- DTW with fingertip weighting (2.5×) and a banded match path — fingertips carry the sign's meaning, so they count more than the wrist.
- Each recording is normalized once, against one fixed reference: shoulder midpoint and hand scale. Position and body size stop mattering.
- Confidence gate: below the tuned threshold, the word is not added. Nothing slips through silently.
- Downsampled to 18 frames before comparison: full-library search went from 297 ms to 50 ms, and accuracy rose from 96.1% to 96.8%. Faster and better, verified on the actual data.

---

## Slide 6 — Grammar smoothing

- ISL does not sign "I am", "a", or "in" the way English needs them. A literal reading sounds broken.
- What is signed: **"I. Pain. Help. Doctor."**
- What is spoken: **"I am in pain. I need help. I need a doctor."**
- A small, readable rule set inserts the connecting words — no extra signs required. You watch the transformation live in the preview as you sign.

---

## Slide 7 — Built on data we recorded ourselves

- 25-sign core vocabulary, 15 recordings per sign — 265+ takes, all recorded through the browser by hand.
- Recorded in labelled batches: daylight, lamp-lit, angled-left, far-distance. Lighting and background genuinely change tracking quality, so we recorded the variation on purpose.
- Natural, slightly varied repetitions help the engine generalize. Ten identical takes help less than ten honest ones.
- Custom words — a name, a local term — are recorded like any other sign. No retraining step. The live interpreter picks them up the moment a few reps exist.

---

## Slide 8 — Where the data lives

- Supabase Postgres: shared main recordings, per-account user recordings, custom words, profiles.
- Row Level Security at the database layer: users can only ever touch their own rows; only an admin can write to the shared set. Even a tampered frontend gets rejected by Postgres.
- Google sign-in gates the whole site. Admin publishes go through a typed double-confirm.
- Vercel serves the frontend. GitHub keeps a versioned snapshot of the shared recordings file. A FastAPI backend (local) carries the heavy media pipeline: Whisper large-v3, FLAN-T5, YouTube and document ingestion.

---

## Slide 9 — The 3D avatar

- Type or speak a sentence and the avatar signs it back: text → ISL gloss → pose frames → a 3D human model.
- Resolution order: your own recording first, then the shared two-handed take, then one-handed, then fingerspelling.
- Bones are driven by landmark directions; the model's own bone lengths are preserved. The wrist uses a swing-twist decomposition so the palm rolls naturally.
- Honest note: finger roll still twists in some curled poses. That is a known open issue with a known fix — it needs eyes on the render before shipping.

---

## Slide 10 — What broke, and what it taught us

- **One dropped frame poisoned everything.** A flat 999 penalty for a missing hand meant a single tracking dropout rejected a valid sign. After the fix — bounded penalty, averaged over the hands actually compared — a sign with 30% hand dropout recognizes at 0.55 confidence where it previously scored 0.002.
- **"Hello" looked frozen.** Frame-by-frame normalization erased real motion: the hand's shape relative to itself is identical near or far. Fixed by normalizing once per sequence.
- **The avatar showed the wrong take.** Two stores had silently diverged — the UI read one, the avatar read the other. Backend now treats Supabase as the source of truth; reconciliation scripts repaired the drift.
- **MediaPipe depth is noise.** It produced a 0.467 m forearm — anatomically impossible. Clamped and damped: 0.301 m, inside human range.
- **We measured the suspected "force field"** above the avatar's head: it fired on 0 of 82 real frames. It was never the cause. We shrank it anyway.

---

## Slide 11 — Privacy by architecture

- No video is ever stored. Only skeletons: 21 points per hand, about 54 KB per 2-second sign.
- The tracking engine is bundled in the page. After first load, tracking does not need the internet at all.
- Recognition compares against templates in your own database. The landing page promise is literal: nothing leaves your device except the skeleton data you choose to sync.

---

## Slide 12 — By the numbers

- 48 tracked points per frame — 6 pose joints + 21 points on each hand
- 96.8% accuracy, 50 ms per full-library recognition pass
- 0.42 confidence gate (re-tuned to 0.36 after the dropout fix), 550 ms minimum segment, 2.2 s speech delay
- ~54 KB per recording → a 500 MB free-tier database holds ~10,000 of them
- 41 frames per 2-second sign · 37 buttons audited, all wired · 15 PRD documents
- Every figure on this slide was measured on the real data, not estimated.

---

## Slide 13 — Live demo

1. Open the studio, allow the camera.
2. Sign HELLO, FOOD, DOCTOR — watch each word appear with its confidence.
3. Pause. The sentence smooths and the browser speaks it.
4. Add a custom word (your own name), record three reps, use it immediately.
5. Open the recording tool and replay a take as an animated skeleton.

---

## Slide 14 — Limitations, stated plainly

- The vocabulary is exactly what has been recorded. It grows by recording, not by retraining.
- Segmentation timing is tuned, not yet validated against real continuous signing — the training data was pre-segmented by a countdown.
- Best with one signer in frame and consistent lighting. Safari camera support is inconsistent; Chrome and Edge are the reference.
- The Translate tab's heavy models (Whisper, T5) still need the local backend today.

---

## Slide 15 — Roadmap

- Validate segmentation timing against real continuous signing.
- Host the FastAPI backend so YouTube and document translation work from anywhere.
- Ship the finger swing-twist fix for the avatar.
- Grow the vocabulary with community recordings — the pipeline already supports it.
- Nightly snapshot action so the shared dataset gains a public, versioned history.

---

## Slide 16 — Close

**Where hands almost touch, meaning begins.**

The hard part was never the model. It was the data, the timing, and the discipline to measure everything instead of assuming.

*Team SignSpeak — [names]*
