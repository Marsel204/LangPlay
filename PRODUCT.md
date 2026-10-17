# LangPlay

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

Desktop setup targets Windows and Linux on Intel/AMD 64-bit devices. The existing
LangPlay learning surfaces run on the web and as an extension. No mobile installer
is part of this change.

## Users and purpose

The user wants to browse local anime, track titles/episodes, and find/configure
Japanese subtitles while keeping the video clear. Learning tools should open
when a subtitle is selected. Both on-demand playback and following shows for
automatic downloads are desired.

## Operating context

Use the official Seanime Denshi app with a LangPlay extension and local Python
companion. The approved setup direction is one downloadable installer per OS,
a library folder choice, sensible local configuration, and one daily shortcut.
The other device should not require Python or Node installed separately.

## Capabilities and constraints

The Seanime integration currently ships a development probe. Full subtitle
discovery, sync, and contextual learning remain unfinished. Setup must describe
that accurately. Account connections are optional and remain user actions.
Automatic downloads stay off until the user chooses followed shows and rules.
Existing app profiles and credentials must be preserved; new local credentials
are generated per device. The installer is separate from Seanime's upstream code.
