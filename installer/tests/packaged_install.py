"""Fresh-device smoke of the frozen installer, installed shortcut and runtime."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from installer.tests import packaged_smoke


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("executable", type=Path)
    parser.add_argument("--cache", type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="langplay packaged ", dir=Path.home()) as temporary:
        root = Path(temporary) / "installation"
        command = [str(args.executable.resolve()), "--install", "--root", str(root),
                   "--library", str(Path(temporary) / "Anime library")]
        if args.cache:
            command += ["--cache", str(args.cache)]
        env = os.environ.copy()
        # The smoke owns its app-menu location too, including on a developer machine.
        env["APPDATA" if sys.platform == "win32" else "XDG_DATA_HOME"] = str(Path(temporary) / "app-menu")
        try:
            subprocess.run(command, check=True, timeout=600, env=env)
        except subprocess.CalledProcessError:
            log = root / "setup-apps.log"
            if log.exists(): print(log.read_text(errors="replace")[-12000:])
            raise
        state = json.loads((root / "installation.json").read_text(encoding="utf-8"))
        assert state["complete"] and Path(state["runtime"]).is_file()
        # Smoke the installed copy, not the setup file still sitting in Downloads.
        subprocess.run([sys.executable, str(Path(packaged_smoke.__file__)), state["runtime"]],
                       check=True, timeout=180)
        if sys.platform == "win32":
            shortcut = Path(env["APPDATA"]) / "Microsoft/Windows/Start Menu/Programs/Seanime + LangPlay.lnk"
        else:
            shortcut = Path(env["XDG_DATA_HOME"]) / "applications/langplay-desktop.desktop"
        assert shortcut.is_file()
        print("PASS: frozen installer, installed runtime, app-menu shortcut, portable paths")


if __name__ == "__main__":
    main()
