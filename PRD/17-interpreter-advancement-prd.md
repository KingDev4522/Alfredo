# PRD 17 — Interpreter Advancement: AI Sentence Formation + Hindi Translation + Lazy Model Loading

> Date: 2026-09-25. Status: implemented in working tree, tested, NOT committed/pushed.
> Scope: sentence formation + Hindi translation ONLY (+ the lazy-loading prerequisite that makes the backend start reliably).
> Audience: teammate with an existing checkout of this same project who needs to add these features to their copy.

## 1. What this delivers

1. **AI sentence formation (interpreter tab):** hardcoded grammar first (instant, offline); when any word has no grammar rule, frontend calls `POST /api/sentence` (Groq → Gemini fallback chain). Any failure falls back to literal words — speech never breaks.
2. **Hindi translation toggle:** `Hindi: On/Off` button in `LiveInterpreter`. When ON, the finished English sentence is translated via `POST /api/translate` and spoken with a `hi-IN` voice. Any failure speaks English instead.
3. **Backend starts reliably:** Whisper + FLAN-T5 load lazily on first use (previously blocked startup 10+ min / hung forever when HuggingFace unreachable). Document/text chunking works offline via word-count shim.

## 2. File inventory (exact)

### 2.1 New files (4 — copy these verbatim)

| File | Purpose |
|---|---|
| `isl-backend/routers/sentence.py` | `POST /api/sentence` + `POST /api/translate`, provider/model fallback chains, coverage + Devanagari guards, in-memory cache, cp1252-safe logging |
| `isl-backend/utils/env_loader.py` | stdlib-only `.env` loader; reads `isl-backend/.env`, real environment always wins |
| `isl-backend/utils/model_registry.py` | lazy cached `get_whisper_model(app)` / `get_translator(app)`; raises `ModelUnavailableError` immediately when not cached locally instead of hanging on download |
| `src/lib/sentenceAI.js` | `buildSpokenPhrasesWithAI()` + `translateToHindi()`; 20s `AbortSignal.timeout`; Devanagari + degenerate-reply validation; warn-and-fallback, never throws to speech path |

### 2.2 Modified files (8)

| File | Change |
|---|---|
| `isl-backend/main.py` | remove eager Whisper + FLAN-T5 load from lifespan; init `app.state.* = None`; `include_router(sentence.router)`; re-export `get_translator, get_whisper_model` |
| `isl-backend/routers/media.py` | background task takes `request.app`, resolves Whisper via `get_whisper_model(app)` inside task; `ModelUnavailableError` logs + returns instead of hanging |
| `isl-backend/routers/stream.py` | resolves translator once per WS connection via `get_translator()`; `None` translator → pipeline animates input words directly |
| `isl-backend/utils/ai_pipeline.py` | `translator=None` → skip T5 inference, use input words; translation exceptions → log + use input words |
| `isl-backend/utils/splitter.py` | add `T5_MODEL_ID`, `_WordTokenizer` shim, `get_split_tokenizer()` (real tokenizer if cached else word-counts); `_split_with_overlap` uses it (chunking works offline) |
| `src/components/LiveInterpreter.jsx` | async `speakSentence()` (grammar → AI → Hindi translate → `hi-IN` voice → transcript stores spoken text); `hindiEnabled` state+ref; `pickHindiVoice()`; `Hindi: On/Off` button |
| `src/lib/sentenceGrammar.js` | `buildSpokenPhrases(signIds, { autoGrammar, fallbackOut })`; new rule `WHERE+HOW+YOU` (any order) → `Where and how are you?`; unmatched words pushed to `fallbackOut` so caller knows AI is needed |
| `isl-backend/requirements.txt` | add `huggingface_hub` (direct import in `model_registry.py`, was only transitive) |

### 2.3 Data files (side effect, keep yours)

`isl-backend/database/recordings.json` and `isl-backend/gloss_poses.json` show as modified in this tree from local recording activity — NOT part of this feature. Do not copy them over your copy unless you intend to take the recordings too.

## 3. Backend behavior

### 3.1 Lazy loading (`model_registry.py`, `main.py`)

- `WHISPER_MODEL` env (default `"base"` — the size cached on this machine). Set `WHISPER_MODEL=large-v3` only on machines with working HuggingFace access.
- Probe-before-load with `local_files_only=True` (`hf_hub_download(repo, "model.bin")` / `AutoTokenizer.from_pretrained(T5_MODEL_ID, local_files_only=True)`). Missing → `ModelUnavailableError` immediately.
- `T5_MODEL_ID = "google/flan-t5-base"`.

### 3.2 Sentence + translate endpoints (`routers/sentence.py`)

Base URL: `http://127.0.0.1:8000` (see §6). Router has no prefix; full paths below.

**POST /api/sentence**

- Request: `{ "words": ["WHERE","HOW","YOU"] }` (non-empty list, capped to first 40).
- Success 200: `{ "sentence": "Where and how are you?", "provider": "groq", "model": "openai/gpt-oss-20b", "cached": false }`.
- Errors: `400` empty list; `503` no key or every model failed (frontend then speaks literal words).
- Cache: in-memory `dict` keyed `tuple(w.upper() for w in words)`; repeat (case-insensitive) returns `cached:true` without LLM call. Process-local, lost on restart, unbounded (known limitation).

**POST /api/translate**

- Request: `{ "text": "I need water." }` (non-empty, capped to 500 chars).
- Success 200: `{ "translation": "<Devanagari>", "provider": "groq", "model": "...", "cached": false }`.
- Errors: `400` empty; `503` every model failed (frontend then speaks English).
- Cache: key `text.lower()`. Translation accepted ONLY if it contains Devanagari (`[\u0900-\u097F]`); echoed English/fragments rejected to next model.

**Fallback chain (both endpoints, same order)**

1. Providers in `SENTENCE_PROVIDER_ORDER` (default `groq,gemini`), left to right.
2. Within provider, models in `GROQ_MODELS` / `GEMINI_MODELS` left to right, first answer wins:
   - Groq default: `openai/gpt-oss-20b, qwen/qwen3.8-27b, openai/gpt-oss-120b`
   - Gemini default: `gemini-3.7-flash, gemini-3.6-flash, gemini-3.5-flash-lite`
3. Per-model: `401/403` (bad key) skips rest of that provider; `404/429/5xx`/timeout/empty → next model. Sentence replies must also pass `_covers()` (every gloss word represented; `WHERE HOW YOU` → `How are you?` rejected, `HELLO` → `, is` rejected) or next model is tried.
4. Timeouts: `SENTENCE_TIMEOUT_S` default `8` (min 2) per model call; `SENTENCE_MAX_TOKENS` default `60` (min 16).
5. Transport: stdlib `urllib` only (no new deps). Groq sends `User-Agent: ISL-Interpreter/1.0` (required — Cloudflare rejects default urllib UA with 403/1010).

### 3.3 Crash fix (Windows)

All success/reject logs route through `_for_log()` (`sentence.py:38`). Raw `{translation!r}` / `{sentence!r}` in logs raised `UnicodeEncodeError` on cp1252 consoles *after* a successful Hindi translation — fixed at lines 228/400. Do not log raw model text with `print()` on Windows.

## 4. Frontend behavior

### 4.1 Speech flow (`LiveInterpreter.jsx:speakSentence`)

1. Grammar first: `buildSpokenPhrasesWithAI(current, { autoGrammar: true })` when toggle on, else `buildSpokenPhrases(current, { autoGrammar: false })`.
2. `phrasesToSpeechText()` → English text.
3. If Hindi ON and text non-empty: `await translateToHindi(text)`; ANY throw → warn + keep English.
4. `new SpeechSynthesisUtterance(spokenText)`; when Hindi was actually produced: `utterance.lang = "hi-IN"` + `pickHindiVoice()` (exact `hi-in` → any `hi*` → default voice).
5. `speechSynthesis.cancel(); speak(utterance)`; transcript stores `spokenText` (Hindi when toggle on) with `HH:MM` timestamp; sentence cleared so next trigger doesn't re-speak.

### 4.2 Gate (`sentenceAI.js`)

- AI called ONLY when `autoGrammar=true` AND `fallbackOut.length > 0` (grammar missed ≥1 word). Grammar-covered sentences and `autoGrammar=false` never hit the network.
- `AI_TIMEOUT_MS = 20000` total cap via `AbortSignal.timeout`. Sentence replies without `[A-Za-z]{2,}` rejected; Hindi replies without Devanagari rejected. All failures → `{ phrases: <grammar>, aiUsed: false }`.
- URLs: `${VITE_API_BASE}/api/sentence`, `${VITE_API_BASE}/api/translate` (`VITE_API_BASE` empty → same-origin; must be `http://localhost:8000` in local dev — see §6).

### 4.3 Grammar (`sentenceGrammar.js`)

- Rules: `WHAT+NAME+YOU` (any order) → `What is your name?`; `WHERE+HOW+YOU` → `Where and how are you?`; `where+you` / `how+you` pairs; `SUBJECT + STATE (pain/hungry)` → `I am …`; `SUBJECT + NEED (water/food/help/doctor)` → `I need …`; lone state/need assumes `I`; everything else literal `Capitalize(word)` + recorded in `fallbackOut`.

## 5. API keys + env (exact)

### 5.1 `isl-backend/.env` (create locally — NEVER commit; already gitignored via `.gitignore:5`)

```ini
# Sentence + Hindi LLM chain (at least ONE provider key required for AI features;
# app still runs/speaks offline on grammar + literal fallback with zero keys)
GROQ_API_KEY=gsk_your_groq_key_here
GEMINI_API_KEY=AIza_your_gemini_key_here

# Optional — defaults shown
SENTENCE_PROVIDER_ORDER=groq,gemini
GROQ_MODELS=openai/gpt-oss-20b,qwen/qwen3.8-27b,openai/gpt-oss-120b
GEMINI_MODELS=gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash-lite
SENTENCE_TIMEOUT_S=8
SENTENCE_MAX_TOKENS=60

# Optional — Whisper size (default "base" = locally cached; use large-v3 only with HF access)
WHISPER_MODEL=base
```

- Where keys come from: Groq Console → API Keys (`gsk_…`); Google AI Studio → API key (`AIza…`). No other signup needed.
- Loader: `utils/env_loader.py` reads `isl-backend/.env` once; real environment variables always win over the file.
- Verify without leaking: `py -c "import os; print(len(os.environ.get('GROQ_API_KEY','')))"` after `load_env()` — expect non-zero lengths, never print values.

### 5.2 Frontend `.env.local` (root — NEVER commit; needs `VITE_API_BASE`)

```ini
VITE_API_BASE=http://localhost:8000
VITE_API_URL=http://localhost:8000/api/db
VITE_WS_URL=ws://localhost:8000/ws/stream
```

Restart Vite after creating/editing (Vite reads `VITE_*` at startup). Template lives in `.env.example`.

## 6. Run instructions

**Backend (Windows)**

```powershell
cd isl-backend
py -m pip install -r requirements.txt   # picks up huggingface_hub
py run_server.py                        # serves main:app on http://127.0.0.1:8000
# detached alternative: py launch_backend.py  (logs server_stdout.log / server_stderr.log)
```

**Frontend**

```powershell
npm install
npm run dev     # + .env.local above; restart after env changes
npm run build   # must pass (~4s); chunk-size warnings are pre-existing
npx oxlint src/components/LiveInterpreter.jsx src/lib/sentenceAI.js src/lib/sentenceGrammar.js  # expect 0 errors
```

## 7. Migration guide (teammate with existing checkout of THIS project)

1. **Take the files:** copy the 4 new files (§2.1) verbatim; apply the 8 modified files (§2.2) hunk-by-hunk — do NOT overwrite your `recordings.json` / `gloss_poses.json`. Easiest: `git fetch` this branch and `git checkout <branch> -- <each path>`, then resolve conflicts in `main.py` / `LiveInterpreter.jsx` only (both are additive).
2. **Deps:** `py -m pip install -r isl-backend/requirements.txt` (new: `huggingface_hub`). No `npm` changes.
3. **Env:** create `isl-backend/.env` from §5.1 template (paste your own keys); ensure root `.env.local` has `VITE_API_BASE=http://localhost:8000`; restart backend + Vite.
4. **Verify:** `py -m py_compile main.py routers/sentence.py utils/env_loader.py utils/model_registry.py` → exit 0; `POST /api/sentence {"words":[]}` → 400; with no keys `POST /api/sentence {"words":["HELLO"]}` → 503 (not crash); with keys `POST /api/sentence {"words":["WHERE","HOW","YOU"]}` → 200 `Where and how are you?`; `POST /api/translate {"text":"I need water."}` → 200 Devanagari; UI: sign words → preview → Speak now (English), toggle Hindi ON → Speak now (Hindi voice), kill network → still speaks literal English.

## 8. Test evidence (this tree, 2026-09-25)

- `py -m py_compile` on all touched backend files: exit 0.
- Unit: `_covers` 7/7 pass (incl. `WHERE HOW YOU` accept/reject, `THANK_YOU`, `GOOD_BAD` choice, fragment reject); `_clean_sentence` pass; `_for_log(Hindi)` cp1252-encodable while raw `repr(Hindi)` raises `UnicodeEncodeError` (proves the log fix).
- API via `TestClient`: empty → 400; no-key → 503 with correct `detail`; mocked provider → 200 + `cached:true` on case-insensitive repeat with 1 provider call.
- Frontend: `oxlint` on 3 touched files 0 errors (3 pre-existing warnings elsewhere); `vite build` success 4.33s.

## 9. Known limitations (not fixed here)

- Caches are process-local, unbounded, no TTL — restart clears; long-running servers grow slowly.
- `_covers()` matches multi-letter tokens as substrings (`pain` ⊂ `painting`) — acceptable for current vocab, revisit with stemming if vocab grows.
- Worst-case speech latency is serial: sentence-AI (≤20s) then translate (≤20s). Grammar path stays instant.
- Hindi voice depends on OS/browser (`hi-IN` present on most Chrome/Edge; otherwise default voice speaks Devanagari text).
- `transcriptHistory` stores spoken text only; `aiUsed`/provider/model not surfaced in UI (returned by API, ignored by component).
