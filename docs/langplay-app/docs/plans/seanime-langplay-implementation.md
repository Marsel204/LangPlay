# LangPlay × Seanime implementation plan

Status: Ready for implementation review. This request produces a plan; application implementation has not started.

Date: 15 October 2026, Asia/Jakarta.

Inputs: [integration specification](../specs/seanime-langplay-integration.md), [accepted working UI direction](../specs/langplay-ui-direction.md), [design record](../../DESIGN.md), and the interactive study in `prototypes/langplay-ui/`.

## 1. Outcome and settled scope

Deliver a locally installable Seanime plugin for Linux and Windows that uses the host's library and watch tracking, supplies Japanese text subtitles from local sources and Jimaku, and adds LangPlay's readings, dictionary lookup, explanations, chat, and text/HTML Anki workflow.

Carry the reviewed UI forward: the picture stays clear while watching; a subtitle selection pauses playback and opens one contextual drawer; close/Escape keeps playback paused; explicit resume returns to watching. Subtitle selection, transcript, and appearance share that drawer. Use the current amber treatment as the working preview baseline and map production controls to the host's theme. No further visual-direction round is required to begin the engineering prototype.

Planning decisions:

- Use a plugin and the existing Python companion. Do not fork the player or rebuild its library/tracker.
- Use candidate-first Jimaku selection, as demonstrated in the current study. Remember the user's selection. Automatic best-match loading remains a later option, not an unresolved blocker.
- Keep production code in a scoped integration package inside the existing LangPlay repository. Preserve the browser extension and standalone player.
- Use plain JavaScript modules and CSS, a scoped npm package, and a reproducible bundling step. Do not introduce a separate React application or change the root module mode.
- Reuse `LinguaPlayParser.create({transport, ...})` and available dictionary data. Keep plugin-only pure helpers inside the integration until a second client actually needs them. Do not move code into a root shared directory merely to create scaffolding: the Chrome extension is loaded from `extension/` and cannot directly load arbitrary files outside that root.
- Initially support the companion's existing analysis/chat providers. Every browser-direct provider, bundled Python/startup, OCR/ASR, automatic retiming, richer media cards, mobile, remote deployments, and additional subtitle providers remain deferred.

## 2. Repository facts and preparation

Read-only inspection found the actual source checkout at `/home/marsel/Projects/LangPlay`: clean `main`, tracking `origin/main`, commit `230c4c3127d852d548a0312e4ea443c652907d09`, remote `github.com/Marsel204/LangPlay`. It matches the specification's LangPlay baseline. This discovery supersedes the earlier need to locate or prepare a source checkout.

The current design workspace at `/home/marsel/Documents/ChatGPT/LangPlay App` contains specifications, design records, and the study, all uncommitted in a repository with no commits or remote. Preserve it in place. Do not overwrite it with an upstream checkout, treat the temporary reference clone as production, or move its Git metadata.

Neither workspace has `.aek/project.json`; no applicable `AGENTS.md`, initial `init` baseline, approved architecture snapshot, or protected harness was found. Use the existing source/tests and this plan. There is no additional AEK/GitHub approval mechanism to invent. Recheck instructions and enrollment before implementation; if enrollment subsequently appears, its actual requirements apply.

When implementation is requested, recheck the source checkout for new work, then create `codex/seanime-langplay` from the inspected baseline. If it has become dirty or another task is using it, use an isolated checkout without resetting or discarding that work. Do not create a branch, install dependencies, or change the source repository as part of this planning request.

Retain Seanime `v3.10.4` / source baseline `4bdff7b27b6c043dc87c0ccad3ead54596133a05` as the first compatibility target. Record the actual Denshi build, libmpv version, OS, display/compositor, and GPU used. A newer host requires a deliberate compatibility check, not an automatic version bump.

## 3. Architecture and build constraints

- **Host:** media scanning, title/episode correction, audio/video decoding, player controls, resume, completion thresholds, and tracker writes.
- **Plugin runtime:** host adapter, session checks, network/file operations, configuration/credentials, persistence, and service orchestration.
- **Webview/overlay:** subtitle text, drawer, transcript, settings, and explicit learning actions. It receives data and a narrow message channel, not credentials or arbitrary process/filesystem access.
- **Pure core:** format/encoding normalization, active cue sets, immutable clicked context, and time calculations. No dependency on Chrome, Seanime globals, DOM, or AI providers.
- **Companion:** existing parse/analyze/chat contracts. Preserve current endpoints; no new server route or process launcher is planned unless the native probe establishes a concrete necessity.

Seanime's runtime callbacks are isolated. A conventional bundle that leaves helper functions in an outer closure is not sufficient evidence of compatibility. The build should emit a self-contained UI-context body inside the documented `init`/`$ui.register` entry, including its helper definitions, and a separate browser bundle for the webview. Do not depend on sharing ordinary globals between hooks and UI callbacks. Avoid server hooks when the read-only player/UI APIs suffice. Confirm the generated payload in the real host. [Runtime documentation](https://seanime.gitbook.io/seanime-extensions/plugins/write-test-share).

Use esbuild as a scoped development dependency for the two environments; pin the selected version and lockfile during setup. Use the JavaScript build API and keep host entry construction explicit. [esbuild API](https://esbuild.github.io/api/#bundle). For ZIP support, bundle only required fflate streaming primitives and enforce independent decoded-size/member limits; do not assume browser Worker APIs exist in Goja. Pin it in the same initial lockfile. [fflate](https://github.com/101arrowz/fflate).

Network configuration must use the host's documented permissions and `ctx.fetch` in the UI context. Jimaku secrets belong in host plugin configuration; never inject them into webview HTML. Check permitted file roots and redirects/download destinations. [Host permissions](https://seanime.gitbook.io/seanime-extensions/plugins/permissions).

The visual study includes a sample picture, timeline, and playback controls for evaluation. Production ports only the learning addition; it must not layer a second fake video player, duplicate timeline, or fixture service responses over Seanime.

## 4. Milestone convention

Each numbered milestone is an independently reviewable patch touching **one to three authored tracked files**, including its tests or documentation. File lists below are exact proposed paths; `I` means `integrations/seanime/` in the real source checkout. No directory/glob hides additional authored changes. Package-manager/build outputs and generated test captures are not additional authored files. If implementation needs a fourth authored file, split the work before editing.

Commit a passing milestone as a local checkpoint during authorized implementation. Rollback means reverting that milestone's feature patch and, if later dependent patches already exist, those dependents in reverse order. Never reset the user's tree. Retain diagnostic evidence, media, original subtitle files, credentials, and saved cards. No milestone authorizes publishing, merging, deployment, or parallel agents.

### Phase A — Establish the native integration boundary

| ID / dependency | Authored files | Behavior and pass/fail check | Rollback |
| --- | --- | --- | --- |
| **M00 — Baseline** / none | `.gitignore`; `I/BASELINE.md` | Record source/host versions, source-root ownership, existing test commands, dependency prerequisites, and initial smoke results. Ignore scoped build output, local keys, and generated captures. The clean source baseline is unchanged apart from these two files; unrelated existing failures are recorded separately. | Revert the two-file preparation patch; preserve all design artifacts and logs. |
| **M01 — Reproducible build** / M00 | `I/package.json`; `I/package-lock.json`; `I/build.mjs` | Create the scoped JS package with Node test/build scripts, esbuild, and ZIP dependency locked. A generated temporary smoke entry proves bundling and self-contained callback wrapping. New package module settings do not affect existing root tests. Later UI assets are embedded by this same pipeline. | Revert package/build files; remove only their generated output after recording the failed build. |
| **M02 — Native feasibility probe** / M01 | `I/plugin.json`; `I/src/plugin.js`; `I/docs/compatibility.md` | Load a minimal probe in a disposable Seanime configuration. Prove subtitle click → pause → readable overlay/drawer → explicit resume over actual embedded libmpv, in windowed/fullscreen on Linux and Windows. Prove imported and embedded ASS text access, neighboring subtitle discovery, timing/status cadence, renderer identity, theme attachment, and bounded byte/file access. Record the actual primitives and unsupported operations. Browser-only or SDK-only evidence fails this milestone. | Unload/remove only the probe from its disposable configuration and restore any changed subtitle state. Retain the compatibility report. |
| **M03 — Player adapter** / M02 | `I/src/host.js`; `I/src/plugin.js`; `I/tests/host.test.js` | Normalize player capabilities, position/rate/paused state, media/file identity, and text-track operations discovered by M02. Handle `web`, `native`, and `mpv` without assuming the declaration file is complete. Reject controls when the active client/playback no longer matches; use seconds only at the host boundary. Unit tests and a real probe retest pass. | Revert to the working minimal probe; disable unsupported operations rather than targeting another session. |
| **M04 — Webview channel** / M03 | `I/src/bridge.js`; `I/src/plugin.js`; `I/tests/bridge.test.js` | Add a small versioned operation registry and request/reply envelopes containing client, playback, selection generation, and request ID. Unknown/malformed/stale messages cannot execute an action; lifecycle cleanup removes handlers. Verify helper definitions are available inside the actual isolated runtime. | Revert the channel patch and return to the direct probe UI; keep host playback functional. |

**Feasibility decision:** M02 is a technical checkpoint, not another routine permission request. If supported APIs cannot meet the embedded/fullscreen/text-access requirements, document the smallest concrete host API change and its exact files before revising dependent milestones. Do not quietly substitute a browser-only page, external player, or an entire Seanime fork. Offline core work can proceed while a Windows session is pending, but M02 cannot be marked complete and the full UI integration cannot be qualified on Linux evidence alone.

### Phase B — Local episode, subtitle text, and persistence

| ID / dependency | Authored files | Behavior and pass/fail check | Rollback |
| --- | --- | --- | --- |
| **M05 — SRT/VTT corpus** / M01 | `I/src/core/subtitles.js`; `I/tests/subtitles.test.js`; `I/tests/fixtures.js` | Parse generated SRT/VTT fixtures into clean millisecond cues with stable IDs, preserved line breaks, and explicit malformed-input errors. Test boundary timestamps, empty/long text, Unicode, and cue ordering. Fixture generator owns subsequent corpus data. | Revert these new modules; current LangPlay parsers are untouched. |
| **M06 — ASS/SSA and overlap** / M05 | `I/src/core/subtitles.js`; `I/src/core/cues.js`; `I/tests/subtitles.test.js` | Parse dialogue events, preserve style/layer/source metadata, exclude drawing/override syntax from lookup text, and represent simultaneous active cues. Keep the original file available for host rendering. Test dialogue/sign overlap, karaoke, commas/newlines, and empty drawing events. | Revert ASS/overlap support and expose an unsupported-format state in the integration until repaired; do not strip the user's originals. |
| **M07 — Encoding and input limits** / M05 | `I/src/core/encoding.js`; `I/tests/encoding.test.js` | Decode UTF-8/BOM input and explicit Shift_JIS through an injected decoder suitable for the actual runtime. Invalid encodings and text over 10 MiB fail before replacing working content. Assert no silent replacement of corrupt text. | Revert the decoder extension; retain explicit errors/manual import and existing usable content. |
| **M08 — Clock and clicked context** / M06 | `I/src/core/session.js`; `I/src/core/cues.js`; `I/tests/session.test.js` | Select active cue sets, apply a positive delay exactly once, capture immutable UTF-16 word/sentence context, and reject stale async generations. Test pause, rate/seek changes, overlapping cues, source switches, and switching episodes while a request is pending. | Revert the session/cue patch; do not run learning controls against an unverified clock. |
| **M09 — Host library identity** / M03 | `I/src/library.js`; `I/src/plugin.js`; `I/tests/library.test.js` | Consume host media/episode/movie/local-file identity and route corrections to existing host workflows. Handle duplicate releases, multiple roots, specials and absolute numbering; unknown identity still permits manual text import. There is no independent tracker mutation. | Revert the identity integration; library browsing and host tracking continue normally. |
| **M10 — Local text sources** / M04, M07–M09 | `I/src/subtitles.js`; `I/src/plugin.js`; `I/tests/sources.test.js` | Connect embedded text, adjacent Japanese subtitles, and explicit file import using M02-proven primitives. A valid remembered source wins, then a Japanese text track, then an adjacent match. A manual choice wins over inference. Image-only/missing/malformed sources preserve playback and the previous working subtitle. | Detach the source adapter and restore host subtitle selection; preserve files. |
| **M11 — Versioned storage/cache** / M04, M09 | `I/src/storage.js`; `I/src/plugin.js`; `I/tests/storage.test.js` | Persist source metadata/preferences using namespaced versioned storage and an injected host file/cache adapter. Key selection/offset by video identity and subtitle hash, not filename alone. Test restart, replacement/move, read-only disk, quota/eviction, and interrupted writes. Establish a separate non-evictable saved-card namespace. | Disable writes and restore the preceding schema reader; retain backups and cards. Never clear user data to recover. |

### Phase C — Bring the accepted learning UI into the host

| ID / dependency | Authored files | Behavior and pass/fail check | Rollback |
| --- | --- | --- | --- |
| **M12 — Host-mounted UI** / M02, M04, M08, M10 | `I/src/ui.html`; `I/src/ui.css`; `I/src/ui.js` | Port the accepted subtitle/drawer structure to the proven native attachment point. Scope CSS, inherit host theme, reserve the host control safe area, and remove sample art/player controls and simulated services. The drawer is closed at initial playback; keyboard focus, close-versus-resume, fullscreen, and long text work. | Revert these three files and rebuild the working probe; do not replace host controls or settings. |
| **M13 — Dictionary/readings** / M08, M12 | `I/src/learning.js`; `I/src/ui.js`; `I/tests/learning.test.js` | Reuse the existing parser factory with an injected channel transport and existing dictionary data in the browser-capable bundle. Provide immediate fallback results and asynchronous enrichment; readings/form/context stay consistent. Test `来ない` → `来る`, missing entries, unavailable parser, the 256-line cache, and four-request concurrency bound. | Disable parser enrichment and retain plain/fallback text; revert new learning bindings without altering old clients. |
| **M14 — Companion services** / M04 | `I/src/companion.js`; `I/src/plugin.js`; `I/tests/companion.test.js` | Route parse, readiness, analysis, and chat through existing companion contracts. Separate parser/AI availability; preserve provider configuration, cancellation, and existing AI deadlines. Test parser 404/503, invalid replies, timeouts, cancellation and recovery. No new backend endpoint is needed by default. | Unregister service operations and retain local subtitles/dictionary. Do not stop a companion used by another client. |
| **M15 — Live learning bindings** / M12–M14 | `I/src/ui.js`; `I/src/bridge.js`; `I/tests/ui.browser.mjs` | Bind token click, explanation, chat, transcript navigation, repeat/copy, visibility and explicit resume to real services/host operations. Freeze the selected sentence and ignore late replies. One generated-fixture browser flow checks behavior and focused keyboard recovery; actual native checks remain required. | Revert the UI/channel binding patch, disable affected actions, and preserve host playback. |
| **M16 — Anki and card collection** / M04, M08, M11 | `I/src/cards.js`; `I/src/plugin.js`; `I/tests/cards.test.js` | Format escaped text/HTML notes with title/episode/timestamp; validate deck/model field mapping and use AnkiConnect v6. Save locally when unavailable; export TSV or retry explicitly. Test in-flight deduplication, restart, disk failure, mismatched fields, and an uncertain successful network outcome without automatic resubmission. | Disable outbound export; keep saved cards/schema and allow recovery/export. No delete-on-rollback. |
| **M17 — Card UI and persistence wiring** / M15–M16 | `I/src/ui.js`; `I/src/bridge.js`; `I/src/subtitles.js` | Connect real save/local-collection/TSV feedback and remembered subtitle selection/offset to the storage/services already registered. Distinguish added-to-Anki, saved-locally, failed, and uncertain outcomes. Reload and reopen the same video to verify restoration and isolation from another release. | Revert these bindings; retained cards and selection records stay readable by their services. |

### Phase D — Japanese subtitle discovery and configuration

| ID / dependency | Authored files | Behavior and pass/fail check | Rollback |
| --- | --- | --- | --- |
| **M18 — Provider configuration** / M04 | `I/plugin.json`; `I/tests/permissions.test.js` | Add the Jimaku configuration/permissions to the host settings and narrowly scoped network/file declarations supported by M02. Missing keys produce a setup state; tests reject credentials in payload HTML, exported ordinary settings, or diagnostics. No key is required to run fixture tests. | Remove only provider operations/permissions; retain the user's configuration for a later reinstall. |
| **M19 — Jimaku search** / M09, M18 | `I/src/jimaku.js`; `I/src/plugin.js`; `I/tests/jimaku.test.js` | Search by AniList ID, list episode candidates, handle movies, and allow explicit title/episode correction. Use raw-key authorization and a descriptive client header. Test 401/403, 429/reset handling, offline/empty results and episode ambiguity. Search does not download a selected result automatically. | Unregister remote search; keep local/imported subtitle paths usable. |
| **M20 — Bounded downloads/ZIP** / M07, M11, M18 | `I/src/downloads.js`; `I/src/plugin.js`; `I/tests/downloads.test.js` | Download through the permitted transport, validate destinations and actual sizes, enumerate supported ZIP members, and stream-decode within limits. Reject traversal, oversized expansion, excess members, corrupt archives, and unsupported RAR/7z with manual recovery. Write only plugin cache content; do not alter the video or original subtitles. | Disable downloads and discard only incomplete temporary files; preserve the last working selection and saved cards. |
| **M21 — Discovery drawer and replace flow** / M10–M12, M17, M19–M20 | `I/src/ui.js`; `I/src/bridge.js`; `I/src/subtitles.js` | Replace candidate fixtures with live results, previews/member selection, local import and apply/revert behavior. Keep the current working track until a replacement fully loads. Remember the selected source/hash; offer refresh/replace/remove cache/forget selection. Assert no search/download occurs merely from starting playback. | Revert remote UI bindings, leaving local selection and cached content available. |
| **M22 — Preferences and connection state** / M11, M14, M16, M19 | `I/src/settings.js`; `I/src/plugin.js`; `I/tests/settings.test.js` | Version global/series/per-video preferences, companion URL, deck/mapping, encoding, and subtitle presentation; keep per-video timing authoritative. Expose independent readiness and retry for parser/AI/Jimaku/Anki. Keep secrets in host configuration, and verify isolated reset/migration behavior. | Restore the preceding schema reader/defaults; keep credentials/cards separate from a presentation reset. |
| **M23 — Presentation and timing controls** / M15, M17, M21–M22 | `I/src/ui.js`; `I/src/ui.css`; `I/tests/ui.browser.mjs` | Complete reading modes, font/size/position, audio/subtitle preference integration, reset/numeric offset and +/-0.1/0.5 controls. The displayed and clickable tracks share effective timing once. Verify focus, typing, long lines/filenames, contrast and reduced motion at the accepted desktop sizes and narrow resilience view. | Revert presentation bindings and restore host subtitle state; preserve settings for repair. |

### Phase E — Lifecycle, verification, and local delivery

| ID / dependency | Authored files | Behavior and pass/fail check | Rollback |
| --- | --- | --- | --- |
| **M24 — Lifecycle hardening** / M03–M04, M15–M23 | `I/src/plugin.js`; `I/src/host.js`; `I/tests/lifecycle.test.js` | Invalidate obsolete requests and detach every handler/timer on episode switch, track change, disable/re-enable and unload. Restore only subtitle state changed by this plugin; never resume or stop a different session/companion. Repeated reloads produce one overlay and bounded work. | Disable the plugin, restore the prior checkpoint, and preserve its data and diagnostic log. |
| **M25 — Native/regression qualification** / M24 and all feature milestones | `I/tests/desktop-cases.md`; `I/tests/performance.mjs`; `I/docs/verification.md` | Execute the platform matrix, existing LangPlay regressions, provider/card live smoke checks when configured, timing measurements and 30-minute soak. The measurement tool consumes real observations and separates native results from synthetic/unit checks. Record exact source/artifact versions, environment, commands and pass/fail/not-run per criterion; all required cells pass before completion. | Roll back the specific failing feature patch and its dependents, or keep the plugin disabled; do not label missing evidence as passing. |
| **M26 — Local installable artifact** / M25 | `I/build.mjs`; `I/plugin.json`; `I/README.md` | Produce a versioned manifest/payload with self-contained static UI, dependency notices and no fixture data/keys/dev-only paths. Document clean Linux/Windows setup, manual companion startup, host permissions, optional services, install/uninstall and data locations. Verify the exact built artifact in disposable configurations. No public publishing or active-player installation occurs automatically. | Restore the previous local artifact and unload the candidate; leave media and cards intact. |
| **M27 — Review and handoff** / M26 | `I/docs/verification.md`; `I/docs/compatibility.md`; `I/BASELINE.md` | Review the exact tested commit/artifact against the specification, UI criteria and boundaries. Disclose self-review versus any separately authorized independent review. Record remaining limitations, checksums, versions and rollback checkpoint. Completion requires no unresolved material defect or untested mandatory native-platform cell. | Keep the last verified artifact or disable the plugin; preserve the complete report and do not publish an unqualified candidate. |

## 5. Dependency order and first deliverable

The implementation path is M00 → M01 → M02 → M03 → M04, then the core/local and learning work, followed by remote subtitles, preferences, lifecycle, qualification and packaging. The table records exact dependencies within that order. M05–M08 are pure work that can advance sequentially while an external native test environment is pending; this does not authorize parallel agents or bypass the native checkpoint.

The **first engineering deliverable is M02's native feasibility report and runnable probe**, not a polished full player. It answers whether the selected host can support the accepted interaction on both operating systems and identifies the actual subtitle-byte/file interfaces. Retain the small probe until the production adapter passes its retest. Real AI and Anki smoke checks follow their adapters; the native UI proof does not unnecessarily depend on those credentials.

Effort risk is concentrated in native/fullscreen attachment, embedded text access, host event cadence, and plugin runtime isolation. Give a calendar estimate only after M02 establishes those facts and Windows access is known; the completed HTML study is not a measure of that work.

## 6. Owner-provisioned prerequisites

| Prerequisite | Needed by | Without it |
| --- | --- | --- |
| A Linux desktop and an interactive Windows desktop running the recorded Denshi/libmpv build | M02, M25–M26 | Linux/local/unit work can proceed; Windows/native acceptance remains explicitly not run. A headless Windows unit job cannot establish compositor/input/fullscreen behavior. |
| Local H.264 and HEVC 10-bit samples, an MKV with embedded Japanese ASS, and multiple release/episode examples | M02, M10, M25 | Generate safe text fixtures; record missing media/hardware cases. Do not download an anime collection as part of development. |
| Jimaku account/API key entered into host configuration | M19–M21 live smoke | Run provider fixtures and missing-key states; live search/download acceptance remains not run. |
| Existing companion environment with pinned parser dependencies and one configured supported AI provider | M13–M15 live smoke | Test fallbacks/fixtures without remote calls; record live parsing/explanation gaps. An optional local CLI is not mandatory on Windows. |
| Anki desktop, AnkiConnect, and a disposable test deck/model | M16–M17 live smoke | Exercise saved-card/TSV path and fixture tests; a real export remains not run. Do not alter an unrelated existing deck. |
| Existing Seanime tracking setup, and an account/test title if online sync is enabled | M09, M25 | Compare host-owned local state where supported; do not claim remote scrobbling evidence or create another account integration. |

No credentials are requested in this planning turn. No new CI service, repository protection, account, GitHub approval authority, or AEK enrollment is assumed. Use existing CI if present at implementation time; otherwise the checks below remain runnable locally. Acquisition of a missing environment is separate from a software defect.

## 7. Verification recipe

During M00 record the existing test baseline before changing shared behavior. Do not fix an unrelated failing baseline silently. The following are intended commands, not checks executed during this planning request:

```sh
# Existing source root: /home/marsel/Projects/LangPlay
node --test tests/test_*.js
.venv/bin/python -m unittest discover -s tests -p 'test_*py'
node tests/browser_custom_ai.mjs

# New scoped package after its implementation
npm --prefix integrations/seanime ci
npm --prefix integrations/seanime test
npm --prefix integrations/seanime run build
```

On Windows, use the actual virtual-environment interpreter path (`.venv\Scripts\python.exe`) and a supported Chromium path rather than copying Linux paths. In M01 the scoped test script must enumerate only test files using Node APIs, so shell glob differences do not determine coverage; browser fixtures run as a separate explicit script. Existing browser checks use disposable profiles/local mock servers and must keep that isolation. Parser-dependent checks run with the pinned companion environment. Add no style-value mirror tests.

Native matrix:

- Linux and Windows: windowed/fullscreen; correct embedded libmpv renderer; SRT/VTT/ASS/SSA; embedded ASS and adjacent/imported Japanese text; UTF-8/BOM/explicit Shift_JIS; multiple roots and Unicode paths.
- Compare plugin on/off for pause, seek, repeat, finish/reopen, tracking configuration and offline host behavior. Learning must add no independent progress mutations.
- Verify imported versus remembered versus replaced subtitle priority, movies/specials/absolute numbering, duplicate releases, overlap/style filtering, cached reopen and deletion/forget behavior.
- Exercise empty/malformed/oversize/unsupported sources, 401/403/429/reset, expired credentials, cancellation, late replies, Anki closed/uncertain result, missing dictionaries/fonts, read-only disk and recovery.
- Measure p95 cue error <=200 ms; correction <=300 ms after authoritative seek/track state; paused/pending drawer response <=150 ms p95; cached short-line lookup <=250 ms p95. Record cold startup separately. Run a 30-minute session to check timers, pending requests and bounded caches.
- Confirm 10 MiB text / 50 MiB archive / 100 MiB expanded / 200-member limits, 1,000 stored selections, 500 MiB subtitle cache, 256-line parser cache and four-request concurrency. Saved cards are not evicted with subtitle content.
- Exercise keyboard/focus, Japanese text at larger sizes, 1440×900 and 1280×800 desktop plus actual user window, reduced-motion behavior and narrow-layout resilience. Recheck contrast after host-theme mapping.

The existing study's thirteen browser checks are interaction/design evidence only. They do not count as new package tests, native-platform qualification, real downloads, persistence, parsing, AI, or Anki exports.

## 8. Acceptance coverage

| Specification criteria | Milestones that establish them |
| --- | --- |
| AC-01 library/correction | M09–M10, M25 |
| AC-02 host tracking parity | M03, M09, M24–M25 |
| AC-03 native windowed/fullscreen | M02–M04, M12, M25–M26 |
| AC-04 formats/embedded/overlap | M02, M05–M07, M10, M25 |
| AC-05 provider/ZIP/cache | M11, M18–M21, M25 |
| AC-06 title/episode ambiguity | M09, M19, M21, M25 |
| AC-07 timing persistence/isolation | M08, M11, M17, M23, M25 |
| AC-08 clicked morphology/context | M08, M13–M15, M25 |
| AC-09 learning controls | M12–M15, M23, M25 |
| AC-10 fallback/recovery | M10, M13–M15, M22, M25 |
| AC-11 real explanation/chat | M14–M15, M25 |
| AC-12 Anki/local collection/TSV | M11, M16–M17, M25 |
| AC-13 provider/input failures | M07, M18–M21, M25 |
| AC-14 lifecycle/session isolation | M03–M04, M08, M24–M25 |
| AC-15 performance/resource bounds | M08, M11, M13, M20, M24–M25 |
| AC-16 clean setup | M00–M01, M18, M22, M26 |
| AC-17 existing-client regression | M00, M01, M13, M25 |
| AC-18 restoration/uninstall | M03, M10, M24, M26 |
| UI-01–UI-03 watch/select/resume/focus | M02, M08, M12, M15, M25 |
| UI-04 candidate/timing clarity | M17, M19–M21, M23, M25 |
| UI-05 reading/overflow | M13, M23, M25 |
| UI-06 action/recovery feedback | M14–M17, M19–M23, M25 |
| UI-07–UI-08 responsive/accessibility | M12, M15, M23, M25 |

## 9. Completion and current limits

This plan was checked against the source checkout, pinned host interface evidence, the specification, and the accepted UI study. It includes dependency order, 28 patches of at most three authored files, observable pass/fail outcomes, rollback paths and all 18 engineering/eight UI acceptance criteria.

Only this local plan and its index link are written by the planning request. The Antigravity native artifact interface is unavailable in this Codex session, so the reviewable Markdown artifact is delivered in the current workspace. No production branch, package installation, source changes, native test, live service call, publication, or implementation authorization is implied by the plan.
