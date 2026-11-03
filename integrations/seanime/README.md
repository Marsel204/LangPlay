# LangPlay for Seanime

Version 0.4.15 provides clickable Japanese learning captions, optional English sentence meanings, and adjustable caption backgrounds directly in the built-in VideoCore player.

1. Start an episode. LangPlay automatically finds and loads Japanese subtitles using the existing Jimaku configuration, then falls back to the public AJATT/Kitsunekko mirror if Jimaku has no usable result, is unavailable, or has no configured key. Matching files are cached for future playback.
2. Open **Subtitles** to see the source, retry a failed search, switch to **Choose manually**, or load a different saved file.
3. Click a word to pause and open its reading, meaning, and captured sentence in Japanese with romaji above each word, followed by English. Word meanings use the built-in offline dictionary first, including `面白い`; missing words fall back to Google Translate through the local companion. Only the word is sent for that fallback, and successful results are cached. Romaji is local; sentence English uses a direct Google Translate request through the companion, with no generative AI call or AI fallback. Matching sentences reuse a cached result. The loading message says **Translating with Google…**. **Retry translation** appears on failure. **Save card** stores it locally; **Explain sentence** and **Ask** use your configured AI provider for additional help.
4. **Close** keeps playback paused. **Resume watching** resumes the same session.

The drawer sits beside a wide window, below a narrow video, and inside the player in fullscreen. Use the **Subtitle reading** selector beside the player buttons for **Japanese**, **Furigana**, or **Romaji**; the choice is saved. Word lookup shows kana and romaji together. Captions replace the ordinary subtitle line at the bottom of the displayed picture, including letterboxed video, and stay clear of the fullscreen study drawer. Loading a LangPlay file switches Seanime’s original subtitle and media-caption tracks to Off. The LangPlay toggle hides only learning captions; Seanime's CC controls can manually re-enable an original track; ordinary clock updates do not override that choice. Reading modes include Japanese, furigana and romaji.

To show the sentence meaning while watching, open **Auto Sub → Sentence meaning → English below Japanese**. This saved option starts off. English appears as a smaller line beneath each Japanese cue and works with all three reading modes, in windowed and fullscreen playback. It uses Google Translate through the local companion and shares cached results with word study. Japanese remains available if translation fails; use **Retry sentence meaning** in subtitle settings to try again.

Use **Auto Sub → Background opacity** to adjust the caption box from **0% (Transparent)** to **100% (Solid)**. Changes preview immediately and are saved. At 0%, the box tint, reflection, border, blur and shadow disappear; Japanese, readings and English remain fully visible with their text shadows. The default is the existing 18% tint. System reduced-transparency, increased-contrast and forced-color preferences retain their accessibility overrides. The slider is also available in the tray's subtitle settings.

The existing tray panel remains available through **Import or export** for file import, offset changes and card export. Saved files come from the companion's configured subtitle directory; refresh the list after adding one.

Automatic discovery uses the exact anime ID and episode, preserves a manual source choice, and rejects late results after an episode switch. The companion reads the existing Subtitle Engine Jimaku key locally; credentials never enter the player/webview or AJATT requests. AJATT needs no account: the companion uses the playback title to find a catalog entry, verifies its `.kitsuinfo.json` AniList ID, and requires an explicit matching episode filename before downloading. Ambiguous titles, missing metadata, batch archives, and filenames without an identifiable episode are skipped rather than guessed. The catalog is cached in memory for an hour; downloaded files from either provider are validated and cached locally for offline reuse. Discovery can fail or choose a release with different timing; manual replacement and delay controls remain available. Learning text and selected words clear when playback changes. External mpv is unsupported; native VideoCore eligibility is implemented, while live qualification covers the browser player.

## Local checks

From this directory, run `npm test` and `npm run build`. Generated manifests live in `dist/`. Back up the installed manifest, replace only `langplay-learning.json`, and reload that extension. Preserve plugin storage, providers and Subtitle Engine.

Run `npm run test:fullscreen` with Chromium installed (or set `LANGPLAY_TEST_CHROMIUM` to its executable) to check fullscreen dismissal, bilingual caption layout, and live background/keyboard controls at desktop and narrow widths.

See [DESIGN.md](DESIGN.md) for surface ownership, pause/resume behavior and review notes.
