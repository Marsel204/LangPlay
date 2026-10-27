"""Installer engine. Stdlib only; never touches the user's default app profiles."""
from __future__ import annotations

import base64
import contextlib
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import platform
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

VERSION = "0.2.0"
BACKEND_PORT = 43211  # Denshi 3.10.4's renderer hardcodes this port.
COMPANION_PORT = 8765  # The learning plugin declares network access to this port.


class SetupError(RuntimeError):
    pass


def resources() -> Path:
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))


def system_key() -> str:
    if platform.machine().lower() not in ("amd64", "x86_64"):
        raise SetupError("This installer supports Intel/AMD 64-bit Linux and Windows only.")
    if sys.platform == "win32":
        return "windows"
    if sys.platform.startswith("linux"):
        return "linux"
    raise SetupError("Use the Linux or Windows installer on a supported desktop.")


def default_root() -> Path:
    if sys.platform == "win32":
        return Path(os.environ["LOCALAPPDATA"]) / "LangPlay"
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / "langplay-desktop"


def atomic_write(path: Path, data: str | bytes, private=True):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".langplay-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data.encode("utf-8") if isinstance(data, str) else data)
        if private:
            os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def save_json(path: Path, data):
    atomic_write(path, json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def fetch(asset: dict, cache: Path, log=print) -> Path:
    """Use cache only after verification; failed downloads never become executables."""
    cache = cache.expanduser().resolve()
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / (asset["sha256"] + "-" + Path(urllib.parse.urlparse(asset["url"]).path).name)
    if target.exists() and digest(target) == asset["sha256"]:
        log("Using verified " + target.name.split("-", 1)[1])
        return target
    if urllib.parse.urlparse(asset["url"]).scheme != "https":
        raise SetupError("Downloads must use HTTPS.")
    log("Downloading " + Path(urllib.parse.urlparse(asset["url"]).path).name)
    partial = target.with_suffix(target.suffix + ".part")
    try:
        request = urllib.request.Request(asset["url"], headers={"User-Agent": "LangPlay-Setup/" + VERSION})
        with urllib.request.urlopen(request, timeout=45) as response, partial.open("wb") as output:
            if urllib.parse.urlparse(response.url).scheme != "https":
                raise SetupError("Download redirected outside HTTPS.")
            shutil.copyfileobj(response, output, 1024 * 1024)
        if digest(partial) != asset["sha256"]:
            raise SetupError("Package verification failed. Retry setup; no package was executed.")
        os.replace(partial, target)
        return target
    finally:
        partial.unlink(missing_ok=True)


def popen(args, **kwargs):
    if sys.platform == "win32":
        kwargs.setdefault("creationflags", subprocess.CREATE_NO_WINDOW)
    else:
        kwargs.setdefault("start_new_session", True)
    with external_loader():
        return subprocess.Popen([str(x) for x in args], **kwargs)


def run(args, **kwargs):
    if sys.platform == "win32":
        kwargs.setdefault("creationflags", subprocess.CREATE_NO_WINDOW)
    kwargs.setdefault("env", external_environment())
    with external_loader():
        result = subprocess.run([str(x) for x in args], capture_output=True, **kwargs)
    if result.returncode:
        raise SetupError(f"{Path(str(args[0])).name} failed (exit {result.returncode}). "
                         "Check free disk space and system libraries, then retry.")
    return result


@contextlib.contextmanager
def external_loader():
    """Do not inject the frozen Python DLL directory into vendor applications."""
    frozen_windows = sys.platform == "win32" and getattr(sys, "frozen", False)
    if frozen_windows:
        import ctypes
        ctypes.windll.kernel32.SetDllDirectoryW(None)
    try:
        yield
    finally:
        if frozen_windows:
            ctypes.windll.kernel32.SetDllDirectoryW(str(resources()))


def external_environment():
    env = os.environ.copy()
    if sys.platform.startswith("linux"):
        original = env.pop("LD_LIBRARY_PATH_ORIG", None)
        env.pop("LD_LIBRARY_PATH", None)
        if original:
            env["LD_LIBRARY_PATH"] = original
    return env


def expand_package(archive: Path, destination: Path, kind: str, system: str,
                   extractor: Path | None = None) -> Path:
    """Promote a complete extraction; never replace a working installation in place."""
    marker = destination / ".langplay-complete.json"
    if marker.exists():
        executable = destination / read_json(marker)["executable"]
        if executable.is_file():
            return executable
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="unpack-", dir=destination.parent) as temp:
        stage = Path(temp)
        if system == "linux":
            archive.chmod(0o755)
            run([archive, "--appimage-extract"], cwd=stage, timeout=180)
            unpacked = stage / "squashfs-root"
            executable = unpacked / "AppRun"
        else:
            if not extractor or not extractor.is_file():
                raise SetupError("The Windows setup package is missing its bundled 7-Zip extractor.")
            unpacked = stage / "app"
            run([extractor, "x", archive, "-y", "-o" + str(unpacked)], timeout=180)
            if kind == "seanime":
                # Electron-builder's NSIS bootstrap stores the application in a nested 7z.
                nested = list(unpacked.rglob("app-64.7z"))
                if nested:
                    payload = stage / "payload"
                    run([extractor, "x", nested[0], "-y", "-o" + str(payload)], timeout=180)
                    unpacked = payload
            names = {"seanime denshi.exe", "seanime-denshi.exe"} if kind == "seanime" else {"qbittorrent.exe"}
            matches = [p for p in unpacked.rglob("*.exe") if p.name.lower() in names]
            if len(matches) != 1:
                raise SetupError(f"The official {kind} package layout changed. Update the installer.")
            executable = matches[0]
        if not executable.is_file():
            raise SetupError(f"The {kind} package did not contain its application.")
        relative = executable.relative_to(unpacked)
        save_json(unpacked / marker.name, {"executable": str(relative)})
        if destination.exists():
            raise SetupError(f"Incomplete files at {destination}. Rename that folder and retry.")
        shutil.move(str(unpacked), destination)
    return destination / relative


def available_port(start: int, count=50) -> int:
    for port in range(start, start + count):
        with socket.socket() as sock:
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                pass
    raise SetupError(f"No free local port near {start}. Close unused applications and retry.")


def port_busy(port: int) -> bool:
    with socket.socket() as sock:
        return sock.connect_ex(("127.0.0.1", port)) == 0


class SeanimeAPI:
    def __init__(self, port=None):
        self.base = f"http://127.0.0.1:{BACKEND_PORT if port is None else port}"

    def call(self, path, data=None, method=None, timeout=10):
        request = urllib.request.Request(self.base + "/api/v1/" + path,
            data=json.dumps(data).encode() if data is not None else None, method=method,
            headers={"Origin": self.base, "Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)["data"]


def same_path(a, b) -> bool:
    return os.path.normcase(os.path.realpath(a)) == os.path.normcase(os.path.realpath(b))


def assert_host_owner(api: SeanimeAPI, profile: Path):
    """Refuse to configure a different Seanime server, including a user's normal one."""
    try:
        status = api.call("status", timeout=2)
    except Exception as error:
        raise SetupError("Seanime's port is occupied by another service. Close it and retry.") from error
    if not status.get("dataDir") or not same_path(status["dataDir"], profile):
        raise SetupError("Another Seanime profile is running. Quit Seanime from its tray menu "
                         "and retry; your existing settings will be preserved.")
    return status


def wait_for(check, child=None, timeout=35):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if child is not None and child.poll() is not None:
            raise SetupError("An application exited during startup. See the setup log for details.")
        try:
            result = check()
            if result:
                return result
        except (OSError, ValueError, KeyError):
            pass
        time.sleep(0.2)
    raise SetupError("An application did not become ready. Check the logs, then retry.")


def write_qbit_config(root: Path, state: dict):
    profile = root / "qbittorrent"
    config = profile / "qBittorrent/config/qBittorrent.conf"
    # Custom profiles use qBittorrent.ini on Windows and .conf on Linux.
    if state["system"] == "windows":
        config = config.with_suffix(".ini")
    if config.exists():
        return
    password = state["qbitPassword"]
    salt = secrets.token_bytes(16)
    encoded = base64.b64encode(salt).decode() + ":" + base64.b64encode(
        hashlib.pbkdf2_hmac("sha512", password.encode(), salt, 100000, 64)).decode()
    text = ("[Preferences]\nWebUI\\Enabled=true\nWebUI\\Address=127.0.0.1\n"
        f"WebUI\\Port={state['qbitPort']}\nWebUI\\Username=langplay\n"
        "WebUI\\LocalHostAuth=true\nWebUI\\UseUPnP=false\n"
        f'WebUI\\Password_PBKDF2="@ByteArray({encoded})"\n')
    atomic_write(config, text)


class QbitAPI:
    def __init__(self, state):
        self.base = f"http://127.0.0.1:{state['qbitPort']}/api/v2/"
        self.state = state
        self.jar = http.cookiejar.CookieJar()
        self.client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def call(self, path, data=None):
        request = urllib.request.Request(self.base + path,
            data=urllib.parse.urlencode(data).encode() if data is not None else None)
        with self.client.open(request, timeout=3) as response:
            return response.read()

    def login(self):
        self.call("auth/login", {"username": "langplay", "password": self.state["qbitPassword"]})
        # qBittorrent 5.2 responds 204 with no body. The authenticated API is the proof.
        return self.call("app/version").startswith(b"v")


def initial_settings(root: Path, state: dict) -> dict:
    library = state["library"]
    return {
        "library": {"libraryPath": library, "libraryPaths": [], "autoScan": True,
            "refreshLibraryOnStart": True, "autoUpdateProgress": True, "enableWatchContinuity": True,
            "autoPlayNextEpisode": True, "torrentProvider": "animetosho-new",
            "autoSelectTorrentProvider": "animetosho-new", "enableManga": False,
            "updateChannel": "github", "enableOnlinestream": False},
        "mediaPlayer": {"defaultPlayer": "mpv", "host": "127.0.0.1", "mpvPrismEnabled": True,
            "mpvArgs": "--slang=ja,jpn --sub-auto=fuzzy", "mpvSocket": str(root / "mpv_socket")},
        "torrent": {"defaultTorrentClient": "qbittorrent", "qbittorrentPath": state["qbittorrent"],
            "qbittorrentHost": "127.0.0.1", "qbittorrentPort": state["qbitPort"],
            "qbittorrentUsername": "langplay", "qbittorrentPassword": state["qbitPassword"],
            "qbittorrentCategory": "Anime", "showActiveTorrentCount": True},
        "anilist": {}, "discord": {}, "manga": {}, "notifications": {}, "nakama": {},
        "enableTorrentStreaming": True, "enableTranscode": False, "debridProvider": "none",
    }


def configure_host(api: SeanimeAPI, root: Path, state: dict):
    status = assert_host_owner(api, root / "seanime")
    # Never POST /start over an initialized profile: it resets user preferences/history rules.
    if not (status.get("settings") or {}).get("id"):
        api.call("start", initial_settings(root, state), timeout=30)
        api.call("settings/auto-downloader", {"provider": "animetosho-new", "interval": 20,
            "enabled": False, "downloadAutomatically": False, "enableEnhancedQueries": True}, "PATCH")
        stream = api.call("torrentstream/settings")
        stream.update(enabled=True, autoSelect=True, preferredResolution="1080",
            downloadDir=str(root / "stream-cache"), addToLibrary=False, includeInLibrary=True)
        api.call("torrentstream/settings", {"settings": stream}, "PATCH")
    config = api.call("extensions/user-config/animetosho-new")
    if config and not config.get("savedUserConfig"):
        definition = config["userConfig"]
        api.call("extensions/user-config", {"id": "animetosho-new", "version": definition["version"],
            "values": {field["name"]: field.get("default", "") for field in definition["fields"]}})


def command_self(*args):
    if getattr(sys, "frozen", False):
        return [sys.executable, *map(str, args)]
    return [sys.executable, str(resources() / "installer/app.py"), *map(str, args)]


def runtime_environment(root: Path):
    env = external_environment()
    env.update(SEANIME_DATA_DIR=str(root / "seanime"), SEANIME_SERVER_HOST="127.0.0.1",
               SEANIME_SERVER_PORT=str(BACKEND_PORT), QBT_PROFILE=str(root / "qbittorrent"))
    return env


@contextlib.contextmanager
def installation_lock(root: Path):
    root.mkdir(parents=True, exist_ok=True)
    handle = (root / "setup.lock").open("a+b")
    try:
        if sys.platform == "win32":
            import msvcrt
            handle.seek(0); handle.write(b"0"); handle.flush(); handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as error:
        handle.close()
        raise SetupError("Another setup or launcher is running. Wait for it to finish.") from error
    try:
        yield
    finally:
        handle.close()  # OS releases the lock after failure/crash as well.


class Installer:
    def __init__(self, root=None, log=print, cache=None, api=None):
        self.root = Path(root or default_root()).expanduser().resolve()
        self.log = log
        self.cache = Path(cache) if cache else self.root / "downloads"
        self.api = api or SeanimeAPI()
        self.owned = []
        self.qbit_shutdown = None

    def spawn(self, args, env=None, log_name="setup-apps.log"):
        with (self.root / log_name).open("ab") as output:
            child = popen(args, stdout=output, stderr=subprocess.STDOUT,
                          stdin=subprocess.DEVNULL, env=env)
        self.owned.append(child)
        return child

    def stop_owned(self):
        if self.qbit_shutdown:
            client, child = self.qbit_shutdown
            if child.poll() is None:
                try:
                    # qBittorrent buffers settings for five seconds. Its API shutdown
                    # flushes them; TerminateProcess on Windows does not.
                    client.call("app/shutdown", {})
                    child.wait(timeout=10)
                except (OSError, subprocess.TimeoutExpired):
                    pass
            self.qbit_shutdown = None
        for child in reversed(self.owned):
            if child.poll() is None:
                if sys.platform == "win32":
                    subprocess.run(["taskkill", "/PID", str(child.pid), "/T", "/F"],
                        capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
                else:
                    child.terminate()
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill(); child.wait(timeout=5)
        self.owned.clear()

    def install(self, library: Path):
        system = system_key()
        if not library.is_absolute() or any(x in str(library) for x in ('\n', '\r')):
            raise SetupError("Choose an absolute library folder without line breaks.")
        if port_busy(BACKEND_PORT):
            assert_host_owner(self.api, self.root / "seanime")
        if self.root.exists() and not (self.root / "installation.json").exists():
            unknown = [p for p in self.root.iterdir() if p.name != "setup.lock"]
            if unknown:
                raise SetupError("The installation folder contains unrelated files. Choose an empty --root folder.")
        with installation_lock(self.root):
            self.root.chmod(0o700)
            if shutil.disk_usage(self.root).free < 2 * 1024**3:
                raise SetupError("Setup needs at least 2 GB of free space for applications and downloads.")
            try:
                return self._install(library, system)
            finally:
                self.stop_owned()

    def _install(self, library, system):
        state_path = self.root / "installation.json"
        if port_busy(COMPANION_PORT):
            try:
                check_companion(COMPANION_PORT, self.root)
            except (OSError, ValueError, SetupError) as error:
                raise SetupError('LangPlay needs companion port 8765. Close the other application using it and retry setup.') from error
        state = read_json(state_path) if state_path.exists() else {
            "schema": 1, "system": system, "library": str(library),
            "qbitPort": available_port(8081), "companionPort": COMPANION_PORT,
            "qbitPassword": secrets.token_urlsafe(32), "complete": False,
        }
        if state.get("schema") != 1 or state.get("system") != system:
            raise SetupError("This installation belongs to a different platform or installer version.")
        if state.get('companionPort') != COMPANION_PORT:
            if port_busy(state['companionPort']):
                raise SetupError('Close the existing LangPlay companion before rerunning setup to migrate its port to 8765.')
            state['companionPort'] = COMPANION_PORT
        save_json(state_path, state)
        Path(state["library"]).mkdir(parents=True, exist_ok=True)
        (self.root / "stream-cache").mkdir(exist_ok=True)
        lock = read_json(resources() / "installer/assets.lock.json")
        env = runtime_environment(self.root)
        for kind, version in (("seanime", lock["seanimeVersion"]), ("qbittorrent", lock["qbittorrentVersion"])):
            archive = fetch(lock[system][kind], self.cache, self.log)
            self.log("Preparing " + kind + " " + version)
            state[kind] = str(expand_package(archive, self.root / "apps" / f"{kind}-{version}",
                kind, system, resources() / "installer/7zip/7z.exe"))
        state["server"] = str(Path(state["seanime"]).parent / "resources/binaries" /
            ("seanime-server-windows.exe" if system == "windows" else "seanime-server-linux-amd64"))
        # Linux AppRun sits next to resources; Windows exe is next to resources, too.
        if not Path(state["server"]).is_file():
            raise SetupError("Seanime's bundled server is missing; the official package layout changed.")
        save_json(state_path, state)
        self._extensions(lock)
        write_qbit_config(self.root, state)
        qbit = QbitAPI(state)
        if port_busy(state["qbitPort"]):
            if not qbit.login():
                raise SetupError("The saved downloader port is used by another application.")
        else:
            child = self.spawn([state["qbittorrent"], "--confirm-legal-notice", "--no-splash"], env)
            self.qbit_shutdown = (qbit, child)
            wait_for(qbit.login, child)
        if not state.get("complete"):
            qbit.call("app/setPreferences", {"json": json.dumps({"save_path": state["library"],
                "start_minimized": True, "confirm_exit": False, "queueing_enabled": True,
                "max_active_downloads": 2})})
            categories = json.loads(qbit.call("torrents/categories"))
            if "Anime" not in categories:
                qbit.call("torrents/createCategory", {"category": "Anime", "savePath": state["library"]})
        if not port_busy(BACKEND_PORT):
            child = self.spawn([state["server"], "--desktop-sidecar", "--host", "127.0.0.1"], env)
            wait_for(lambda: self.api.call("status"), child)
        assert_host_owner(self.api, self.root / "seanime")
        # Upstream registers this route twice; the effective handler requires an ID.
        for extension_id in ("animetosho-new", "langplay-probe"):
            self.api.call("extensions/external/reload", {"id": extension_id})
        configure_host(self.api, self.root, state)
        self._install_runtime(state)
        state.update(complete=True, installerVersion=VERSION)
        save_json(state_path, state)
        self.log("Ready. Automatic downloads are off until you choose shows and rules.")
        return state

    def _extensions(self, lock):
        folder = self.root / "seanime/extensions"
        folder.mkdir(parents=True, exist_ok=True)
        provider_file = folder / "animetosho-new.json"
        if not provider_file.exists():
            manifest = read_json(fetch(lock["provider"]["manifest"], self.cache, self.log))
            payload = fetch(lock["provider"]["payload"], self.cache, self.log).read_text(encoding="utf-8")
            manifest["payload"] = payload
            manifest["payloadURI"] = ""
            save_json(provider_file, manifest)
        plugin = resources() / "integrations/seanime/dist/langplay-probe.json"
        if not plugin.is_file():
            raise SetupError("Missing bundled LangPlay plugin. Use a built setup package.")
        target = folder / "langplay-probe.json"
        if target.exists() and target.read_bytes() != plugin.read_bytes():
            shutil.copy2(target, target.with_suffix(".json.previous"))
        atomic_write(target, plugin.read_bytes())

    def _install_runtime(self, state):
        """A versioned copy lets Windows update without replacing a running companion exe."""
        if not getattr(sys, "frozen", False):
            self.log("Source run: use installer/app.py --launch for development.")
            return
        build_id = VERSION + "-" + digest(Path(sys.executable))[:12]
        destination = self.root / "runtime" / build_id / ("LangPlay.exe" if state["system"] == "windows" else "LangPlay")
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists() or digest(destination) != digest(Path(sys.executable)):
            shutil.copy2(sys.executable, destination)
        destination.chmod(0o755)
        state["runtime"] = str(destination)
        create_shortcut(destination, self.root, state["system"])


def desktop_exec(arguments):
    # Desktop Entry Exec has its own quoting rules (not shell quoting).
    quoted = ['"' + str(x).replace('\\', '\\\\').replace('"', '\\"')
              .replace('`', '\\`').replace('$', '\\$').replace('%', '%%') + '"' for x in arguments]
    # The key-file string parser unescapes first, then the Exec argument parser.
    return " ".join(quoted).replace('\\', '\\\\')


def create_shortcut(runtime: Path, root: Path, system: str):
    if system == "linux":
        folder = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / "applications"
        atomic_write(folder / "langplay-desktop.desktop", "[Desktop Entry]\nType=Application\n"
            "Name=Seanime + LangPlay\nComment=Anime library and LangPlay development integration\n"
            + "Exec=" + desktop_exec([runtime, "--launch", "--root", root]) + "\n"
            "Terminal=false\nCategories=AudioVideo;Video;\nStartupWMClass=seanime-denshi\n", private=False)
    else:
        # PowerShell only creates a .lnk; no downloaded scripts or execution-policy changes.
        def quote(value):
            return "'" + str(value).replace("'", "''") + "'"
        shortcut = Path(os.environ["APPDATA"]) / "Microsoft/Windows/Start Menu/Programs/Seanime + LangPlay.lnk"
        shortcut.parent.mkdir(parents=True, exist_ok=True)
        arguments = subprocess.list2cmdline(["--launch", "--root", str(root)])
        script = (f"$s=(New-Object -ComObject WScript.Shell).CreateShortcut({quote(shortcut)});"
            f"$s.TargetPath={quote(runtime)};$s.Arguments={quote(arguments)};"
            f"$s.WorkingDirectory={quote(root)};$s.Save()")
        run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script], timeout=15)


def launch(root: Path, log=print):
    root = root.resolve()
    with installation_lock(root):
        state = read_json(root / "installation.json")
        if not state.get("complete"):
            raise SetupError("Setup is incomplete. Run the installer again.")
        if state.get('companionPort') != COMPANION_PORT:
            raise SetupError('Run setup again to migrate the companion to port 8765 required by the learning plugin.')
        api = SeanimeAPI()
        already_running = port_busy(BACKEND_PORT)
        if already_running:
            assert_host_owner(api, root / "seanime")
        runner = Installer(root, log)
        env = runtime_environment(root)
        qbit = QbitAPI(state)
        try:
            if port_busy(state["qbitPort"]):
                qbit.login()  # Never send actions to a foreign downloader.
            else:
                child = runner.spawn([state["qbittorrent"], "--no-splash"], env, "qbittorrent.log")
                runner.qbit_shutdown = (qbit, child)
                wait_for(qbit.login, child)
            if port_busy(state["companionPort"]):
                check_companion(state["companionPort"], root)
            else:
                companion_env = os.environ.copy()
                companion_env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
                args = ["--companion", "--root", str(root)]
                command = [state["runtime"], *args] if state.get("runtime") else command_self(*args)
                child = runner.spawn(command, companion_env, "companion.log")
                wait_for(lambda: check_companion(state["companionPort"], root), child)
            args = [state["seanime"], "--user-data-dir=" + str(root / "denshi")]
            if state["system"] == "linux":
                args.append("--gtk-version=3")
            child = runner.spawn(args, env, "seanime-desktop.log")
            if not already_running:
                wait_for(lambda: api.call("status"), child)
                assert_host_owner(api, root / "seanime")
            log("Seanime is ready.")
        except Exception:
            runner.stop_owned()
            raise


def check_companion(port: int, root: Path):
    message = "The LangPlay port belongs to another application or is unavailable. Close it and retry."
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/langplay/health", timeout=2) as response:
            raw = response.read(65537)
        if len(raw) > 65536:
            raise ValueError('Oversized health reply.')
        data = json.loads(raw)
        if (not isinstance(data, dict) or data.get("application") != "langplay-companion"
                or not isinstance(data.get('profile'), str) or not same_path(data['profile'], root)):
            raise ValueError('Foreign companion.')
    except (OSError, ValueError, TypeError, RecursionError):
        raise SetupError(message) from None
    return True


def companion(root: Path):
    """Use the existing backend without its auto-incrementing bind or ephemeral bookmark path."""
    import Server
    # Windows --windowed executables have no Python stdout, even with redirected handles.
    if sys.stdout is None:
        sys.stdout = (root / "companion-requests.log").open("a", encoding="utf-8")
    if sys.stderr is None:
        sys.stderr = sys.stdout
    state = read_json(root / "installation.json")
    data = root / "companion-data"
    data.mkdir(parents=True, exist_ok=True)
    Server.ANKI_FILE = str(data / "anki_cards.txt")
    os.environ['LANGPLAY_SUBTITLE_DIR'] = str(root / 'subtitles')
    os.environ['LANGPLAY_SEANIME_DIR'] = str(root / 'seanime')
    class Handler(Server.RequestHandler):
        def do_GET(self):
            if self.path == "/api/langplay/health":
                if not self.origin_allowed():
                    self.send_json_response(403, {"status": "error", "message": "Origin is not allowed."})
                    return
                self.send_json_response(200, {"application": "langplay-companion", "profile": str(root), "version": VERSION})
            else:
                super().do_GET()
    Server.LangPlayHTTPServer(("127.0.0.1", state["companionPort"]), Handler).serve_forever()
