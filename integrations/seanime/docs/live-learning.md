# Browser learning in Seanime

Version 0.4.4 was installed and its lookup/translation service verified locally on 18 October 2026 with Seanime Denshi 3.10.4. Browser playback qualification below comes from the preceding 0.4.1 verification. The independent `langplay-learning` plugin preserves `langplay-probe` and the existing provider/subtitle extensions. Native desktop and Windows UI remain unverified.

## Use

1. Play an episode in Seanime's **Online streaming** browser player. Japanese subtitles now search and load automatically through the local companion.
2. Open **Subtitles** to see the automatic match or change **Japanese subtitle loading** to **Choose manually**. A manual replacement can be selected under **Saved subtitles**, then **Load subtitle**. **Open subtitle folder** opens the dedicated folder; add a downloaded Japanese SRT, VTT, ASS or SSA there and **Refresh list**. Saved files can be loaded again after a restart without a file picker. You can also **Choose another file** or expand **Paste subtitle text instead**.
3. Choose Japanese, furigana or romaji. Edit **Delay (ms)** and click **Apply delay** if synchronization needs adjustment. Positive values show captions later; importing does not shift the original cue times.
4. Click a word in the learning caption. Playback pauses, and the word drawer shows its reading, dictionary form where different, offline-first definition with Google fallback, and the captured sentence/title/episode/time. Sentence romaji appears above Japanese words; English uses Google Translate. Explain and Ask invoke AI explicitly.
5. **Close**, Escape and **Hide** keep playback paused. **Resume watching** explicitly resumes the captured playback. The tray panel also provides Resume. The drawer itself scrolls on short windows.
6. **Save card** writes locally to Seanime's plugin storage. **Subtitles → Export cards (TSV)** provides selectable TSV; save it as UTF-8 and import into Anki. Seanime's iframe sandbox does not grant downloads, so no automatic browser download or AnkiConnect success is claimed.

Subtitle Engine remains available for manual subtitle discovery and the original player track. Its selected URL is not exposed as learning text through Seanime's public plugin APIs. LangPlay 0.4.0 therefore performs its own episode-filtered Jimaku search through the companion, using the existing private configuration. No Jimaku key is copied into LangPlay's webview. LangPlay can list and load files in its dedicated subtitle folder through the local companion; a reload retains preferences, per-episode source filename/delay, and cards, and preselects that saved filename when available. It never silently picks a different episode's subtitle.

On Linux the default folder is `$XDG_DATA_HOME/langplay-seanime/subtitles` (normally `~/.local/share/langplay-seanime/subtitles`). On Windows it is `%LOCALAPPDATA%/LangPlay/subtitles`. The installer uses its own `<installation>/subtitles` folder. `LANGPLAY_SUBTITLE_DIR` can set a different fixed folder before starting the companion. File reads reject traversal and symlinks, accept only supported subtitle formats, and cap input at 10 MiB. The browser's ordinary **Choose another file** dialog remains controlled by the browser; **Saved subtitles** bypasses that dialog.

## Companion and failure behavior

Parsing reuses LangPlay's shared Japanese parser client and the companion at `http://127.0.0.1:8765/api/parse`; definitions check the shared offline dictionary first. Version 0.4.2 includes the kanji spelling `面白い` and uses a word-only Google Translate fallback through `POST /api/dictionary` for missing entries, matching the extension's lookup order. Google fallback is online; known dictionary words do not need that request. Responses are plain text, successful lookups are bounded and cached, and failed lookups can be retried by selecting the word again. Caption parsing never calls AI. Since version 0.4.4, selecting a word requests English through a direct Google Translate request via `POST /api/translate`, with no generative AI request or AI fallback; the local parser supplies full-sentence romaji. Results appear directly beneath the Japanese sentence in both study panels. Matching sentences reuse a bounded translation cache, and failures offer **Retry translation**. Explain and Ask explicitly request additional help through the companion's existing AI endpoints. DeepSeek Explain, Ask and a contextual follow-up succeeded through the production service and companion using generated Japanese context. This verifies the service path; native AI UI behavior is unqualified. Errors leave captions and local cards available.

There are no direct AnkiConnect writes in this increment. Port 8765 belongs to the companion. TSV is the supported export path.

## Verification evidence

- Integration build and isolated callback smoke pass with **101 integration tests**. Existing application suites pass with **82 Node tests**, **51 Python tests**, and **20 installer tests** (254 total).
- Version 0.4.4 live service verification confirmed offline `面白い` lookup with no dictionary request, Google fallback for a missing word, and sentence translation through `/api/translate` without an `/ai/` request. The supplied sentence took 1.305 seconds on its first measured request; the next lookup used the plugin cache. These are one-run service timings, not a UI latency guarantee.
- The production drawer renderer was inspected with real local parser tokens at 340 px and 280 px widths: romaji stayed above Japanese, punctuation/newlines were preserved, the separate romaji fallback was hidden once annotations were available, and no horizontal overflow occurred. This was a browser layout fixture, not native desktop interaction.
- Live browser playback covers Horimiya episodes 1/2 and Re:Zero season 4 episodes 1/2, clickable parser readings, real dictionary lookup, pause/explicit resume, local card deduplication and TSV export.
- Real automatic Jimaku discovery loaded Re:Zero episode 2's Japanese SRT (**418 cues**) without a picker. Switching to episode 1 restored its associated file (**452 cues**); switching back restored episode 2's cached file. Offline cache reuse and manual mode persistence were verified.
- Actual browser fullscreen retained a single caption surface and drawer. At wide and narrow viewports, captions cleared the study drawer; windowed narrow placement moved study below the video. Original subtitle and media-caption tracks were switched Off once a learning source was ready.
- Self-review covered stale async results, session identity checks, bounded imports/storage/network work, credential location, text-only DOM rendering and TSV formula escaping. Static UI detector and whitespace checks pass. Existing dictionary duplicate-key build warnings (`好き`, `嫌い`) are inherited.
- Native desktop UI, Windows UI and external mpv are unqualified. Browser VideoCore is the live-tested surface; external mpv is unsupported. This repository has no AEK enforcement, and this release has no independent review.

## Build, install and rollback

Run `npm ci`, `npm test` and `npm run build` in `integrations/seanime/`. The build emits separate learning and probe manifests in `dist/`. Install the learning manifest through Seanime's extension manager, or copy it into the local extensions directory and request the supported external-extension reload. Grant only playback, plugin storage, and network access to the local companion.

To roll back, disable/remove only **LangPlay / langplay-learning** through Extensions. Keep the native probe, Subtitle Engine, providers, subtitle files and user cards. Back up private configuration before installation; do not overwrite unrelated profile data during rollback.


## DeepSeek Sensei — 18 October 2026

Version 0.3.3 uses the companion's configured provider for both Explain and Ask. Set `LANGPLAY_AI_PROVIDER=deepseek` and supply `LANGPLAY_DEEPSEEK_API_KEY` in the companion environment; `LANGPLAY_DEEPSEEK_MODEL` defaults to `deepseek-flash`. These are companion settings, not plugin/webview credentials. Restart the companion after changing its environment. With no provider setting, existing Antigravity behavior remains available.

Provide credentials through the companion environment. They are not stored in source, manifests or plugin preferences. `/api/ai/status` reports provider/model and whether a key is configured, without returning it.

DeepSeek uses the official chat-completion endpoint with thinking disabled for interactive latency. Explanation requests use JSON output; Ask retains the captured sentence and conversation order. Missing credentials, authentication rejection, insufficient balance, rate limits, network failure and truncated replies produce actionable errors. Caption parsing and dictionary lookup do not use DeepSeek.


## Automatic Japanese subtitles — 18 October 2026

Version 0.4.0 defaults to automatic loading when an identified anime episode starts. It first tries a saved episode association, rejecting a filename that explicitly names a different episode/anime; otherwise the local companion searches Jimaku by exact AniList ID and episode. It prefers Japanese web-release text subtitles, downloads a bounded file, and caches it as `Jimaku.<AniList ID>.E<episode>.ja.<format>` in the dedicated subtitle folder. A private metadata file records episode identity and a content hash, without credentials or a remote URL. Cached content is reusable offline.

The companion reads the existing Jimaku key from Subtitle Engine's private local configuration. Alternatively set `LANGPLAY_JIMAKU_API_KEY` in the companion environment, or `LANGPLAY_SEANIME_DIR` if Seanime uses a nonstandard profile directory. No key is copied into the plugin/webview; no Subtitle Engine patch or extra plugin network scope is needed. Auto requests accept only numeric anime/episode IDs, use same-host HTTPS downloads, cap bytes and time, and reject unsupported/non-Japanese data.

Automatic work does not pause playback or block the clock. Episode/client changes, manual source changes and disabling automatic loading invalidate pending work. A source is rechecked against the playback again inside installation. Only a ready learning source triggers the existing original-track Off action. Failed discovery leaves original playback/subtitles usable; **Retry automatic search** or a saved/imported file is available in **Subtitles**. **Choose manually** persists across reloads. Matching a release's timing is not guaranteed; use the existing delay controls if necessary.

## Sentence reading — 18 October 2026

Version 0.4.1 groups Japanese, full-sentence romaji and English in the study drawer. Live browser verification selected a Re:Zero episode-two sentence and observed local romanization plus a successful DeepSeek translation. Sentence cache reuse and late-result rejection have regression coverage; live playback stayed paused. Narrow layout retained scrolling without horizontal overflow. English is requested on word selection, never automatically for every playing cue. Native desktop and Windows UI remain unverified.


## Fast sentence English — 18 October 2026

Version 0.4.4 replaces the earlier AI sentence translator with direct Google Translate through the local companion. It sends only the selected Japanese sentence, requests translation text without dictionary or explanation output, and uses a six-second socket timeout. Successful results are cached in the plugin and companion; concurrent matching requests share plugin work. A failed translation offers Retry translation and never falls back to AI. Sentence romanization stays local and aligned above Japanese words. Explain and Ask still use the configured AI provider only when requested. This is online machine translation, not offline sentence translation.
