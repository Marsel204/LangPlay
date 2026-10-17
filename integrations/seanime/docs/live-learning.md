# Browser learning in Seanime

Verified locally on 17 October 2026 with Seanime Denshi 3.10.4's browser player. The independent `langplay-learning` 0.2.0 plugin preserves `langplay-probe` and the existing provider/subtitle extensions. This does not close the native-player compatibility checkpoint.

## Use

1. Play an episode in Seanime's **Online streaming** browser player and open **Tray Plugins → LangPlay**.
2. Open **Subtitles** and import the matching Japanese SRT, VTT, ASS or SSA. Use the same file as Subtitle Engine. If the sandboxed file picker does not open, expand **Paste subtitle text instead**, paste the complete text, and enter its filename with the correct extension.
3. Choose Japanese, furigana or romaji. Edit **Delay (ms)** and click **Apply delay** if synchronization needs adjustment. Positive values show captions later; importing does not shift the original cue times.
4. Click a word in the learning caption. Playback pauses, and the word drawer shows its reading, dictionary form where different, local definition where available, and the captured sentence/title/episode/time. Unknown dictionary entries are identified honestly.
5. **Close**, Escape and **Hide** keep playback paused. **Resume watching** explicitly resumes the captured playback. After closing the drawer, Resume remains available below the caption. The drawer itself scrolls on short windows.
6. **Save card** writes locally to Seanime's plugin storage. **Subtitles → Export cards (TSV)** provides selectable TSV; save it as UTF-8 and import into Anki. Seanime's iframe sandbox does not grant downloads, so no automatic browser download or AnkiConnect success is claimed.

Subtitle Engine still handles Jimaku discovery and the original player subtitle track. Seanime's current public APIs do not expose the Japanese track added by that extension; this plugin therefore requires an explicit file/text import. No Jimaku key is copied into LangPlay's webview. A reload retains reading preferences, per-episode source filename/delay, and cards, but asks for the subtitle bytes again. It does not claim persistent browser filesystem access.

## Companion and failure behavior

Parsing reuses LangPlay's shared Japanese parser client and the companion at `http://127.0.0.1:8765/api/parse`; definitions reuse the existing offline dictionary. Caption parsing never calls AI. Explain and Ask explicitly use the companion's existing AI endpoints. The live explanation attempt timed out; parsing, captions and saved cards remained usable. AI success is **not** verified for this installation. Error text asks the user to check the configured provider and retry.

There are no direct AnkiConnect writes in this increment. Port 8765 belongs to the companion. TSV is the supported export path.

## Verification evidence

- Integration build smoke and **57 tests pass**, including the nine approved controller assertions. The checked-in harness only changes its source-root resolution for portability; the original proposal remains unchanged.
- Existing application regression suites: **82 Node tests** and **22 Python tests pass**. The standalone browser runner's previously recorded path limitation is not presented as a passing browser suite.
- Live Re:Zero season 4 episode 1: imported the real Japanese SRT (**452 cues**), observed synchronized text and parser-generated furigana, and selected `誰` and `彼女` with real dictionary definitions.
- Observed explicit Resume change the video from paused to playing, then selection pause the same video again. Close left it paused. Changing to episode 2 cleared the old selection/source; returning to episode 1 required the matching source.
- A real player seek was performed through Seanime's timeline. The final source delay was restored to **0 ms**, showing the matching dialogue at approximately **11:50**. Clock capture uses authoritative Seanime positions because its status API provides neither observation time nor playback rate.
- Two local cards survived plugin reloads. Saving the second card twice kept the count at two. The rendered TSV was exported to a local artifact.
- Browser UI observed at **1280×800** and **688×720**. Mouse activation was verified; the automation browser also has fractional-iframe coordinate restrictions at its default scaled viewport. Resizing/reconnecting may require reopening LangPlay from the tray; that action always requests Show.
- Fullscreen was attempted, but the in-app browser did not establish a DOM fullscreen element. Fullscreen overlay behavior, Denshi embedded mpv, Windows and native playback remain **unqualified**. Use the windowed browser player for this version.
- Self-review covered stale async results, session identity checks, scoped network access, bounded imports/storage, text-only DOM rendering and TSV formula escaping. No AEK enrollment or independent native qualification is claimed.
- A separate bounded, read-only finish review of the source and the two actual browser captures returned **ship**, with no material fixes. This does not qualify native playback or AI availability.
- Static UI detector: no findings. Existing dictionary duplicate-key build warnings (`好き`, `嫌い`) are inherited and unchanged.

Verified learning payload SHA-256: `bb5c5aeb842d8ca9085971b8200ace7767cfea3717fecb699156dfa574dd19be`. The installed payload matched the final build byte for byte. Local backup: `~/.local/share/langplay-seanime/learning-backup-2026-10-17/` (private; never commit it).

## Build, install and rollback

Run `npm ci`, `npm test` and `npm run build` in `integrations/seanime/`. The build emits separate learning and probe manifests in `dist/`. Install the learning manifest through Seanime's extension manager, or copy it into the local extensions directory and request the supported external-extension reload. Grant only playback, plugin storage, and network access to the local companion.

To roll back, disable/remove only **LangPlay / langplay-learning** through Extensions. Keep the native probe, Subtitle Engine, providers, subtitle files and user cards. The private configuration/database backup is available if required; do not overwrite unrelated current profile data as a routine rollback.
