"""Tiny in-process token-bucket rate limiter (stdlib only).

Protects the paid LLM routes (/api/sentence, /api/translate) from one client
burning the shared Groq/Gemini quota for everyone. Per (route, client IP):
a bucket holds BURST tokens, refilling at PER_MINUTE/60 per second. Empty
bucket -> 429 with Retry-After; the frontend already treats non-2xx as
"fall back to literal words", so speech never breaks under limit.

Tuning via isl-backend/.env:
  RATE_LIMIT_PER_MINUTE (default 30) — sustained rate per route per IP.
  RATE_LIMIT_BURST      (default 8)  — instant burst before limiting bites.

Limits: single-process memory. Under multi-worker uvicorn each worker keeps
its own buckets (limits effectively multiply by worker count) — acceptable
for localhost; a shared Redis bucket would be the next step if hosted.
Stale entries are swept lazily on each check.
"""

import os
import threading
import time

_buckets = {}
_lock = threading.Lock()
_LAST_SWEEP = [0.0]


def _settings():
    try:
        per_min = max(1.0, float(os.environ.get("RATE_LIMIT_PER_MINUTE", "30")))
    except ValueError:
        per_min = 30.0
    try:
        burst = max(1.0, float(os.environ.get("RATE_LIMIT_BURST", "8")))
    except ValueError:
        burst = 8.0
    return per_min, burst


def check(route: str, client_ip: str):
    """Return (allowed: bool, retry_after_s: float). Never raises."""
    try:
        per_min, burst = _settings()
        now = time.monotonic()
        key = (route, client_ip or "unknown")
        with _lock:
            # Lazy sweep: drop buckets idle >10 min so memory can't grow.
            if now - _LAST_SWEEP[0] > 60:
                _LAST_SWEEP[0] = now
                for k in [k for k, (_, upd) in _buckets.items() if now - upd > 600]:
                    del _buckets[k]
            tokens, updated = _buckets.get(key, (burst, now))
            tokens = min(burst, tokens + (now - updated) * (per_min / 60.0))
            if tokens >= 1.0:
                _buckets[key] = (tokens - 1.0, now)
                return True, 0.0
            deficit = 1.0 - tokens
            retry_after = deficit / (per_min / 60.0)
            _buckets[key] = (tokens, now)
            return False, retry_after
    except Exception:
        return True, 0.0
