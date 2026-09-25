"""Lazy, offline-safe loading for the heavy inference models.

Two problems made the backend unstartable:

1. ``main.py`` loaded Whisper large-v3 (~3GB) and FLAN-T5 (~1GB) in the
   FastAPI lifespan, blocking the whole API until both downloads finished.
2. On networks where HuggingFace file hosts are unreachable, those downloads
   can never finish -- the server never comes online, and any endpoint that
   touches a model hangs forever.

This module loads each model on first use and caches it on ``app.state``:

- Whisper model name comes from the ``WHISPER_MODEL`` env var, defaulting to
  ``"base"`` (the size cached locally). Set ``WHISPER_MODEL=large-v3`` on a
  machine with working HuggingFace access to get the original quality back.
- Before constructing a model, the local cache is probed with
  ``local_files_only=True``. If the files are not cached, a clear
  ``ModelUnavailableError`` is raised immediately instead of hanging on a
  download that cannot complete.
"""

import os
import threading

import torch
from faster_whisper import WhisperModel
from huggingface_hub import hf_hub_download
from transformers import AutoTokenizer

from utils.splitter import get_t5_model_and_tokenizer

WHISPER_REPO_PREFIX = "Systran/faster-whisper-"
T5_MODEL_ID = "google/flan-t5-base"

_whisper_lock = threading.Lock()
_translator_lock = threading.Lock()


class ModelUnavailableError(RuntimeError):
    """Raised when a model is not cached locally and cannot be downloaded."""


def whisper_model_name() -> str:
    """Configured Whisper size; ``base`` is the one cached on this machine."""
    return os.environ.get("WHISPER_MODEL", "base")


def _whisper_repo_id(name: str) -> str:
    # A local directory path is used as-is; otherwise map a size alias
    # ("base", "large-v3", ...) to its faster-whisper Hub repo.
    if os.path.isdir(name) or os.path.sep in name:
        return name
    return name if "/" in name else WHISPER_REPO_PREFIX + name


def get_whisper_model(app) -> WhisperModel:
    """Return the shared WhisperModel, loading it on first call.

    Raises ModelUnavailableError immediately if the model is not cached
    locally, instead of hanging on an uncompletable download.
    """
    if app.state.whisper_model is None:
        with _whisper_lock:
            if app.state.whisper_model is None:
                name = whisper_model_name()
                repo = _whisper_repo_id(name)
                if not os.path.isdir(repo):
                    try:
                        hf_hub_download(repo, "model.bin", local_files_only=True)
                    except Exception:
                        raise ModelUnavailableError(
                            f"Whisper model '{name}' is not cached locally and cannot "
                            f"be downloaded here. Cached options work offline; set "
                            f"WHISPER_MODEL to a cached size."
                        )
                device = "cuda" if torch.cuda.is_available() else "cpu"
                compute_type = "int8_float16" if device == "cuda" else "int8"
                print(
                    f"Loading WhisperModel '{name}' on {device} ({compute_type})...",
                    flush=True,
                )
                app.state.whisper_model = WhisperModel(
                    name, device=device, compute_type=compute_type
                )
                print("WhisperModel loaded successfully.", flush=True)
    return app.state.whisper_model


def get_translator(app):
    """Return the shared FLAN-T5 ``(tokenizer, model)``, loading on first call.

    Raises ModelUnavailableError immediately if FLAN-T5 is not cached
    locally, instead of hanging on an uncompletable download.
    """
    if app.state.translator is None:
        with _translator_lock:
            if app.state.translator is None:
                try:
                    AutoTokenizer.from_pretrained(
                        T5_MODEL_ID, local_files_only=True
                    )
                except Exception:
                    raise ModelUnavailableError(
                        f"FLAN-T5 ('{T5_MODEL_ID}') is not cached locally and cannot "
                        f"be downloaded here. Text-to-gloss translation is "
                        f"unavailable; pose lookup falls back to the input words."
                    )
                print("Loading FLAN-T5 Pipeline...", flush=True)
                app.state.translator = get_t5_model_and_tokenizer()
                print("FLAN-T5 Pipeline loaded successfully.", flush=True)
    return app.state.translator
