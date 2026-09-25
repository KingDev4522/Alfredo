"""Local dev backend: same HTTP/WS routes as main.py, no GPU/Whisper/T5 downloads.

main.py's lifespan loads Whisper large-v3 + FLAN-T5 (multi-GB, needs torch/CUDA).
This server mounts the same routers (database, pose_import, documents, media,
text_input, stream) but:
- uses a whitespace fallback chunker when the HF tokenizer/model is unavailable
- serves Translate/WS from the gloss database directly (no T5 inference)
- leaves whisper_model=None (YouTube transcription returns a clear 503)

Run from repo root:  isl-backend\\venv\\Scripts\\python.exe isl-backend\\local_server.py
(cwd may be repo root or isl-backend/; BASE_DIR handling covers both).
"""
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import database, pose_import, text_input, documents, media, stream
import utils.splitter as splitter
import utils.ai_pipeline as ai_pipeline


def _simple_chunks(text: str, max_tokens: int = 400, overlap: int = 50):
    text = (text or "").strip()
    if not text:
        return []
    words = text.split()
    # ~4 chars ~= 1 token heuristic; keeps chunks small without any download.
    max_chars = max(50, max_tokens * 4)
    chunks, cur = [], ""
    for w in words:
        if len(cur) + len(w) + 1 > max_chars and cur:
            chunks.append(cur.strip())
            cur = ""
        cur = (cur + " " + w).strip()
    if cur.strip():
        chunks.append(cur.strip())
    return chunks or [text]


_orig_split = splitter.recursive_token_splitter


def _safe_split(text: str, max_tokens: int = 400, overlap: int = 50):
    try:
        return _orig_split(text, max_tokens, overlap)
    except Exception as e:
        print(f"[local_server] tokenizer unavailable ({e}); whitespace fallback.", flush=True)
        return _simple_chunks(text, max_tokens, overlap)


# Patch the canonical module AND the already-bound names in importing routers
# (each router did `from utils.splitter import recursive_token_splitter`).
splitter.recursive_token_splitter = _safe_split
for _mod in (documents, media, text_input):
    if hasattr(_mod, "recursive_token_splitter"):
        setattr(_mod, "recursive_token_splitter", _safe_split)


async def _fallback_translate(text_chunk: str, translator=None):
    """Yield pose payloads using the gloss DB directly (no T5 model)."""
    words = (text_chunk or "").strip().upper().split()
    gloss_db = ai_pipeline.load_json(os.path.join(BACKEND_DIR, "gloss_poses.json"))
    fingerspell_db = ai_pipeline.load_json(os.path.join(BACKEND_DIR, "fingerspell_poses.json"))
    DIGIT_WORDS = {
        "0": "ZERO", "1": "ONE", "2": "TWO", "3": "THREE", "4": "FOUR",
        "5": "FIVE", "6": "SIX", "7": "SEVEN", "8": "EIGHT", "9": "NINE",
    }
    expanded = []
    for word in words:
        clean = word.strip(".,!?\"'").upper()
        if not clean:
            continue
        if clean in gloss_db:
            expanded.append(clean)
        elif clean.isdigit() and all(ch in DIGIT_WORDS for ch in clean):
            expanded.extend(DIGIT_WORDS[ch] for ch in clean)
        else:
            parts = clean.split("_")
            if len(parts) > 1 and all(p in gloss_db for p in parts):
                expanded.extend(parts)
            else:
                expanded.append(clean)
    if not expanded and (text_chunk or "").strip():
        expanded = (text_chunk or "").strip().upper().split()
    for clean_word in expanded:
        if clean_word in gloss_db:
            yield {
                "gloss_word": clean_word,
                "frames": ai_pipeline._serve_clear(gloss_db[clean_word]),
                "duration_ms": 33,
                "is_fingerspelling": False,
            }
        else:
            print(f"[local_server] '{clean_word}' not in DB; fingerspell fallback.", flush=True)
            combined = []
            for char in clean_word:
                if char in fingerspell_db and fingerspell_db[char]:
                    combined.extend(fingerspell_db[char])
            yield {
                "gloss_word": clean_word,
                "frames": combined,
                "duration_ms": 33,
                "is_fingerspelling": True,
            }


stream.translate_and_generate_poses = _fallback_translate

app = FastAPI(title="ISL Interpreter Backend - local no-ML mode")
app.state.whisper_model = None  # YouTube path needs full main.py + whisper
app.state.translator = ("local-fallback", None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(media.router)
app.include_router(stream.router)
app.include_router(pose_import.router)
app.include_router(text_input.router)
app.include_router(database.router)


@app.get("/")
async def root():
    return {"message": "ISL Interpreter Backend API is running.", "mode": "local-no-ml"}


@app.get("/health")
async def health():
    return {"status": "ok", "mode": "local-no-ml"}


if __name__ == "__main__":
    import uvicorn

    os.chdir(BACKEND_DIR)  # pose_import.py uses relative json paths
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
