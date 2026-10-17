# Installed Seanime + LangPlay setup — 2026-10-15

The official Seanime Denshi desktop app is running on this Linux machine. Open **Seanime + LangPlay** from the application launcher, or run `/home/marsel/.local/bin/seanime-langplay`.

## Installed components

| Component | Version/location |
|---|---|
| Official Seanime Denshi | 3.10.4, `~/.local/opt/seanime-denshi/Seanime-Denshi-3.10.4.AppImage` |
| Official qBittorrent | 5.2.4, `~/.local/opt/qbittorrent/qBittorrent-5.2.4.AppImage` |
| AnimeTosho (NEW) community provider | 2.5.1, installed through Seanime’s extension API from its published GitHub manifest |
| LangPlay development probe | 0.1.0, `~/.config/Seanime/extensions/langplay-probe.json` |
| LangPlay Python companion | Existing repository virtual environment, loopback port 8765 |

Both official AppImage SHA256 digests matched their GitHub release asset digests. The installation is per-user and requires no system package changes. The launcher starts qBittorrent and the companion as needed, then opens Denshi. No login autostart was added.

## Daily configuration

- Persistent Seanime profile: `~/.config/Seanime`; desktop preferences: `~/.config/seanime-denshi`.
- Server: http://127.0.0.1:43211; Denshi starts its bundled server.
- Local library and completed downloads: `/home/marsel/Videos/Anime`.
- Automatic library scans, startup refresh, watch continuity, next episode enabled.
- Bundled experimental mpv-prism player enabled; external `/usr/bin/mpv` remains configured.
- Authenticated qBittorrent WebUI: http://127.0.0.1:8081, category `Anime`, two active download slots.
- qBittorrent authentication remains required on localhost. Credentials are stored privately at `~/.local/share/langplay-seanime/qbittorrent-credentials.json` (mode 0600); the containing directory is 0700. Do not commit this file or the Seanime database.
- Torrent streaming enabled with automatic source selection and 1080 preference. Stream cache: `~/.cache/Seanime/torrentstream`.
- AnimeTosho is the search/auto-select provider; its published primary and fallback feed defaults were saved.
- Automatic downloader remains disabled pending chosen shows/rules. No episodes were downloaded by this setup.
- LangPlay companion: http://127.0.0.1:8765. Port 8000 belongs to an existing unrelated service and was left alone.
- Runtime logs: `~/.local/share/langplay-seanime/` and `~/.config/Seanime/logs/`.

## Verification and remaining work

Denshi reported a rendered first frame and a connected native client; its bundled server listens on loopback. Seanime logged successful qBittorrent login. A separate authenticated qBittorrent API check verified its version and empty torrent list; unauthenticated access returned 403. The AnimeTosho feed responded, and a native-client search returned three releases. A standalone diagnostic search request timed out; no playback/download was used as a test. Japanese parsing through the running companion succeeded with Sudachi and five tokens. Launcher shell syntax passed. The source repository remains unchanged.

The extension page confirms both the provider and LangPlay probe installed. LangPlay’s permission flow was completed in the local web interface. Screenshot: `installed-extensions.png` (web interface, not native window).

The LangPlay probe is not the complete learning integration. Japanese subtitle discovery/sync, clickable subtitle learning UI, and full native playback acceptance remain engineering work. Installing the host does not complete those features. No AniList, Jimaku, paid Debrid, or AI credentials were added. AniList linking is optional for local use and needed for account sync; follow titles and choose download rules before enabling automatic downloads.

The AppImage logs a failed chmod on its read-only bundled server path; the server nevertheless launches successfully. Denshi’s own bundled playback stack remains experimental. The previous temporary development profile is separate from this persistent installation.
