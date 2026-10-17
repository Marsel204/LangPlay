# LangPlay

<!-- impeccable:product-schema 1 -->

## Platform

web

The target is a web-based plugin interface inside Seanime Denshi on Linux and Windows. Desktop native-video behavior remains a separate engineering verification requirement. Mobile is outside the first release.

## Users

The requesting user watches local anime and wants Japanese subtitle lookup and learning without managing a separate library or watch list. Other audiences have not been researched.

## Product Purpose

Browse local anime, track titles and episodes through Seanime, find and configure Japanese subtitles, and use LangPlay's readings, explanations, and Anki export while watching.

## Operating Context

The existing LangPlay application uses JavaScript and a Python companion. Seanime supplies the library, metadata, playback, and tracking. Jimaku is the proposed first remote subtitle provider. The user confirmed that learning tools should stay hidden until a subtitle is clicked.

## Capabilities and Constraints

- First release covers all three library/tracking/subtitle goals, beginning with a compatibility prototype.
- Preserve the existing LangPlay browser and YouTube experience.
- Seanime owns resume position, watch completion, and tracker updates.
- Fullscreen interaction and embedded subtitle access on Linux and Windows remain unverified.
- The current task defines UI direction and an isolated visual/interaction preview. It does not implement the native plugin or its integrations.
- Subtitle candidate-first selection is the specification's provisional default; automatic selection has not been chosen.

## Evidence on Hand

- Engineering specification: `docs/specs/seanime-langplay-integration.md`.
- Existing LangPlay source: https://github.com/Marsel204/LangPlay.
- Published Seanime player screenshot: https://s3.seanime.app/sea/denshi-mpvcore.webp.
- Original generated platform scene and fictional episode/subtitle fixtures are available only for the UI study; they do not establish real playback, dictionary, provider, or Anki connectivity.

## Product Principles

- Watching remains the default activity; learning opens on demand.
- Preserve the selected sentence during every asynchronous action.
- Resume only through an explicit playback action.
- Connection failures keep local playback and available subtitle text usable.
- Keep library and tracking behavior in the host.
