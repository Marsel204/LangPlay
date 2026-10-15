"""Opt-in real-package smoke: isolated profiles, no account or media downloads.

Runs the backend on a temporary port so the user's current desktop stays open.
Only this diagnostic overrides BACKEND_PORT; installed Denshi always uses 43211.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from installer import core


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path)
    parser.add_argument("--root", type=Path)
    parser.add_argument("--extract-only", action="store_true")
    args = parser.parse_args()
    core.BACKEND_PORT = core.available_port(43411)
    root = args.root or Path(tempfile.mkdtemp(prefix="langplay-smoke-", dir=Path.home()))
    print("Smoke profile:", root, flush=True)
    if args.extract_only:
        lock = core.read_json(core.resources() / "installer/assets.lock.json")
        for kind in ("seanime", "qbittorrent"):
            package = core.fetch(lock[core.system_key()][kind], args.cache or root / "downloads")
            executable = core.expand_package(package, root / kind, kind, core.system_key(),
                core.resources() / "installer/7zip/7z.exe")
            print(kind, executable)
            assert executable.exists()
            if kind == "seanime":
                assert (executable.parent / "resources/binaries/seanime-server-windows.exe").is_file()
        return
    engine = core.Installer(root, cache=args.cache)
    try:
        state = engine.install(root / "Anime library")
    except Exception:
        log = root / "setup-apps.log"
        if log.exists(): print(log.read_text(errors="replace")[-12000:], flush=True)
        raise
    print("First install completed", flush=True)
    # Start only the isolated owned backend/downloader for verification; never native playback.
    try:
        env = core.runtime_environment(root)
        q = engine.spawn([state["qbittorrent"], "--no-splash"], env)
        qbit = core.QbitAPI(state)
        engine.qbit_shutdown = (qbit, q)
        core.wait_for(qbit.login, q)
        server = engine.spawn([state["server"], "--desktop-sidecar"], env)
        core.wait_for(lambda: engine.api.call("status"), server)
        before = engine.api.call("settings")
        # Seanime normalizes Windows paths to forward slashes; compare directory identity.
        assert os.path.samefile(before["library"]["libraryPath"], root / "Anime library")
        assert before["autoDownloader"]["enabled"] is False
        assert before["autoDownloader"]["downloadAutomatically"] is False
        assert json.loads(qbit.call("torrents/info")) == []
        categories = json.loads(qbit.call("torrents/categories"))
        assert categories["Anime"]["savePath"].replace("\\", "/") == str(root / "Anime library").replace("\\", "/")
        assert core.assert_host_owner(engine.api, root / "seanime")
        assert before["mediaPlayer"]["mpvPrismEnabled"] is True
        providers = engine.api.call("extensions/list/anime-torrent-provider")
        assert any(p["id"] == "animetosho-new" for p in providers)
        engine.api.call("settings/path", {"path": "library.autoPlayNextEpisode", "value": False}, "PATCH")
        password = state["qbitPassword"]
        # Use the same root to prove repeat setup preserves credentials and edited preferences.
        core.Installer(root, cache=args.cache).install(root / "Should not replace the library")
        assert core.read_json(root / "installation.json")["qbitPassword"] == password
        after = engine.api.call("settings")
        assert after["library"]["autoPlayNextEpisode"] is False
        assert after["library"]["libraryPath"] == before["library"]["libraryPath"]
        assert after["autoDownloader"] == before["autoDownloader"]
        print("PASS: live profile, authenticated downloader, empty queue, safe rerun", flush=True)
    finally:
        engine.stop_owned()


if __name__ == "__main__":
    main()
