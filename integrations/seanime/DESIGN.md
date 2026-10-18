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

A word click pauses the identified playback, freezes its study context, and opens the drawer. Closing keeps the video paused. Resume is explicit and rejects a changed session. The sentence group presents Japanese, locally parsed full-sentence romaji, then English. Selection requests English through the configured AI companion; matching sentences share one pending request and a bounded in-memory cache. Translation never blocks dictionary lookup, and late replies cannot replace another selection. Failure stays in the sentence group with an explicit retry. Ordinary playback/caption parsing sends no AI requests; grammar explanation and chat remain explicit actions.

Caption identity consists only of visible text, token spans, and readings. Nested Go parser metadata must not trigger DOM replacement. Episode/source changes reject stale clicks and async results. Clock, page-media, and available stream-source checks prevent attaching controls to an unrelated visible player. DOM requests time out so reload cannot permanently stall the surface.

Loading a LangPlay subtitle selects Off for the host's original subtitle and media-caption tracks through VideoCore. Do this once per source or re-enable, after learning text is ready; do not hide or alter the host's renderer DOM. Between cues the original track stays Off. Manual CC selection remains available, and ordinary clock updates do not repeatedly override it. The LangPlay toggle controls its own caption surface; turning it off leaves the host Off setting intact.

## Finish review — 18 October 2026

Self-review, with no delegated review. Live browser checks cover Horimiya episodes 1 and 2 and Re:Zero season 4 episodes 1 and 2: saved and automatic sources, dictionary results, click-to-pause, keyboard selection/close, card save, explicit resume, fullscreen relocation, and responsive placement. Checks also cover romaji/furigana switching, letterbox positioning, original tracks Off, automatic episode switching, cached reloads, and persisted manual mode. Native desktop and Windows UI remain outside this browser qualification. See [live-learning.md](docs/live-learning.md) for current verification and setup.
