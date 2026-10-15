# Native compatibility checkpoint — M02 OPEN

## Japanese-subtitle discovery checkpoint — 2026-10-15

Before implementing Jimaku discovery, the approved incremental plan requires a
generated Japanese SRT to appear and be selectable in the official native player.
The probe now exposes **Load generated JP test subtitle**. During local native
playback it calls `addExternalSubtitleTrack` with generated text, after checking
client, playback ID and local-video path. It performs no download or media write.
The probe only reports **sent**; this is not evidence of native rendering.

In the pinned host source the native handler uses `sub-add` with `auto`, ignores
the track's `default` flag, and does not acknowledge the new track ID. The plugin
`getTextTracks()` getter resolves undefined, and `sendGetSubtitleTrack()` is a
no-op. Therefore automatic selection and failed-replacement recovery cannot be
qualified from a successful plugin call. Do not guess a numeric track ID.

Native computer control is unavailable in this agent session. Manual checkpoint:
play a local episode, open the LangPlay native feasibility probe from the plugin
tray, press **Load generated JP test subtitle**, close the probe, and inspect the
native CC menu. Select **LangPlay native test.ja.srt** and confirm Japanese text
appears; then restore the previous subtitle using that menu. Record separately
whether the test track was automatically selected. Until native evidence exists,
discovery/setup/cache implementation remains gated; no host fork is introduced.

The first live attempt revealed that the embedded adapter exposes renderer
`mpv` and target `mpvcore`, rather than renderer `native`. The probe now accepts
that exact combination; web playback and `mpv` with a different target remain
rejected. A regression test reproduced the misleading local-playback error
before the guard was corrected. Live diagnostics confirmed an active client,
playback ID and local-file identity. The rejection did not indicate missing media.

A subsequent live browser-to-host test confirmed that `target` is a Goja-wrapped
Go string enum (`typeof target === 'object'`, serialized value `mpvcore`). It
must be normalized with `String(target)` before comparison. A boxed-enum
regression reproduces the rejection; plain JavaScript fixture strings had hidden
this host interoperability issue. The native acceptance checkpoint is still open.

With enum normalization applied, a live browser UI click reached the existing
plugin handler and the host logged `add-subtitle-track` addressed to the active
native client. The actual Denshi process created the 69-byte Japanese SRT under
its `/tmp/seanime-mpvcore` temporary directory. This establishes delivery through
the native IPC path, not track-menu availability, selection or visible rendering.
The scoped suite now passes 37 tests. The browser-side snapshot independently
observed the active mpv client, playback ID, duration, time and pause status.

Checkpoint implementation checks: 35 scoped Seanime tests (including native
command shape and stale-video rejection), 20 installer tests, 22 existing Python
tests and 82 existing Node tests passed. The self-contained bundle built and
reloaded successfully in the running official 3.10.4 host, whose log recorded
plugin initialization and reload. These are runtime-registration and regression
checks, not native rendering acceptance. Windows and fullscreen remain untested.

Target Seanime/Denshi **3.10.4**, source
`4bdff7b27b6c043dc87c0ccad3ead54596133a05`. This report distinguishes
source inspection, build checks and actual native observations. The full
integration must not proceed through this gate on SDK or browser evidence alone.

## Probe

From this package run `npm ci` and `npm run build`. The self-contained local
manifest is `dist/langplay-probe.json`, ID `langplay-probe`. It contains its
payload and requires no remote payload URL. Copy it as `langplay-probe.json`
into the **disposable** Seanime data directory's `extensions/` folder.
Launch the matching host against that directory, acknowledge its playback
and library-read permissions in host settings, then open the sidebar's plugin
tray list and select **LangPlay native feasibility probe** (unpinning is the
host default; the plugin may not have its own visible sidebar icon).
No network, write paths, shell execution or credentials are requested.

The probe inspects renderer/session/status/track metadata, samples the last
120 status-event intervals, requests pause on a selected pasted test line,
leaves playback paused on close/Escape and explicitly resumes only the same
session. It can enumerate up to 201 neighboring directory entries and read
at most 10 MiB from an explicitly supplied text-subtitle path using a file
descriptor. Byte mutation/return semantics passed in the actual Linux Goja
runtime with a generated 696-byte ASS fixture. It does
not claim synchronized native subtitle selection or a completed dictionary UI.

## Evidence as of 2026-10-15

| Check | Linux | Windows |
| --- | --- | --- |
| Official Denshi release acquired and SHA-256 verified | PASS | NOT RUN |
| Source/SDK inspection and isolated callback bundle smoke | PASS | Platform independent only |
| Load probe in actual Goja/host | PASS, official sidecar + browser attachment | NOT RUN |
| Host → iframe → host messages without an account | PASS, JSON-string replies; see workaround below | NOT RUN |
| Embedded libmpv renderer/version recorded during playback | NOT RUN | NOT RUN |
| Click/pause/drawer/resume, windowed + fullscreen | NOT RUN | NOT RUN |
| Host theme, keyboard focus and control safe area | NOT RUN | NOT RUN |
| Embedded ASS text retrieval | NOT PROVEN: getter is stubbed in target source | Same source gap; NOT RUN |
| Imported bounded bytes / size rejection / allowlist denial | PASS in real Goja; not native UI proof | NOT RUN |
| Adjacent files for active native playback | NOT RUN | NOT RUN |
| Status cadence and seeks meet timing targets | NOT RUN | NOT RUN |

Linux available environment: Wayland/Hyprland, Linux 7.2.5-3-omarchy,
Intel Iris Xe Tiger Lake. System mpv 0.41.0 is **not** the measured embedded
libmpv version. Native app automation is unavailable in this session; browser
control cannot establish native overlay/fullscreen acceptance. No interactive
Windows machine is connected.

Official Linux AppImage SHA-256 (matches GitHub release asset digest):
`bc1d3b5b045b1be1378f4501afc436bf282c052d5fb254513addf2e3af7014f5`.
It is extracted only under `/tmp/langplay-native-probe/`; no active profile is
modified. Source references below are pinned to the target SHA.

The official sidecar's embedded Go build information also reports
`vcs.revision=4bdff7b27b6c043dc87c0ccad3ead54596133a05`, matching the tag.

## Runtime observations and reproduction

The disposable host ran on `127.0.0.1:43219`, using only generated media in
`/tmp/langplay-native-probe/media` and a new database under
`/tmp/langplay-native-probe/data`. Downloading/debrid were set to None, the
AniList login was dismissed, and no library scan or tracking writes were
requested. The test host was stopped after collecting evidence.

Example sidecar invocation (tests Goja/browser attachment, **not native video**):

```sh
seanime-server-linux-amd64 --datadir /tmp/langplay-native-probe/data \
  --host 127.0.0.1 --port 43219 --desktop-sidecar
```

Observed through the actual probe:

- Inspect active player: empty client/renderer, `textTracks: null`, and
  `byteAPI: "function"` with no playback. This is not an embedded extraction test.
- Read generated `LangPlay Test - 01.ja.ass`: size **696**, first sample bytes
  `91,83,99,114,105,112,116,32,73,110,102,111,93` (`[Script Info]`).
- Read sparse `oversize.srt` of **10,485,761** bytes: rejected before allocation
  with `Subtitle must be between 1 byte and 10 MiB.`
- Read `/tmp/langplay-outside-library.srt`: rejected by `$os.openFile` as
  `not authorized for read` rather than reading outside the fixture root.

The built callback successfully creates the webview/tray in isolated Goja.
The host-side API is `panel.channel.on/send`; the injected **browser** bridge
is `webview.on/send` (no `channel`). A regression test now checks that boundary.

The pinned host's
[`internal/plugin/ui/webview.go`](https://github.com/5rahim/seanime/blob/4bdff7b27b6c043dc87c0ccad3ead54596133a05/internal/plugin/ui/webview.go#L889)
drops object-valued replies when the AniList token is empty: its token check
calls `strings.Contains(encoded, "")`. This caused no reply in a local-only
profile. The probe now serializes its credential-free replies as JSON strings;
round trips then passed without logging in. Any production bridge should retain
explicit secret exclusion and a versioned validated envelope. A possible host
fix is to check `anilistToken != ""` before substring matching; this proposal
has not been applied to the host.

Evidence screenshot: `captures/host-probe.png` (generated, ignored). It shows
the real host and successful byte read, not the accepted production UI or a
native playback result. Server logs and generated media remain under
`/tmp/langplay-native-probe/` for local investigation. No credentials are in
the plugin or test captures.

## Confirmed source gap and smallest proposed host change

[`internal/plugin/videocore.go:1062`](https://github.com/5rahim/seanime/blob/4bdff7b27b6c043dc87c0ccad3ead54596133a05/internal/plugin/videocore.go#L1062)
implements `getTextTracks()` by immediately resolving `undefined`. The SDK's
`VideoTextTrack` only describes labels/indices/language, without cue text.
`getCurrentPlaybackInfo().subtitleTracks` may contain external `content` or
`src`; that is not proof that embedded native ASS is extracted. Reading an
entire MKV into the plugin is incompatible with the intended bounded input.
Descriptor-based range reads do work; implementing a Matroska extractor or
using an existing host extraction route still requires a separate feasibility
decision. A stubbed convenience getter alone does not prove all alternatives
impossible.

If the remaining native probe confirms no usable extraction route, propose a
bounded, session-scoped **read-only text-track API**. This is a concrete option
for review, not an implemented or approved host change:

1. `internal/extension_repo/goja_plugin_types/plugin.d.ts`: define a separate
   `readSubtitleText({clientId, playbackId, trackNumber, maxBytes})` response
   with source format, encoding, bytes and stable source identity. Reject
   bitmap tracks and stale sessions. Cap at 10 MiB and support cancellation.
2. `internal/plugin/videocore.go`: bind/validate that API, require playback
   permission and return an explicit unavailable/stale/too-large error.
3. `internal/mpvcore/adapter.go` and
   `seanime-web/src/app/(main)/_features/mpv-core/mpv-core-player-inner.tsx`:
   transport the guarded request to the active native renderer and supply
   extracted embedded subtitle bytes through the existing media extraction
   layer. Exact extraction implementation requires host-maintainer review;
   metadata-only `track-list` or current `sub-text` cannot supply a transcript.
4. Add host tests for wrong-client rejection, bitmap tracks, cancellation,
   byte limits and actual MKV ASS extraction. Keep original ASS/fonts used by
   libmpv untouched. Do not reuse `getTextTracks` with an incompatible shape.

The accepted UI may also need a documented player-overlay mount slot:
`newWebview({slot: 'fixed'})` currently portals to `document.body`, whereas
the native player mounts its own drawer and canvas. Native input/stacking
must decide whether a small host slot is needed; z-index alone is not proof.

Dependent M03/M04 and production UI remain pending. Per the approved plan,
M05–M08 can progress independently. No host patch or architecture change is
silently included in LangPlay.

## Remaining native checklist

On each OS, use a disposable Denshi 3.10.4 profile and record the actual
embedded libmpv version, GPU, display backend and client/renderer IDs. Play
the generated H.264 MKV with embedded Japanese ASS plus adjacent ASS/SRT;
repeat with HEVC 10-bit and a Unicode path. Open this probe over the actual
video, exercise selection/pause/close/Escape/explicit resume in windowed and
fullscreen, and confirm input stacking/focus/theme. Inspect track content and
directory reads during active playback, record status cadence and seek response,
and test an episode/client switch while the drawer is open. A pasted test line
only proves control attachment; synchronized word selection still needs the
production source/overlay path. Do not mark M02 complete until required native
cells on both OSes pass or an approved host API change resolves a confirmed gap.
