"""Minimal .env loader using only the standard library.

Reads ``isl-backend/.env`` (if present) and fills in any variables that are
not already set in the real environment, so container- or shell-provided
secrets always win. No third-party package needed.
"""

import os

_loaded = False


def load_env() -> None:
    """Load key=value pairs from isl-backend/.env into os.environ (once)."""
    global _loaded
    if _loaded:
        return
    _loaded = True

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(base_dir, ".env")
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        return

    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value
