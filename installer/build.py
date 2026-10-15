#!/usr/bin/env python3
"""Build on each target OS. PyInstaller is not a cross-compiler."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--console", action="store_true", help="Keep the Windows console for CI diagnostics")
    args = parser.parse_args()
    windows = sys.platform == "win32"
    label = "Windows-x64" if windows else "Linux-x86_64"
    name = "LangPlay-Setup-" + label
    if not (ROOT / "integrations/seanime/dist/langplay-probe.json").exists():
        raise SystemExit("Build the plugin first: npm --prefix integrations/seanime run build")
    extras = []
    if windows:
        helper = ROOT / "installer/7zip"
        helper.mkdir(exist_ok=True)
        source = Path("C:/Program Files/7-Zip")
        for file in ("7z.exe", "7z.dll", "License.txt"):
            shutil.copy2(source / file, helper / file)
        extras += ["--add-data", str(helper) + ":installer/7zip"]
    command = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile",
        "--name", name, "--distpath", str(ROOT / "installer/dist"),
        "--workpath", str(ROOT / "installer/.build"), "--specpath", str(ROOT / "installer/.build"),
        "--paths", str(ROOT), "--collect-all", "sudachipy", "--collect-all", "sudachidict_core",
        "--hidden-import", "tkinter", "--hidden-import", "tkinter.ttk",
        "--hidden-import", "tkinter.filedialog", "--hidden-import", "tkinter.messagebox",
        "--add-data", str(ROOT / "installer/assets.lock.json") + ":installer",
        "--add-data", str(ROOT / "integrations/seanime/dist/langplay-probe.json") + ":integrations/seanime/dist",
        "--add-data", str(ROOT / "App.html") + ":.",
        "--add-data", str(ROOT / "index.html") + ":.",
        "--add-data", str(ROOT / "installer/licenses") + ":installer/licenses",
        "--add-data", str(ROOT / "installer/THIRD_PARTY.md") + ":installer"]
    if windows and not args.console:
        command.append("--windowed")
    subprocess.run(command + extras + [str(ROOT / "installer/app.py")], check=True, cwd=ROOT)
    artifact = ROOT / "installer/dist" / (name + (".exe" if windows else ""))
    if not windows:
        artifact.chmod(0o755)
        with tarfile.open(str(artifact) + ".tar.gz", "w:gz") as archive:
            archive.add(artifact, arcname=artifact.name)
            archive.add(ROOT / "installer/README.md", arcname="READ-ME.md")
    hashes = []
    for file in sorted(artifact.parent.iterdir()):
        if file.is_file() and file.name != "SHA256SUMS":
            hashes.append(hashlib.sha256(file.read_bytes()).hexdigest() + "  " + file.name)
    (artifact.parent / "SHA256SUMS").write_text("\n".join(hashes) + "\n", encoding="utf-8")
    print(json.dumps({"artifact": str(artifact), "sha256": hashlib.sha256(artifact.read_bytes()).hexdigest()}))


if __name__ == "__main__":
    main()
