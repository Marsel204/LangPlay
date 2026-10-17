# Everyday Seanime + LangPlay setup

Status: Draft for review. Configuration and deployment specification; no settings,
downloads, extension installs, account connections or application changes are
performed by this document.

Date: 15 October 2026, Asia/Jakarta.

## Outcome

Use the **official Seanime Denshi desktop application** on Linux and Windows
as the everyday app. Install LangPlay as a Seanime plugin. Seanime owns the
library, provider search, streaming, downloads, playback and watch tracking;
LangPlay adds Japanese subtitle selection and learning tools. Keep the existing
LangPlay browser extension available for its browser/YouTube use case.

The user confirmed that everyday use should cover **both on-demand watching
and automatic downloads of followed shows**. The setup should avoid repeated
provider/file selection and manual scans, and preserve preferences across restarts.

This expands the earlier integration specification's deferred media-download
scope into **configuration of Seanime's existing features**. It does not add a
downloader to LangPlay or authorize a Seanime fork. The existing integration
plan and native compatibility checkpoint remain applicable to the learning UI.

## Inspected starting point

| Area | Current state |
| --- | --- |
| LangPlay source | `/home/marsel/Projects/LangPlay`, clean `codex/seanime-langplay`, head `b9ea026a84108322345852194aeb375dfbf50851`; draft PR #1 |
| Project enrollment | No AEK enrollment or protected harness; no additional approval system assumed |
| Host | Official Seanime 3.10.4 sidecar extracted from Denshi; source/tag `4bdff7b27b6c043dc87c0ccad3ead54596133a05` |
| Current interface | Browser connected to `127.0.0.1:43219`; this is not the native Denshi window |
| Profile and library | Disposable `/tmp/langplay-native-probe/data` and `/tmp/langplay-native-probe/media`; generated test media only |
| Providers/accounts | No torrent or online-streaming provider extensions installed; no AniList account record; Debrid disabled |
| Playback | External player default `mpv`; embedded libmpv flag disabled; continuity enabled; next-episode autoplay disabled |
| Streaming | Torrent streaming and auto-select enabled, but no provider selected; the enabled switch alone is insufficient |
| Downloads | Client `none`; auto downloader disabled; interval 20 minutes; zero rules or profiles |
| Library refresh | Automatic scanning and startup refresh disabled |
| LangPlay | Development probe and pure subtitle core exist; production learning UI, Jimaku and Anki integration remain unfinished |
| Hardware | Linux/Hyprland, Intel Iris Xe; mpv/FFmpeg installed; qBittorrent and Transmission executables not found in PATH; no Windows test host connected |

Configuration was inspected read-only, including selected non-secret database
fields. No credentials were exported. The temporary profile is a development
environment and must not silently become the permanent everyday profile.

## Deployment and ownership

| Component | Responsibility and daily behavior |
| --- | --- |
| Official Denshi desktop app | The main window, its bundled server, persistent host profile, playback and acquisition settings |
| Source-provider extensions | Supply results to Seanime; installed and selected once, with a reachable primary provider and one tested fallback |
| Download backend | Proposed free baseline: qBittorrent; optional existing Debrid service may replace this route after preference is settled |
| LangPlay Seanime plugin | Learning overlay/drawer, subtitle text, dictionary, companion requests and cards; no independent tracker or torrent client |
| Existing Python companion | Local parsing/AI service used by LangPlay; manual startup during development, with a later optional shared launcher |

Use the existing host integration mechanisms and settings UI/API. Keep credentials
in their owning host/service configuration. Avoid editing a running SQLite database
or creating a parallel settings database. Keep daily and development profiles
separate, and back up the daily profile before applying configuration changes.

Target Denshi 3.10.4 first. A newer official release needs a deliberate compatibility
check; do not silently change the integration target. Denshi's embedded libmpv
player is the desired learning surface, but its interaction/fullscreen/subtitle
text APIs still require the M02 native checks on both OSes. Base-app setup can be
verified without claiming that LangPlay's full learning UI is ready.

## Proposed defaults for review

1. **Persistent installation:** install the official desktop build in a durable
   user-owned location. Use its normal persistent profile and a chosen media
   folder. Proposed media folders are `~/Videos/Anime` on Linux and
   `%USERPROFILE%\Videos\Anime` on Windows; existing folders take priority.
   Do not replace an existing collection or import test fixtures as real shows.
2. **One app to open:** launch Denshi to start its bundled server. Keep a single
   instance/profile active. Use its supported tray/background behavior while
   automatic downloads are wanted. A full quit or sleeping/offline computer
   cannot continue RSS polling. Start-at-login remains a separate preference.
3. **Prefer existing episodes:** open a matching local episode when available;
   otherwise use the configured streaming route. Verify the host's actual
   source-precedence controls before promising automatic local-to-stream fallback.
   Keep an explicit source/release chooser available for ambiguous matches.
4. **On-demand selection:** configure a primary provider and at most one fallback,
   enable host auto-select, prefer 1080p then 720p, and avoid automatic 4K selection.
   Do not require language tags in release filenames: missing tags must not reject
   otherwise usable results. Prefer Japanese audio in the player where supported.
   Exact extension IDs, versions and permissions are recorded during setup.
5. **Download backend:** use qBittorrent for the proposed free setup, with a local
   authenticated connection and a dedicated anime category/folder. Do not change
   unrelated torrents or their settings. Debrid is optional and is not purchased,
   enabled or populated with a key by this specification.
6. **Followed-show rules:** bulk-create host auto-download rules for the explicitly
   selected Currently Watching/followed titles. Use a 20-minute interval and the
   shared quality/provider preferences. Check matches in host simulation/queue
   first, then enable automatic dispatch after successful setup verification.
   Never create rules for every title in Discover or Trending.
7. **Rule lifecycle:** use the host's bulk rule management for newly followed shows.
   Following a show must not be presented as automatically creating a download rule
   unless that behavior is proven. A new follow-to-rule automation is outside this
   configuration-only scope. Paused/dropped/finished titles need an explicit rule
   disable/review step where host behavior does not synchronize it automatically.
8. **Library and tracking:** enable supported automatic scan/startup refresh,
   continuity and resume. Use one host-owned watch list and completion policy.
   AniList sync is optional and uses the user's existing login. No second tracker
   or credentials are created. Next-episode autoplay remains a visible preference;
   it must not override LangPlay's explicit-resume interaction.
9. **Subtitles and learning:** prefer an existing Japanese text track or saved
   selection. Missing Japanese text offers the planned explicit Jimaku/import
   flow. Source-provider availability does not guarantee Japanese text subtitles.
   Retain candidate-first subtitle downloads and video/content-specific timing.

The pinned source contains a **feature-flagged experimental built-in torrent
download client**, and routes it through the same host torrent-client repository.
Its `builtinTorrentClient` flag is false in the current instance. Do not enable
that experimental flag as an assumed shortcut. It may replace the qBittorrent
proposal only after an explicit choice and successful persistence/restart tests.
This source finding qualifies older documentation stating that external clients
are always required for downloads.

## Expected everyday flows

**Watch now:** open Denshi → choose an episode/Continue Watching → Play. A healthy,
unambiguous configured source should need at most two episode-level actions
(select episode, play), with no repeated backend/provider configuration. Streaming
startup depends on source availability and network conditions; no fixed buffering
time is promised. No result should open the release chooser with a clear reason.

**Automatic downloads:** while the host and chosen backend run, an enabled rule
finds a new episode, dispatches it to the selected folder, and the host scan makes
it playable. Already completed/present/in-flight episodes should not be dispatched
again. The host's RSS auto downloader is for new releases; historical season
backfill is a separate manual search, not an implied outcome of enabling rules.

**Learn:** ordinary Seanime playback works independently. Once the learning plugin
passes native acceptance, clicking a subtitle pauses playback and opens the accepted
single drawer. Closing the drawer keeps playback paused. An unavailable companion
or subtitle provider leaves ordinary viewing usable.

## Failure and recovery requirements

- A provider outage, no seeds, empty result or ambiguous episode offers manual
  source selection/retry. Do not repeatedly launch concurrent searches or silently
  switch to a paid backend.
- Missing/expired service credentials show one connection-specific setup state;
  do not log keys or request them in chat.
- Validate the destination and available space before enabling downloads. Disk
  quota, minimum-free-space and bandwidth values remain owner choices. Use existing
  client controls where supported; do not promise a native hard quota or add a
  background disk manager in this scope. No automatic media deletion is included.
- A failed download/restart keeps resumable state where the selected backend
  supports it. A stopped backend has an actionable connection error rather than
  repeated duplicate jobs.
- Specials, absolute episode numbers, movies and batches require matching tests.
  Ambiguity preserves a manual correction path rather than downloading a guess.
- Application/extension upgrades record the old versions and preserve the profile.
  Restoring the backup must not remove downloaded media or saved learning cards.

## Acceptance checks

| ID | Observable outcome |
| --- | --- |
| SET-01 | Official Denshi opens from the normal desktop launcher using durable storage on Linux and Windows; restart retains settings and spawns no duplicate server |
| SET-02 | One installed provider returns results and a configured fallback has a tested recovery path; the setup record includes exact versions and permissions |
| SET-03 | A local episode opens without provider configuration; an unambiguous remote episode reaches playback through the configured route without a torrent/file chooser every time |
| SET-04 | Native playback handles generated H.264 and HEVC 10-bit/MKV ASS test media, Japanese audio preference, resume and windowed/fullscreen controls; failures remain explicit |
| SET-05 | One selected followed title has a verified host rule; a test item is queued first, then successful dispatch, completion, scan and library visibility are observed with test media |
| SET-06 | Re-running the rule check/restarting does not duplicate the same test transfer or progress write; disabled rules stop new dispatch |
| SET-07 | Disk/path/backend/provider failures preserve existing media and present a usable recovery action; no secrets appear in ordinary exports or diagnostics |
| SET-08 | Pausing a rule, quitting/backgrounding the app and restarting have documented, tested effects; rules for new/dropped shows have an honest management workflow |
| SET-09 | Everyday settings/data persist outside `/tmp`; development profiles and generated fixtures remain separate; backup/restore is exercised without deleting media |
| SET-10 | Base-app viewing remains usable with LangPlay disabled/unavailable; no native learning compatibility is claimed until the existing M02 gate passes |

Use generated/local test media and a selected test transfer for verification.
Provider responses, native playback, live downloads and both OSes require actual
observations; a saved configuration screenshot alone does not establish them.
No new tests, harness changes or production implementation are included here.

## Open choices before applying the setup

- Free-only versus an existing/preferred Debrid service: asked, not answered.
  The free route above is a proposal rather than an accepted purchase/backend choice.
- The real library/download location, storage/bandwidth limits and initial followed
  titles; the temporary fixture directory is not an acceptable inferred answer.
- Whether to start at login and whether a later one-launch companion shortcut is
  wanted. The current integration plan still documents manual companion startup.
- Exact source extensions after checking the selected backend, RSS support and
  matching results. There is no provider installed to reuse in this profile.

Review these choices with this draft before configuration or implementation.

## References

- [Existing integration specification](seanime-langplay-integration.md) and
  [implementation plan](../plans/seanime-langplay-implementation.md).
- [Official Seanime features](https://github.com/5rahim/seanime),
  [Denshi release target](https://github.com/5rahim/seanime/releases/tag/v3.10.4),
  [plugin runtime](https://seanime.gitbook.io/seanime-extensions/plugins/write-test-share).
- [Auto downloader behavior](https://seanime.app/docs/autodownloader),
  [auto-select configuration](https://seanime.app/docs/autoselect).
- Pinned source:
  [experimental feature flags](https://github.com/5rahim/seanime/blob/4bdff7b27b6c043dc87c0ccad3ead54596133a05/internal/core/feature_flags.go),
  [host download dispatch](https://github.com/5rahim/seanime/blob/4bdff7b27b6c043dc87c0ccad3ead54596133a05/internal/torrent_clients/torrent_client/repository.go),
  [rule schema](https://github.com/5rahim/seanime/blob/4bdff7b27b6c043dc87c0ccad3ead54596133a05/internal/library/anime/autodownloader_types.go),
  [Denshi server/tray lifecycle](https://github.com/5rahim/seanime/blob/4bdff7b27b6c043dc87c0ccad3ead54596133a05/seanime-denshi/src/main/index.ts).
