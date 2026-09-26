# Alfredo

**Your hands have a voice now.**

Alfredo is an on-device Indian Sign Language interpreter. Point a webcam at a signer and it tracks hands, recognizes signs, builds sentences, and speaks them. All in the browser.

Live: `https://alfredo-seven.vercel.app`

## Problem

Deaf signers in India cannot carry a human interpreter everywhere. At a pharmacy, ticket counter, classroom, or hospital, no interpreter is available on demand. Human interpreters are scarce and costly. Most existing tools work only on prerecorded video, while real conversation is live. Direct word by word translation also fails because ISL grammar differs from English grammar.

Alfredo solves this with one laptop and one camera. No cloud video. No install.

## Product

### Live Interpret
Sign naturally with no buttons or countdowns.
- Track: MediaPipe Hand Landmarker, 21 points per hand, two hands, local WASM
- Segment: motion based detection of sign boundaries
- Recognize: template matching against your own recordings, fingertip weighted, 18 frame sampling
- Speak: grammar smoothing converts gloss to natural English, spoken after a short pause or on demand
- Confidence gating: uncertain signs show as not recognized, never as wrong words
- Hindi toggle with Hindi voice output

### Record Signs
Grow vocabulary by recording, not by retraining.
- 25 sign core set with per sign progress tracking
- Custom words supported for names and local terms
- Countdown capture with skeleton replay and Keep or Discard review
- Batch labels for lighting and angle variation
- Local IndexedDB storage with JSON export and merge support
- Single reference normalization per recording for stable motion

### AI Language Layer
Backend sentence and translation API with Gemini API and Groq fallback.
- Sentences from words: converts ISL gloss to natural English and fills missing grammar
- Letters to words: reconstructs incomplete fingerspelling and split combined tokens using context
- English to Hindi translation in Devanagari script
- Cached responses with offline grammar fallback so speech never breaks

### Signing Avatar
Two way communication. Type or speak a sentence and the 3D avatar signs it back using recorded poses with fallback to shared takes and fingerspelling.

### Media Translation
Optional local backend for YouTube and document ingestion with Whisper transcription and translation into signable sentences.

## Privacy

- No video stored. Only hand skeletons, about 54KB per sign
- Tracking runs on device. Works offline after first load
- Supabase Postgres with Row Level Security. Users access only their own data
- Google sign in with admin controlled shared dataset

## Tech Stack

Frontend: React, Vite, Tailwind CSS, React Router, GSAP, Lenis
Vision: MediaPipe Tasks Vision, WebAssembly, Web Speech API
3D: Three.js, React Three Fiber, Drei, Spline
Backend: Python, FastAPI, faster-whisper, FLAN-T5, Gemini API, Groq
Data: Supabase Postgres, Supabase Auth, IndexedDB, LocalStorage
Hosting: Vercel, GitHub

## Run Locally

Requirements: Node.js 18 or higher.

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in Chrome or Edge and allow camera access.

### Backend (optional)

Required only for AI sentences, Hindi translation, and media features. Requires Python 3.10 or higher.

```bash
cd isl-backend
pip install -r requirements.txt
python run_server.py
```

Create `isl-backend/.env`:

```ini
GROQ_API_KEY=gsk_your_key
GEMINI_API_KEY=AIza_your_key
SENTENCE_PROVIDER_ORDER=groq,gemini
WHISPER_MODEL=base
```

Set frontend `.env.local`:

```ini
VITE_API_BASE=http://localhost:8000
```

The app runs offline without keys using local grammar fallback.

## Structure

```text
src/components   Camera, recording, interpreter, avatar, review tools
src/lib          Segmentation, normalization, grammar, sentence AI, vocabulary
src/landing      Marketing sections and layout
src/pages        Landing, login, studio
isl-backend/routers  Sentence, documents, media, stream, database
isl-backend/utils    Models, chunking, pipeline, env, rate limit
public/wasm      Local tracking engine
supabase         Schema and policies
PRD              Design and status docs
```

## Status

- Accuracy 96.8 percent on recorded data
- Full library search about 50ms
- 25 signs, 265 plus recordings
- Best with one signer and steady lighting. Chrome or Edge recommended.

## Roadmap

- Validate segmentation on continuous signing
- Host backend for remote media translation
- Improve avatar finger articulation
- Expand vocabulary with community recordings
