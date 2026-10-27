# Seanime + LangPlay setup

Download the installer for your **Intel/AMD 64-bit Windows or Linux desktop**.
Python and Node are included or used only during the build; neither is required
on the device being set up.

1. Windows: open `LangPlay-Setup-Windows-x64.exe`.
   Linux: extract `LangPlay-Setup-Linux-x86_64.tar.gz`, then open the executable.
   If the desktop asks, allow it to run as a program. The raw executable is also
   available; a direct download may need its “Executable” permission enabled.
2. Choose your anime library folder and click **Install on this device**.
3. Click **Launch Seanime**. Next time, use **Seanime + LangPlay** in your app menu.
4. In Seanime → Extensions, grant the LangPlay probe's playback/library-read
   permissions once. Optional AniList/account connections remain your choice.

Setup needs internet access and at least 2 GB free. It downloads pinned official
Seanime Denshi 3.10.4 and qBittorrent 5.2.4 packages, checks their SHA256 digests,
and extracts them into your user folder. Linux extraction avoids a FUSE dependency;
Windows extraction uses bundled 7-Zip and does not run either vendor's installer.
No administrator account, firewall change, shell execution-policy change, browser
extension installation, or login autostart is needed. OS download/trust prompts
may still appear; this package is currently unsigned.

**This reproduces the development setup.** The installed LangPlay plugin is the
native feasibility probe, not a completed subtitle-learning integration. Japanese
subtitle discovery/sync, the full learning drawer, and native playback acceptance
remain in progress. No paid services, accounts, or API keys are provisioned.

## What is configured

- Local library scans, watch continuity, next-episode playback.
- Seanime's bundled experimental mpv-prism player, torrent streaming, 1080 preference.
- AnimeTosho (NEW) community torrent provider with its primary/fallback feed defaults.
- A separate authenticated qBittorrent profile, Anime category, and two active download slots.
- The bundled Japanese parser and companion, with persistent bookmarks under the installation.
- A single daily launcher, which starts the local services as needed.

Automatic downloading is **off**. Choose followed shows and download rules first;
setup does not search for or download episodes. Source availability can change.

## Existing installations, retries, and storage

Default folder: `%LOCALAPPDATA%\LangPlay` on Windows, or
`${XDG_DATA_HOME:-~/.local/share}/langplay-desktop` on Linux. Seanime, Denshi,
qBittorrent, companion data, logs and downloads each have separate subfolders.
`installation.json` contains fresh device-specific credentials. Keep it private;
do not share it or copy it to another device. The installer never migrates this
machine's passwords, accounts or database.

Denshi's renderer expects port 43211. If another Seanime profile is running,
**quit it from the tray** before installing or launching this setup. The installer
refuses to configure a different profile. qBittorrent's port is selected when
first installed and saved. The companion uses port 8765, matching the learning
plugin's network permission. Close any other service using that port before
setup; it no longer silently selects an incompatible port. Older installations
with a different companion port must close LangPlay and rerun setup to migrate.
All three APIs bind to 127.0.0.1. Jimaku settings are read from this installation's
private Seanime profile.

Retrying keeps verified downloads, credentials, library settings, provider
preferences and automatic-download rules. Only initial setup applies defaults.
Application extraction uses a staging folder and promotes only complete packages.
Failed setup stops only processes it started and can be retried. Existing plugin
code is backed up as `.json.previous` before replacement. There is no destructive
uninstaller; to remove it, quit these apps and remove its app-menu shortcut and
installation folder, preserving any bookmarks/data you need. Your library lives
outside the installation by default.

Linux requires a graphical desktop with GTK 3, NSS, EGL/OpenGL, X11/Wayland and normal desktop
libraries; older/minimal distributions may need packages from their own manager.
Linux release builds target Ubuntu 22.04 or newer glibc-based desktops. ARM,
32-bit Windows, macOS, Android and iOS are outside this package's current scope.

## Building from source

Build on the target OS; Windows executables must be built on Windows. Use Python
3.11 and Node 22+ for the build. Windows builds expect the official full 7-Zip
installation at `C:\Program Files\7-Zip` (present on the GitHub Windows runner).

```sh
python -m venv .setup-venv
# Activate the venv using your platform's usual command, then:
python -m pip install -r installer/requirements-build.txt -r requirements-parser.txt
npm --prefix integrations/seanime ci
npm --prefix integrations/seanime run build
python -m unittest discover -s installer/tests -p 'test_*.py'
python installer/build.py
```

Artifacts and `SHA256SUMS` are written to `installer/dist/`. The GitHub Actions
workflow builds both platforms and retains artifacts for download. It does not
publish a GitHub release or deploy anything. GitHub artifact downloads require
repository access. Download/extract that artifact once to obtain the installer.

Source-mode CLI: `python installer/app.py --install --library /absolute/Anime`.
Then `python installer/app.py --launch`. Use `--root` for a separate installation
folder and `--cache` to reuse verified downloads. `--self-test` checks the bundled
parser and plugin without installing. No command downloads anime content.

## Validation

Unit checks cover credential hashing, private state, corrupted downloads,
wrong-server refusal, first-run defaults, saved-settings preservation, portable
Windows paths, environment cleanup, shortcut escaping, locking and process cleanup.

Existing companion/browser bridge regressions run on Linux; the older browser
native-host tests use Unix launch scripts and are not a Windows test harness.
Windows runs the existing parser regressions plus all new installer checks.

Opt-in live integration:
`python installer/tests/live_install.py --cache /path/to/verified-download-cache`.
It downloads/extracts the real packages, configures a temporary profile and
downloader, checks the empty queue, and reruns setup to verify saved preferences.
Its backend uses a temporary diagnostic port so your current Seanime stays open.
The installed native app always uses 43211. No playback or episode download is
part of this test. Packaged companion parsing is tested separately in CI.

See [THIRD_PARTY.md](THIRD_PARTY.md) for versions and source/license references.
