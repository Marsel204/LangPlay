# LangPlay for Seanime

Version 0.4.1 provides clickable Japanese learning captions directly in the built-in VideoCore player.

1. Start an episode. LangPlay automatically finds and loads Japanese subtitles using the existing Jimaku configuration. Matching files are cached for future playback.
2. Open **Subtitles** to see the source, retry a failed search, switch to **Choose manually**, or load a different saved file.
3. Click a word to pause and open its reading, local definition, and captured sentence in Japanese, full-sentence romaji, and English. Romaji is local; English loads through the configured AI companion and is reused for other words in the same sentence. **Retry translation** appears on failure. **Save card** stores it locally; **Explain sentence** and **Ask** request further help.
4. **Close** keeps playback paused. **Resume watching** resumes the same session.

The drawer sits beside a wide window, below a narrow video, and inside the player in fullscreen. Use the **Subtitle reading** selector beside the player buttons for **Japanese**, **Furigana**, or **Romaji**; the choice is saved. Word lookup shows kana and romaji together. Captions replace the ordinary subtitle line at the bottom of the displayed picture, including letterboxed video, and stay clear of the fullscreen study drawer. Loading a LangPlay file switches Seanime’s original subtitle and media-caption tracks to Off. The LangPlay toggle hides only learning captions; Seanime's CC controls can manually re-enable an original track; ordinary clock updates do not override that choice. Reading modes include Japanese, furigana and romaji.

The existing tray panel remains available through **Import or export** for file import, offset changes and card export. Saved files come from the companion's configured subtitle directory; refresh the list after adding one.

Automatic discovery uses the exact anime ID and episode, preserves a manual source choice, and rejects late results after an episode switch. The companion reads the existing Subtitle Engine Jimaku key locally; credentials never enter the player/webview. Discovery can fail or choose a release with different timing; manual replacement and delay controls remain available. Learning text and selected words clear when playback changes. External mpv is unsupported; native VideoCore eligibility is implemented, while live qualification covers the browser player.

## Local checks

From this directory, run `npm test` and `npm run build`. Generated manifests live in `dist/`. Back up the installed manifest, replace only `langplay-learning.json`, and reload that extension. Preserve plugin storage, providers and Subtitle Engine.

See [DESIGN.md](DESIGN.md) for surface ownership, pause/resume behavior and review notes.
