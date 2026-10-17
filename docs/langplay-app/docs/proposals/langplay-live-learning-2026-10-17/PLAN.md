# LangPlay live learning integration

17 October 2026. Implementation proposal; production source has not been changed.

## Evidence and starting point

- Source: `/home/marsel/Projects/LangPlay`, clean `codex/japanese-subtitle-search`, commit `052f959`.
- No `.aek/project.json` or applicable AGENTS.md. Existing source workflow applies; no protected harness or GitHub approval system is claimed.
- Existing scoped build and 37 tests pass. The installed `langplay-probe` only offers diagnostic controls and pasted test text; it is not a learning UI.
- The running companion at `http://127.0.0.1:8765` successfully parses generated Japanese using Sudachi. Preserve its APIs and existing browser extension.
- Japanese subtitle discovery and loading are verified with Subtitle Engine/Jimaku for Re:Zero season 4 episode 1 in Seanime's browser player. A Japanese-capable font is installed in Seanime's assets.
- A live probe during that playback reports renderer `web`, valid session/status, and the original 13 source tracks. The added Japanese track is absent from `getCurrentPlaybackInfo().subtitleTracks`; `getTextTracks()` returns undefined. Do not pretend either API exposes the selected Japanese file or its text.
- Original native Denshi checkpoint M02 remains open. Browser success cannot qualify native overlays/fullscreen or Windows support.

## Proposed first usable increment

Target the existing verified Seanime browser playback first, subject to the pending user player preference. Keep native Denshi qualification explicit and separate; do not remove its probe or mark M02 complete. A native-first choice requires completing that compatibility checkpoint before dependent UI work.

Watching remains the default. A synchronized Japanese learning caption opens one contextual drawer when a word is selected. The same captured sentence/word drives reading, dictionary lookup, optional explanation/chat, and saved cards. Close/Escape leaves playback paused. Resume is explicit and checks the original client and playback identity.

Use explicit SRT/VTT/ASS/SSA import in LangPlay to begin. The current Japanese SRT is already saved locally and can be chosen through a file input. Parse its content with the existing bounded integration core; preserve format, source identity, timing, and subtitle offsets. This deliberate handoff is needed because the host does not expose Subtitle Engine's added track. Do not modify third-party Subtitle Engine, scrape its private UI state, duplicate its API key into the webview, or claim automatic capture of its selection.

Continue using Subtitle Engine for Jimaku discovery and original subtitle rendering. LangPlay's learning text must be kept synchronized with the same imported file and offset. Do not hide the host caption until the learning caption is ready. The exact browser mounting and fullscreen behavior must be demonstrated in the real host before calling the overlay complete; supported webview slots currently do not include an explicit player-overlay slot.

## Acceptance contract

1. Import a matching Japanese file while a real episode is active; show synchronized clean text, including overlapping cues, reading mode, and adjustable offset.
2. Select a word: pause the same playback, retain immutable context, and show parser readings, dictionary form, and a real definition where one exists. Unknown words remain clearly unknown.
3. Close/Escape stays paused. Explicit Resume controls only the captured playback. Changing episodes or source invalidates old parse/AI responses and prevents controls from affecting another session.
4. Explanation and chat use the existing companion only on an explicit action. An unavailable parser/AI service leaves ordinary playback and imported text usable.
5. Save cards locally with title, episode, timestamp, word, reading, meaning, and sentence; allow TSV export. AnkiConnect writes require an explicitly configured endpoint/deck and a separate live verification; the companion already occupies port 8765.
6. Restart retains user preferences and source association when the source can be recovered. A browser file import must request re-selection if the browser no longer has the bytes; do not claim persisted filesystem access without verification.
7. Normal browser extension and standalone usage remain intact. No independent library/tracker, host fork, new paid service, or secret in generated HTML.

## Milestones

Each milestone has at most three authored files. Split further if discovery requires another file.

| Milestone | Files in the source repository | Check |
| --- | --- | --- |
| Learning state/service contract | `integrations/seanime/src/learning-controller.js`; `integrations/seanime/tests/learning-controller.test.js` | Proposed tests below pass; source/session/time and async races are covered. |
| Host boundary | `integrations/seanime/src/host.js`; `integrations/seanime/src/bridge.js`; `integrations/seanime/tests/host.test.js` | Actual browser status/pause/resume, validated messages, bounded imports, and stale session rejection. |
| Existing service reuse | `integrations/seanime/src/services.js`; `integrations/seanime/tests/services.test.js`; `integrations/seanime/plugin.json` | Real companion parsing, dictionary reuse, explicit AI calls, permission-scoped requests; original probe preserved as a separate artifact. |
| Learning UI | `integrations/seanime/src/ui.js`; `integrations/seanime/src/ui.html`; `integrations/seanime/src/ui.css` | Real cues and word selection, accessible contextual drawer, readings, import/offset, errors, explicit resume. |
| Plugin integration and packaging | `integrations/seanime/src/learning-plugin.js`; `integrations/seanime/build.mjs`; `integrations/seanime/learning-plugin.json` | Separate working plugin ID/build from the existing native probe; isolated Goja callback smoke passes. |
| Persistence/cards | `integrations/seanime/src/storage.js`; `integrations/seanime/src/cards.js`; `integrations/seanime/tests/cards.test.js` | Captured context survives save/export, duplicates prevented, bounded storage and honest Anki fallback. |
| Verification and install | `integrations/seanime/docs/live-learning.md`; update this setup workspace's verification record | Existing 37 tests plus source Node/Python regressions pass; live import/click/pause/close/resume, seek, episode switch, unavailable companion, and browser fullscreen are observed. |

Only install the reviewed build after local tests and an isolated host smoke. Back up the existing plugin/configuration, preserve working AnimeTosho/AniPM/KickAssAnime/Subtitle Engine, then verify the actual installed artifact. No push, PR publication, merge, or unrelated installation is included in this request.

## Test proposal

The adjacent `learning-controller.test.mjs` defines the proposed pure controller's external behavior, using generated subtitle text and injected host/service fixtures. It targets a new source module and runs outside the source checkout:

```sh
LANGPLAY_SOURCE_ROOT=/home/marsel/Projects/LangPlay node --test \
  '/home/marsel/Documents/ChatGPT/LangPlay App/docs/proposals/langplay-live-learning-2026-10-17/learning-controller.test.mjs'
```

Before implementation these tests must fail because the learning controller does not exist. Existing core tests continue to pass. The proposal does not claim that mocked host control proves native UI compatibility. After approval, preserve these assertions when moving the harness into the source package and add separate host/service/UI cases per milestone.

Observed proposal run: **9 tests failed**, each with the explicit assertion that the production learning controller is absent. This proves the missing component, not failures inside an implemented controller. Output is retained in `failing-tests.log`. Existing scoped baseline: **37 tests passed**. Source checkout remained clean at `052f959` after the proposal run.

Proposed test file SHA-256: `d656d778952d6abe4910abc408c3b3f26fb77993488cbdc6185f1f1741642794`.

## Rollback

Keep the existing probe and third-party subtitle extension. Remove only the new learning plugin and restore its saved configuration if the live check fails. Revert feature checkpoints in reverse dependency order without resetting existing work. Retain downloaded subtitles, media, API key storage in its existing owning extension, and user cards.
