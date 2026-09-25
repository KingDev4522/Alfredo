import sys
import os
import traceback

print("Initializing backend server in run_server.py...", flush=True)

try:
    import uvicorn
    from uvicorn.server import Server
    
    # Disable uvicorn's signal re-raising on Windows which causes abrupt exit code 1
    import contextlib
    @contextlib.contextmanager
    def safe_capture_signals(self):
        yield

    Server.capture_signals = safe_capture_signals

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        log_level="info",
        timeout_keep_alive=30
    )
except SystemExit as e:
    print(f"[FATAL] SystemExit: {e}", file=sys.stderr, flush=True)
    traceback.print_exc()
except KeyboardInterrupt:
    print("[INFO] Server interrupted by user.", flush=True)
except Exception as e:
    print(f"[FATAL] Unhandled exception: {e}", file=sys.stderr, flush=True)
    traceback.print_exc()
finally:
    print("[INFO] Server process finished.", flush=True)
