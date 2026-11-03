# On-video learning surface

LangPlay uses the subtitle word as the entry point to study. The video remains dominant; a word opens its captured sentence, reading and local meaning, with an explicit return to watching.

Extend Seanime's existing charcoal surfaces and lavender actions. Use system controls, restrained borders, and Noto Sans CJK JP / Japanese system-font fallbacks. The extension ships no raster interface assets.

## Layout and ownership

- Captions and compact controls belong to the fullscreen-capable VideoCore container. Anchor captions to the contained video picture, accounting for letterboxing and using the ordinary bottom subtitle position. The fullscreen caption area reserves the drawer width; narrow fullscreen uses a lower study sheet with captions above it.
- A study drawer sits beside the video above 960 px viewport width and below it in narrower windows. Fullscreen moves only the owned drawer inside the player.
- Preserve React-owned nodes. Record and restore the four inline layout properties changed for the sidebar, including recovery after plugin reload or main-tab changes.
- Native button inputs keep Enter/Space out of Seanime's transport shortcuts. Caption buttons support keyboard activation while retaining ruby readings.

The always-available **Subtitle reading** selector uses the existing persisted Japanese/furigana/romaji preference. Keep punctuation literal; show kana and romaji together in word lookup.

## State and feedback

The setup surface identifies the active anime, episode, and loaded learning file. Automatic search is the default for an identified episode; the source status states what was matched and warns that timing can vary. Saved associations reload automatically unless their filenames explicitly contradict the current episode/anime. Manual file import remains explicit, wins over pending automatic work, and stays available alongside a persisted Automatic/Manual selector and failure retry.

A word click pauses the identified playback, freezes its study context, and opens the drawer. Closing keeps the video paused. Resume is explicit and rejects a changed session. The sentence group presents Japanese with locally parsed romaji above each word, then English. Ruby annotation preserves punctuation and newlines; until matching tokens are available, Japanese stays readable with a separate romaji fallback. Selection requests English through the companion's direct Google Translate route, never generative AI; matching sentences share one pending request and a bounded in-memory cache. The loading message identifies Google explicitly. Translation never blocks dictionary lookup, and late replies cannot replace another selection. Failure stays in the sentence group with an explicit retry. Ordinary playback, parsing and word selection send no generative AI requests; grammar explanation and chat remain explicit AI actions.

Caption identity consists only of visible text, token spans, and readings. Nested Go parser metadata must not trigger DOM replacement. Episode/source changes reject stale clicks and async results. Clock, page-media, and available stream-source checks prevent attaching controls to an unrelated visible player. DOM requests time out so reload cannot permanently stall the surface.

Loading a LangPlay subtitle selects Off for the host's original subtitle and media-caption tracks through VideoCore. Do this once per source or re-enable, after learning text is ready; do not hide or alter the host's renderer DOM. Between cues the original track stays Off. Manual CC selection remains available, and ordinary clock updates do not repeatedly override it. The LangPlay toggle controls its own caption surface; turning it off leaves the host Off setting intact.

## Finish review — 18 October 2026

Self-review, with no delegated review. Live browser checks cover Horimiya episodes 1 and 2 and Re:Zero season 4 episodes 1 and 2: saved and automatic sources, dictionary results, click-to-pause, keyboard selection/close, card save, explicit resume, fullscreen relocation, and responsive placement. Checks also cover romaji/furigana switching, letterbox positioning, original tracks Off, automatic episode switching, cached reloads, and persisted manual mode. Native desktop and Windows UI remain outside this browser qualification. See [live-learning.md](docs/live-learning.md) for current verification and setup.


## Per-word sentence meanings — 20 October 2026

Each captured sentence word groups romaji above Japanese and a short dictionary meaning below, with wrapping between word groups and preserved original punctuation/newlines. Full dictionary text is available on hover. Definitions fill independently from cached or parsed tokens; pending words show Loading… and missing entries show No definition. Parsing and sentence English remain independent of dictionary requests.

## Caption composition — 20 October 2026

The watching caption follows the LangPlayeExt reference: white semibold Japanese word groups, small pink readings above them, a shared near-black violet strip, a subtle border, and 12 px corners. Inline word groups keep pronunciation attached to the word and preserve source line breaks. The strip is capped at 950 px and wraps to the available player width.

The compact LangPlay/Subtitles/reading toolbar sits at the lower right, 64 px above the player bottom, with a shared background. Captions reserve at least 112 px above the contained picture bottom, including letterbox clearance. Fullscreen study starts 24 px from the top and ends 120 px from the bottom, leaving the toolbar reachable. Wide captions reserve the study width; narrow fullscreen study uses a scrollable sheet capped at 40% of the player with captions 8 px above it.

Version 0.4.7 was built, installed, and reloaded using Seanime's scoped external-extension reload. All 116 integration tests passed, including the updated caption-inset regression; the detector and whitespace checks were clean. Visual verification used the production renderer with fixture content at 1280 px and 640 px player widths, long dialogue, and open fullscreen study. Native playback and Windows were not requalified.


## Compact AI answers — 20 October 2026

AI explanations and replies use the same restricted Markdown reader in the player and tray panel. Direct answers stay visible; contextual sections open first, while further grammar notes and examples can be expanded. Text, emphasis, lists, quotes, code and tables are rendered as safe DOM nodes. Raw provider HTML stays literal. Player disclosure controls use native button inputs to avoid Seanime's playback keyboard shortcuts.

Study uses compact 13 px answer text with 1.55 line height, clear emphasis, restrained section dividers, a 16 px Japanese sentence, an inline question/action row, and sticky close/resume controls. Drawer updates preserve expanded sections when their answer text has not changed.

## Native player control row — 20 October 2026

Version 0.4.9 replaces the separate toolbar with an unbacked inline group inserted after VideoCore's `control-bar-separator`, before native player settings. It inherits the host row's visibility, hover handling, and fullscreen ownership. The group contains an eye toggle, a green ready-state Auto Sub badge with the actual cue count, and a reading selector drawn as a language icon. Manual mode labels the badge Subtitles. Accessible labels and native select options remain available.

When the transport is absent the group stays hidden; it never falls back to a floating panel. Host transport replacement recreates only plugin-owned controls and detaches their old listeners. Teardown leaves the native settings, spacer, and other controls intact. Captions now reserve 80 px above the contained picture bottom; the removed second toolbar no longer consumes a separate row.

Self-review found no remaining material issue. All 118 integration tests, build callback smoke, production build, static detector and whitespace checks passed. Browser fixture verification covered row ownership, short/long dialogue, wide/narrow composition, eye toggle and reading selection. Native playback was not requalified.

## Glossy caption material — 26 October 2026

Version 0.4.10 gives the shared Japanese caption strip a smoked-glass material: a translucent charcoal base, 22 px backdrop blur, a restrained diagonal reflection, a brighter upper edge, and soft inset and drop shadows. Rounded 18 px corners belong to the strip; word targets use lighter translucent feedback and an immediate, subtle press response. White Japanese stays primary, with higher-contrast pink readings above each word. Caption placement, wrapping, controls and learning behavior retain their existing composition.

Browsers without backdrop filtering use a darker opaque fallback. Reduced transparency and increased contrast use a solid material; forced colors use system colors. Reduced motion removes word scaling and transitions. Production-renderer fixtures at 1015 px and 390 px covered the supplied scene, a white backdrop, and long dialogue on a dark backdrop without overflow. All 118 integration tests, callback smoke, production build and the static detector passed. Live native playback and Windows were not visually requalified.

Version 0.4.11 makes the requested glass transparent: an 18% charcoal tint and 8 px blur keep the scene visible through the strip, with lighter reflections, edges and shadows. Unsupported browsers use a 26% tint. Stronger text shadows separate Japanese and readings from bright footage. The solid accessibility overrides remain available through system preferences.

## Fullscreen study dismissal — 26 October 2026

Version 0.4.12 dismisses study locally before waiting for the controller's next published view. Close responds to the primary pointer press and keeps click activation for keyboards and assistive technology; the following click does not repeat the close action. Escape uses the same dismissal path. The drawer explicitly accepts pointer events when fullscreen places it inside the player. Closing clears the caption reservation and keeps playback paused.

Two regression tests first failed for the missing press handler and reliance on a subsequently published view, then passed with the change. All 121 integration tests and the production build pass. Chromium production-renderer fixtures at 1280 px and 390 px verified physical pointer clicks, keyboard Close and Escape, including a player with inherited pointer events disabled. The installed manifest matches the build and Seanime reports version 0.4.12 after scoped reload. The user's native fullscreen interaction still requires confirmation; the exact live cause of the missing click was not independently established.

## Fullscreen title-bar overlap — 3 November 2026

Version 0.4.13 places the fullscreen study drawer above Seanime's title controls. The host's full-width title bar uses z-index 999 and overlapped Close above the drawer's previous layer of 90, intercepting mouse presses. Only the fullscreen drawer moves to layer 1000; the existing dismissal behavior is preserved. `npm run test:fullscreen` reproduces the blocked mouse target before the fix and passes afterward with real Chromium mouse input at 1280 px and 390 px, plus Enter and Escape dismissal. The fixture uses the production renderer and the host title-bar geometry; it does not automate the running Denshi window.

## Optional caption sentence meanings — 3 November 2026

Version 0.4.14 adds the saved **Sentence meaning → English below Japanese** option to the player and tray subtitle settings, defaulting to Off. It adds a smaller English line inside each cue's caption surface without replacing Japanese word nodes or opening study. Translation reuses the existing local companion's Google Translate service and cache; it makes no generative AI calls. Current dialogue takes priority over up to three nearby cues, with at most two caption translations pending and at most eight distinct candidate sentences admitted. The shared service still caps translation/dictionary concurrency at four. Episode, source, delay, opt-out and termination invalidate obsolete work; seeks show meanings only for current cue IDs. Failures retain Japanese, do not retry on every clock tick, and expose **Retry sentence meaning**. Long English wraps within the cue and is limited to three visible lines, with the full text in its title.

## Caption background control — 3 November 2026

Version 0.4.15 adds **Background opacity** to both subtitle settings surfaces. A labelled native range input spans 0–100%, displays its current percentage and names the Transparent/Solid endpoints. Each input previews the caption material and persists the integer independently of reading, automatic-loading and sentence-meaning preferences; missing or invalid stored values restore the existing 18% tint. The thumb supports arrow keys. Clock updates preserve an active drag, and stale DOM reads cannot overwrite its latest value.

The caption root owns appearance variables, so changing opacity preserves the Japanese word nodes, listeners and English line. Below 18%, reflection, edges, blur and shadows fade with the tint. At 0%, all box material is removed; Japanese, readings and English retain full opacity and text shadows. At 100%, the charcoal background is opaque. System reduced-transparency, increased-contrast and forced-color overrides remain in effect. Chromium fixtures cover these states in windowed/fullscreen playback at 1280 px and 390 px, including the visible settings slider and keyboard input; native Denshi and Windows UI are not automated.
