# LangPlay integration with Seanime

Status: Draft for review. This document specifies behavior and proposed boundaries; it does not authorize implementation or freeze a test harness.

Date: 15 October 2026, Asia/Jakarta.

UI direction and isolated interaction study: [LangPlay UI direction](langplay-ui-direction.md). The user subsequently confirmed that learning tools should stay hidden while watching and open on a subtitle click. This authorizes UI direction exploration; native integration remains subject to the requirements below.

## 1. Intended outcome and decisions

On Linux and Windows, a user can browse a local anime collection in Seanime, open an identified episode, find and configure Japanese subtitles, and use LangPlay's word lookup, readings, AI explanations, and Anki export while watching. Seanime continues to own playback and watch tracking.

Confirmed by the user:

- Support Linux and Windows.
- The first release covers library browsing, title/episode tracking, and Japanese subtitle discovery.
- Begin with an integration prototype before completing that release.
- Keep the video clear during watching; show the learning tools on subtitle selection.

Proposed defaults for review:

- Deliver a Seanime plugin plus the existing LangPlay Python companion, rather than a player fork.
- Show Jimaku candidates before downloading; remember the selected file. This preference was asked but has not yet been answered.
- Retain the existing browser/YouTube experience and its settings.
- Use Seanime's configured tracking account and completion rules; do not create another AniList integration.
- The first release documents manual companion startup on both platforms. Bundled Python and automatic desktop startup are later work.
- The plugin initially supports the existing companion's AI analysis/chat contract. Porting every browser-direct AI provider is not required for this release; existing browser providers remain supported by the browser extension.

Example: A user opens episode 3 from their scanned library, selects a Japanese subtitle from Jimaku, adjusts its timing by +0.5 seconds, and clicks `来ない`. Playback pauses; the drawer retains the clicked sentence, shows the reading and dictionary form `来る`, and offers an explanation and Anki export. Reopening that same video restores its subtitle selection and offset. Seanime handles resume position and episode completion as usual.

## 2. Inspection baseline

| Component | Inspected baseline | Relevant evidence |
| --- | --- | --- |
| LangPlay | `main`, commit `230c4c3127d852d548a0312e4ea443c652907d09` | JavaScript browser/standalone UI and Python companion; existing parser, AI, and Anki paths. [Source tree](https://github.com/Marsel204/LangPlay/tree/230c4c3127d852d548a0312e4ea443c652907d09) |
| Seanime | `main`, commit `4bdff7b27b6c043dc87c0ccad3ead54596133a05`; release target `v3.10.4` | Existing library/tracking and plugin/player interfaces. [Release](https://github.com/5rahim/seanime/releases/tag/v3.10.4), [source tree](https://github.com/5rahim/seanime/tree/4bdff7b27b6c043dc87c0ccad3ead54596133a05) |
| Jimaku | Public OpenAPI specification retrieved 15 October 2026 | API-key authentication; AniList search; episode-filtered file listing. [API documentation](https://jimaku.cc/api/docs), [OpenAPI](https://jimaku.cc/api/openapi.json) |
| Current local workspace | Empty Git repository, no commits, remote, application source, project instructions, or AEK enrollment found | The specification is the only project artifact created here. No `init` baseline, approved architecture, or protected harness exists to reuse; `aek context` does not apply. |

The implementation checkout must be prepared from the inspected LangPlay baseline before changing application code. Proposed repository paths below refer to that project, not to source already present in this workspace. Recheck host APIs against the selected release before implementation.

### Existing behavior and interfaces

- `extension/js/player-controller.js` controls HTML5 and YouTube playback. It is not a native playback backend.
- `extension/js/subtitles.js` parses VTT, SRT, and LRC and maintains one current cue. It has no ASS/SSA parser. Anime may have overlapping dialogue/sign cues, so a single-index assumption cannot be carried into the new cue model.
- `extension/js/japanese-parser.js` accepts an injected transport; its default uses Chrome messaging. It validates UTF-16 offsets, deduplicates pending requests, and bounds its cache to 256 lines.
- `japanese_parser.py` returns lossless text spans, readings, dictionary forms, and morphology. `POST /api/parse` returns `{status, engine, tokens}`; missing dependencies return 503. Preserve its existing validation and limits.
- `extension/js/ai.js` mixes provider logic, rendering, storage, and browser-specific calls. It needs an adapter; copying it unchanged into a Seanime plugin is insufficient.
- `extension/js/anki.js` exports text/HTML to an Anki `Basic` note through AnkiConnect API version 6, with a saved-card/TSV fallback. It does not currently provide audio or screenshot mining.
- `Server.py` already exposes `/api/parse`, `/api/ai/status`, `/api/ai/analyze`, `/api/ai/chat`, `/api/bookmark`, and `/api/bookmarks`. Preserve current clients and response contracts. AI status is not a parser-readiness check.

Sources: [LangPlay extension](https://github.com/Marsel204/LangPlay/tree/230c4c3127d852d548a0312e4ea443c652907d09/extension), [parser](https://github.com/Marsel204/LangPlay/blob/230c4c3127d852d548a0312e4ea443c652907d09/japanese_parser.py), [server](https://github.com/Marsel204/LangPlay/blob/230c4c3127d852d548a0312e4ea443c652907d09/Server.py).

### Host compatibility findings

Seanime plugin callbacks execute in isolated runtimes. UI operations, persistent storage, and network requests must use host APIs; ordinary browser globals and Chrome APIs are not generally available. A plugin webview may host browser code, with operations passed through its host message channel. [Plugin runtime documentation](https://seanime.gitbook.io/seanime-extensions/plugins/write-test-share), [UI/network documentation](https://seanime.gitbook.io/seanime-extensions/plugins/ui/basics).

The inspected runtime says `videoCore` controls both VideoCore and MpvCore. Its event mapping can emit `web`, `native`, or `mpv`, while the inspected declaration file's `PlayerType` lists only `native | web`. Detect actual capabilities and isolate compatibility types in the adapter; do not equate `native` with MpvCore. Player controls exist, but the inspected sources do not prove that plugin UI can overlay every native/fullscreen video surface or obtain every embedded track's text. [Runtime](https://github.com/5rahim/seanime/blob/4bdff7b27b6c043dc87c0ccad3ead54596133a05/internal/plugin/videocore.go), [MpvCore adapter](https://github.com/5rahim/seanime/blob/4bdff7b27b6c043dc87c0ccad3ead54596133a05/internal/mpvcore/adapter.go), [declarations](https://github.com/5rahim/seanime/blob/4bdff7b27b6c043dc87c0ccad3ead54596133a05/internal/extension_repo/goja_plugin_types/plugin.d.ts).

## 3. Release scope

### Included

- Seanime local library browsing, identification, metadata correction, episode selection, resume, and existing tracking behavior.
- Integration with Seanime Denshi's embedded libmpv playback on both target platforms; browser playback is a useful development path, not a substitute for desktop validation.
- Embedded Japanese text tracks, adjacent local subtitle files, explicit file import, and Jimaku discovery/download.
- SRT, WebVTT, ASS, and SSA text subtitles; dialogue navigation, repeat, offset adjustment, and persistent preferences.
- LangPlay readings, dictionary lookup, contextual AI analysis/chat, text/HTML Anki export, and saved-card/TSV fallback.
- Setup instructions and a versioned plugin manifest/payload that can be installed locally.

### Deferred

- Another library scanner, video engine, metadata database, or tracker account system.
- Mobile, remote/NAS deployments, external standalone mpv/VLC windows, watch parties, or multi-client sessions.
- Torrent/source discovery or media downloading.
- OpenSubtitles and other additional subtitle providers; Jimaku is the first provider.
- Speech transcription, OCR of image/burned-in subtitles, automatic retiming, and subtitle editing.
- Audio/screenshot Anki cards, automatic card upload/retry, cloud settings sync, and one-click bundled installers.
- Automatic RAR/7z extraction. Display such results with a clear manual-extraction route instead of treating them as usable text subtitles.

## 4. Functional requirements

### FR-01 — Local library and identity

Use Seanime's existing library screens and scanner. The plugin consumes the selected media ID, episode identity, local-file identity, playback ID, and client ID. It does not independently match every filename or rename/move media.

Handle multiple library roots, Unicode/space-containing Windows and Linux paths, split cours, movies, specials, duplicate releases, and absolute versus season-relative numbering. Title or episode correction uses Seanime's existing workflow. If identity is missing or ambiguous, manual subtitles remain usable; automatic Jimaku lookup must ask for a title/episode selection rather than silently guessing.

### FR-02 — Watch tracking

Seanime owns watched status, resume position, episode-completion thresholds, and AniList updates. The plugin does not maintain a parallel watched list or issue independent progress mutations. Respect the host's tracking configuration and account prerequisites; first-run offline identification is not promised.

Learning pauses, subtitle jumps, repeated lines, and rewatching must not cause additional progress writes compared with the same controls used directly in Seanime. Do not promise to change how the host treats seeking or offline sync. Preserve cached-library playback when the host is offline; subtitle and learning failures must not disable it.

### FR-03 — Subtitle source resolution

On opening a video, restore a valid saved selection for that exact video first. Otherwise prefer an existing Japanese text track, then a matching adjacent Japanese subtitle. Respect an explicit user selection over automatic preference. Language tags may be missing or incorrect; let the user override them.

Provide `Find Japanese subtitles` and `Import subtitle file` actions. Do not search the web or download files just because playback started. Missing sources leave ordinary playback available and show the two actions.

Discover/import text through existing Seanime facilities where available. Embedded cue extraction and adjacent-file access are prototype proof points, not assumed SDK capabilities. If public APIs cannot supply them, document a concrete adapter or upstream change before widening the implementation; do not silently omit embedded-track support from the release.

### FR-04 — Jimaku discovery and selection

Use the documented API rather than scraping pages:

- `GET /api/entries/search?anilist_id=<id>` for a known title.
- `GET /api/entries/{id}/files?episode=<number>` for candidate files; omit the episode filter for movies and allow listing all files when filtering is inconclusive.
- Use title search only when an exact ID is unavailable or the user explicitly changes the title.

Authenticate with the raw API key in the `Authorization` header. Send a descriptive `User-Agent` or `X-Client-Id` as supported by the transport. Honor rate-limit/reset headers and 429 responses; never continuously retry during playback.

Show candidate filename, format, size when available, and a preview after retrieval. Explain that episode matching is based on filenames and does not establish release/timing compatibility. Prioritize exact identity and plausible episode/release matches, but do not label an unverified result as verified. Let the user correct a subtitle-only episode mapping without changing watch progress.

By the proposed default, download only after selection. Cache the chosen source and local content so reopening the video does not require another download. Offer refresh, replace, remove cached subtitle, and forget selection. Empty results, invalid/expired credentials, provider outages, and rate limiting each have distinct actionable messages. [Jimaku API](https://jimaku.cc/api/docs).

### FR-05 — Formats and cue normalization

Keep the original subtitle content for host rendering and a separate normalized text timeline for learning. Preserve line breaks and overlapping cues. Remove ASS override/drawing commands from lookup text without altering the original styled file. Signs and karaoke must not become executable markup or dominate the dialogue list; offer a dialogue-style filter when the source supplies style metadata.

Support UTF-8 and BOM detection; allow explicit Shift_JIS decoding for Japanese files instead of silently displaying corrupted text. A ZIP candidate may contain several episodes: list its supported subtitle members and let the user choose. Reject archive traversal and expansion beyond the stated limits. Unsupported formats have a manual alternative; malformed files leave the previous usable selection intact.

Represent active cues as a set, with stable IDs and deterministic ordering. Clicking a cue or token captures that exact text, offset, and token span even if playback advances before an asynchronous response arrives.

### FR-06 — Interactive learning

Display selectable Japanese text with furigana, romaji, and plain-text modes. Supply next/previous dialogue, repeat current dialogue, copy sentence, subtitle visibility, and a scrollable transcript.

Clicking a token pauses the correct playback session and opens the learning drawer. Show the existing dictionary/fallback result promptly; morphology and AI enrich it asynchronously. Freeze the clicked sentence and word as the analysis/card context. Explicit resume is required; dismissing a drawer or finishing an API request must not resume playback unexpectedly.

If the parser is unavailable, retain readable subtitles and lightweight fallback lookup, indicate reduced readings, and recover after the service returns. Fictional names and ambiguous readings remain fallible; missing dictionary entries must not be replaced with invented definitions. AI analysis is an explicit action; do not send every subtitle line to a remote provider.

The clicked overlay and drawer must work in windowed and fullscreen desktop playback. Avoid duplicate host/learning captions by providing an explicit display mode and restoring the user's original host subtitle selection on disable/unload. Do not hide the host's subtitles until the learning layer is ready.

### FR-07 — Timing and settings

Define positive offset as delaying a subtitle: a source cue at 10.0 seconds appears at video time 10.5 when offset is +0.5. The host display and learning layer must use the same effective offset exactly once.

Provide +/-0.1-second and +/-0.5-second controls, numeric entry, and reset. Store offset with video identity and subtitle content identity so another release or replacement file cannot inherit an incorrect offset. Restore selection, encoding, and offset for the same video/subtitle after restart.

Persist global reading mode, Japanese font/font size, position, companion URL, and Anki deck/model-field mapping. Allow series-level presentation overrides and Japanese audio/subtitle preferences where the host supports them. Per-video timing takes precedence over presentation defaults. Use available Japanese font fallback and expose a missing-font/setup message when necessary.

### FR-08 — Companion and AI

Reuse the Python companion and the existing parse/analyze/chat contracts through an injected transport. The plugin runtime owns requests; browser/webview code uses a validated host message channel and does not assume `chrome.*`, unrestricted `fetch`, or shared globals.

Default to the local companion at `http://127.0.0.1:8000`. Parser readiness, AI-provider readiness, and Anki connectivity are separate states. Provide editable settings and retry actions without requiring a player restart. Connection failures cannot block playback or local subtitle navigation.

Expose the providers supported by the companion; an optional local CLI is usable only when installed and available on that platform. Allow an existing configured provider/model rather than adding a new mandatory provider or subscription. Preserve AI cancellation and discard late responses after selection/session changes. Timeouts and provider errors appear in the drawer without losing the selected sentence.

### FR-09 — Anki and saved cards

Send selected word, reading, meaning/explanation, and captured sentence through a transport-independent card service. Include anime title, episode, and timestamp as source context. Default to the current text/HTML `Basic` workflow, with configurable deck and compatible field mapping; validate a mapping before export.

If AnkiConnect is unavailable, persist the card locally and offer TSV export or explicit retry. Display whether a card was added to Anki or saved locally. Preserve cards across plugin reload/restart. Disable repeated submission while one is pending, avoid creating two local queue entries for one action, and handle uncertain network outcomes without automatically retrying a possibly successful add.

### FR-10 — Lifecycle and recovery

Bind events and asynchronous work to `{clientId, playbackId, videoIdentity}`. Switching episodes clears the previous active cues and invalidates old parser/AI/download results. Track switches, seeks, speed changes, pause/resume, fullscreen changes, and plugin reloads re-anchor synchronization to the host.

On disable/unload, detach listeners/timers, cancel pending work where possible, remove plugin UI, and restore only subtitle state the plugin changed. Do not stop the companion or another user's session. Re-enabling must create one working overlay, not duplicate handlers.

## 5. Proposed architecture and ownership

These are proposed boundaries for review, not pre-existing approved invariants.

| Module | Owns | Boundary |
| --- | --- | --- |
| Seanime host | Library, media/episode identity, video decoding, resume and tracking | No replacement scanner, playback engine, or direct tracker writes in LangPlay |
| Seanime adapter | Version/capability detection; session events and controls; subtitle retrieval/loading; host UI attachment | All SDK-specific calls and compatibility work stay here |
| Learning core | Cue normalization/selection, immutable word context, morphology presentation, explanation/card data | No Chrome, Seanime, DOM, filesystem, or provider-global dependencies |
| Plugin UI/webview | Overlay, transcript, drawer, settings, candidate picker | Uses narrow validated messages; no API keys in DOM/iframe HTML |
| Subtitle provider | Jimaku lookup, downloads, archive/member selection, cache metadata | Uses host-owned network/file transports; does not modify media or tracker identity |
| Companion adapter | Existing parser and AI contracts, health states, cancellation | Preserve HTTP compatibility for current LangPlay clients |
| Storage/card adapters | Namespaced versioned settings, subtitle selections, saved cards, Anki requests | No dependency on browser storage APIs outside adapters |

Proposed implementation locations in the existing LangPlay repository:

- `integrations/seanime/`: manifest, build entry, host adapter, UI, provider/storage adapters, compatibility notes, and integration tests.
- `shared/learning/`: extracted reusable learning/cue/card logic. Keep extraction limited to code actually needed by both clients.
- Existing `extension/` and `static/` entry points continue to work, using adapters where shared code is extracted.
- Existing `Server.py` and parser remain the companion; add only narrowly specified capabilities if the prototype demonstrates a need.

Prefer a bundled self-contained plugin payload and static UI assets, with versioned host SDK declarations. Do not require users to install the Chrome extension to run the Seanime integration. Use host storage/channel APIs rather than exposing arbitrary file/process/network operations to the webview.

### Minimum internal contracts

- `PlaybackContext`: host client/playback ID, renderer kind as an extensible string, media ID when available, episode/movie identity, stable host local-file ID, position, duration, rate, paused state, and observed capabilities.
- `SubtitleSelection`: video identity, source kind, source entry/file URL or local identifier, content hash, encoding, display label, and offset in integer milliseconds.
- `Cue`: stable ID, start/end in milliseconds, clean text, original source/style metadata, and sequence/layer information. Do not mix milliseconds with SDK seconds; convert at the adapter boundary.
- `WordContext`: immutable session/selection generation, cue IDs, sentence, UTF-16 span, surface, reading/lemma when available, source title/episode, and timestamp.
- `Preferences` and `SavedCard`: schema version and namespaced keys; exclude credentials from ordinary export and logs. Video identity cannot consist only of a filename; duplicate releases stay distinct.

## 6. Reliability and resource targets

The following are proposed acceptance targets, not measurements from this specification task.

- On recorded reference hardware with 8 GiB RAM, 1080p local playback must remain usable with parser/AI/Jimaku/Anki disconnected. Test one H.264 file and one HEVC 10-bit file on supported desktop builds; record hardware acceleration and host-only behavior.
- Cue transition error against video timestamps: p95 <=200 ms during steady playback. A seek/track switch corrects the learning layer within 300 ms of receiving the host's new authoritative state. Measure renderer event cadence in the prototype; do not infer it from the SDK declarations.
- On the reference machine, clicking a token shows a paused/pending drawer within 150 ms p95, independently of AI latency. An already cached short-line lookup completes within 250 ms p95. Record cold parser initialization separately; do not block video during it.
- Prefetch only a small upcoming cue window, deduplicate work, retain the existing 256-line parser-cache bound, and limit new parser concurrency to four requests. Cancel/discard obsolete work.
- Default new remote-request timeout: 15 seconds for Jimaku search/download and 3 seconds for local service readiness/Anki; keep the companion's existing AI deadlines, show progress, and expose cancellation.
- Initial processing limits: 10 MiB per text subtitle, 50 MiB per downloaded archive, 100 MiB total expanded content, 200 archive members, and 1,000 stored subtitle selections. A limit rejection explains manual import/removal options. These limits are configurable implementation constants, not a reason to alter unrelated existing API limits.
- Persistent subtitle cache: 500 MiB default, evict least-recently-used unpinned content, retain selection metadata, and provide clear/forget actions. Never evict saved cards as part of subtitle cache cleanup.

Only configured providers receive requests. Keep credentials in host/companion configuration and redact them in diagnostics. Render subtitle, dictionary, and AI text safely; validate webview message shape/session and constrain download destinations. Preserve source media and original subtitle files. Existing broad companion CORS behavior is a known baseline, not a security feature to rely on or silently widen.

## 7. Failure behavior

| Condition | Required behavior |
| --- | --- |
| Unknown anime/episode or wrong season mapping | Keep playback/manual import usable; expose host correction or subtitle-only mapping |
| No Japanese text track, image track only, or burned-in subtitles | Explain that interactive lookup needs a text subtitle; offer Jimaku/import; do not claim OCR support |
| Missing Jimaku key, 401/403, 429, outage, or no matches | Distinct setup/retry/reset/empty states; no repeated automatic traffic |
| Wrong release or drifting timing | Show filename and offset controls; allow replacement; explain automatic retiming is deferred |
| Invalid subtitle/archive/encoding or unsupported member | Preserve the current working subtitle and give a specific recovery action |
| Parser missing or incompatible server (including 404/503) | Readable fallback, bounded retry, recover without reopening video |
| AI unavailable, malformed, canceled, or late | Preserve clicked context, show error/retry, ignore stale result; no automatic provider switch |
| Anki closed, field mismatch, or uncertain export result | Preserve data locally, show precise status, require explicit retry where duplication is possible |
| Missing native capabilities or host version mismatch | Disable affected learning actions with a compatibility message; keep ordinary Seanime playback |
| Disk full, missing cached file, read-only library, moved video | No data-loss claim; report persistence failure, allow reselect/import, keep saved cards separate |

## 8. Acceptance criteria

All desktop criteria apply to both Linux and Windows unless explicitly stated.

| ID | Observable acceptance check |
| --- | --- |
| AC-01 | Existing Seanime scanning/browsing opens correctly identified episodes from two library roots, including Unicode/space-containing paths; host correction remains available. |
| AC-02 | Plugin-on and plugin-off runs follow the same host watched/resume rules for pause, repeat, seek, finish, and reopen. No additional tracker mutation originates in the plugin. |
| AC-03 | The prototype demonstrates a clickable overlay and drawer over actual embedded libmpv video in windowed and fullscreen mode on both operating systems. Browser-only success does not pass. |
| AC-04 | Imported SRT/VTT/ASS/SSA fixtures display synchronized clean learning text; an embedded ASS track is also accessible. Overlapping dialogue remains selectable and ASS drawing commands are excluded from lookup text. |
| AC-05 | Known AniList ID/episode lookup lists Jimaku candidates; a selected file or supported ZIP member loads and is cached. No download occurs before selection under the proposed default. |
| AC-06 | An unknown title, movie, special, and episode-number mismatch can be resolved manually without changing watch progress or loading an unrelated title silently. |
| AC-07 | A +0.5-second offset delays both displayed and clickable cues by 0.5 seconds exactly once. It survives restart for the same video/content and does not transfer to another release/content hash. |
| AC-08 | Clicking `来ない` captures the sentence, pauses playback, and uses the parser's `来る` lemma when available. A late response from another cue/video cannot replace that context. |
| AC-09 | Furigana/romaji/plain modes, transcript seek, previous/next, repeat, copy, visibility, font size, and position work without breaking normal player shortcuts or keyboard focus. |
| AC-10 | Companion offline, parser 404/503, AI timeout, and unavailable dictionary entries retain local playback/subtitle navigation with accurate reduced-function/error states. Recovery needs no player restart. |
| AC-11 | A real configured companion AI provider returns analysis and contextual chat for the captured sentence. Automated checks use fixtures; a live smoke check is explicit and records provider/result without storing credentials. |
| AC-12 | Anki export adds one correctly mapped text/HTML note with source context. When Anki is closed, one saved card survives restart and can be exported as TSV. No automatic ambiguous retry creates a duplicate. |
| AC-13 | Missing/invalid Jimaku credentials, empty results, 429 headers, malformed files, unsupported archives, traversal, and resource-limit failures follow section 7 without damaging working state. |
| AC-14 | Seek, speed change, track switch, next episode, disable/re-enable, and plugin reload produce no stale drawer updates, duplicate overlays, orphan timers, or changes to another session. |
| AC-15 | The timing/responsiveness targets in section 6 are measured on disclosed hardware. A 30-minute session does not show continuously growing pending work or caches beyond their limits. |
| AC-16 | Setup instructions install the plugin and run/check the existing companion on a clean Linux and Windows setup; optional AI/Anki/Jimaku prerequisites are individually explained. |
| AC-17 | Existing LangPlay browser/standalone regression checks relevant to changed shared modules still pass; original endpoints/settings/Chrome startup behavior remain compatible. |
| AC-18 | Disabling/uninstalling the plugin restores the host subtitle state it changed, leaves media untouched, and does not delete saved-card data without an explicit data-removal action. |

## 9. Existing coverage and verification proposal

Inspected coverage to preserve and reuse where relevant:

- `tests/test_japanese_parser.py`: morphology, lossless UTF-16 spans, cache isolation, concurrent requests, HTTP validation, missing engine, and error handling.
- `tests/browser_japanese_parsing_checks.mjs` and `tests/test_japanese_parser.js`: browser/parser integration and fallback behavior.
- `tests/test_drawer_context_sentence.js` and related drawer regressions: clicked context and presentation.
- `tests/browser_subtitle_visibility_checks.mjs`: subtitle visibility behavior.
- `tests/test_ai_chat.py`, `tests/test_ai_timeout.py`, and `tests/browser_custom_ai.mjs`: AI context, custom-provider routes, cancellation/timeouts, and UI behavior.
- `tests/test_native_host.py` and startup browser/JavaScript checks: current Chrome launcher behavior, not a Windows Seanime launcher.
- Seanime's `internal/plugin/videocore_test.go`: upstream player command/event coverage; useful evidence, not proof of actual desktop overlay behavior.

New requirement-focused coverage should exercise ASS/overlap normalization, time units/offsets, candidate identity and episode mapping, immutable async context, persistence isolation, provider failure/limits, and Anki uncertain outcomes. Integration checks should load the real plugin in the pinned host; mocks alone cannot establish native UI compatibility.

Create a fixture corpus with redistribution-safe generated subtitle files and user-supplied/local video samples. Include movie, special, multi-episode/absolute numbering, duplicate releases, Unicode filenames, simultaneous cues, malformed text, and UTF-8/Shift_JIS. Use mocked provider responses for routine tests and a small authenticated live Jimaku smoke check only when a user key is available.

No application tests, native playback tests, live authenticated provider calls, or Windows checks were run while preparing this document. Test commands, exact fixtures, and any harness additions belong in the subsequent plan/test proposal; no harness is frozen here.

## 10. Delivery sequence and decision points

1. **Compatibility prototype:** Pin host/build versions. Demonstrate session-specific control, reliable time events, embedded/external text access, interactive overlay/drawer, and fullscreen on Linux and Windows. Use one explanation request and one text Anki export to prove the transport boundaries.
2. **Library and tracking integration:** Connect selected title/episode/file identity; verify host-owned resume/tracking and correction flows. Do not rebuild the host's existing screens.
3. **Subtitle workflow:** Add Jimaku selection/download, adjacent/imported subtitles, format/encoding support, timing controls, and persistence.
4. **Learning and recovery:** Complete readings, dictionary, analysis/chat, navigation, saved cards, settings, lifecycle cleanup, and failure states.
5. **Release verification:** Complete the acceptance matrix on both operating systems and document installation, supported host version, evidence, and remaining limitations.

The prototype is a technical feasibility checkpoint, not an extra permission gate. If the existing APIs cannot meet embedded/fullscreen requirements, produce a concrete explanation and a small upstream change or revised architecture proposal. A web-only or separate-browser workaround does not count as the requested desktop integration. Publishing, upstream PRs, installation into the user's active player, and deployment are outside this specification task.

## 11. Outstanding decisions

- Candidate-first versus automatic Jimaku selection: awaiting the user's optional preference; candidate-first is the draft default.
- Actual Denshi/libmpv builds and Linux compositor/display setup used for acceptance: record during the prototype alongside Windows version and hardware. Do not claim support based only on SDK names.
- Exact embedded-text extraction and fullscreen UI attachment: resolve with the prototype before detailed implementation planning for those adapters.
- Companion-supported AI provider/model available for each live smoke check: use an already configured provider; absence of credentials does not prevent offline/mocked development.

All other defaults above are explicit reviewable scope choices. There is no request to enroll AEK, add GitHub approval machinery, publish a plugin, or implement application changes in this task.
