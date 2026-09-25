import subprocess
import sys
import os

backend_dir = os.path.dirname(os.path.abspath(__file__))
# pythonw = no console window at all. The Intel Fortran runtime inside torch
# (forrtl) aborts the whole process with "error (200): program aborting due
# to window-CLOSE event" whenever a console-attached backend outlives its
# parent terminal — pythonw has no console, so close events can't kill it.
python_exe = os.path.join(backend_dir, "venv", "Scripts", "pythonw.exe")
if not os.path.exists(python_exe):
    python_exe = os.path.join(backend_dir, "venv", "Scripts", "python.exe")

DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200

stdout_path = os.path.join(backend_dir, "server_stdout.log")
stderr_path = os.path.join(backend_dir, "server_stderr.log")

with open(stdout_path, "a", encoding="utf-8") as out, open(stderr_path, "a", encoding="utf-8") as err:
    proc = subprocess.Popen(
        [python_exe, "-u", "run_server.py"],
        cwd=backend_dir,
        creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP,
        stdout=out,
        stderr=err,
        close_fds=True
    )

print(f"Backend started detached with PID {proc.pid}")
