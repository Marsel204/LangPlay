"""Check the actual frozen binary without installing or touching a real profile."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request


def main():
    executable = Path(sys.argv[1]).resolve()
    env = os.environ.copy()
    # Run with no development Python on PATH and no project-specific environment.
    env.pop("PYTHONPATH", None)
    env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    subprocess.run([str(executable), "--self-test"], env=env, check=True, timeout=120)
    with tempfile.TemporaryDirectory(prefix="langplay-frozen-") as temporary:
        root = Path(temporary)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0)); port = sock.getsockname()[1]
        (root / "installation.json").write_text(json.dumps({"companionPort": port}), encoding="utf-8")
        with (root / "smoke.log").open("wb") as log:
            child = subprocess.Popen([str(executable), "--companion", "--root", str(root)],
                cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 90
            while True:
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/langplay/health", timeout=2) as response:
                        data = json.load(response)
                    assert data["application"] == "langplay-companion"
                    # Windows TEMP may use an 8.3 name; resolve both to the same directory.
                    assert os.path.samefile(data["profile"], root)
                    break
                except OSError:
                    if child.poll() is not None or time.monotonic() > deadline:
                        raise AssertionError((root / "smoke.log").read_text(errors="replace"))
                    time.sleep(0.2)
            request = urllib.request.Request(f"http://127.0.0.1:{port}/api/parse",
                data=json.dumps({"text": "日本語を勉強しています。"}).encode(),
                headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=30) as response:
                parsed = json.load(response)
            assert parsed["status"] == "success" and parsed["tokens"]
            assert parsed["engine"] == "sudachi"
            print("PASS: packaged companion health and Japanese parsing outside the source folder")
        finally:
            if sys.platform == "win32":
                # A one-file bootloader owns a Python child. Terminating only its parent
                # leaves the test server and inherited log handle alive on Windows.
                subprocess.run(["taskkill", "/PID", str(child.pid), "/T", "/F"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                child.terminate()
            try: child.wait(timeout=15)
            except subprocess.TimeoutExpired: child.kill(); child.wait(timeout=5)


if __name__ == "__main__":
    main()
