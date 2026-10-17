# LangPlay UI direction

Status: Proposed direction and isolated interactive study, 15 October 2026. Supplements the [engineering specification](seanime-langplay-integration.md); it is not native integration evidence.

## Brief

Extend Seanime's playback surface with on-demand Japanese learning. The audience is the requesting user watching local anime on Linux and Windows. The primary flow is watch → click a subtitle word → inspect its meaning/context → optionally explain/save → explicitly resume.

Confirmed: keep the video clear and open learning tools only on a subtitle click. Preserve Seanime's library and tracking screens. The first release still includes subtitle discovery and configuration.

Provisional: charcoal surfaces with an amber learning accent; candidate-first Jimaku selection. The appearance question has not been answered. Color is reversible and does not change the host's branding or global theme.

The present deliverable is a self-contained HTML/CSS/JavaScript interaction study under `prototypes/langplay-ui/`. This tooling is only for evaluating direction; it does not choose or scaffold the production plugin framework. All media, provider responses, learning content, progress, and exports in the study are fixtures. No service or credential is required.

## References and observed findings

| Reference | Evidence and useful pattern | Adaptation |
| --- | --- | --- |
| [Seanime's published native player](https://s3.seanime.app/sea/denshi-mpvcore.webp), linked from the [official site](https://seanime.app/) | Visually inspected screenshot: picture leads, title sits at the upper edge, timeline and player actions sit at the bottom, settings appear contextually at the right. | Keep edge controls and one contextual panel. Screenshot inspection does not establish native plugin attachment, keyboard behavior, or responsive behavior. Do not reuse its anime artwork. |
| [Existing LangPlay player](https://github.com/Marsel204/LangPlay/blob/230c4c3127d852d548a0312e4ea443c652907d09/extension/player.html) and [styles](https://github.com/Marsel204/LangPlay/blob/230c4c3127d852d548a0312e4ea443c652907d09/extension/css/styles.css) | Inspected the source and rendered the empty local page from an isolated checkout. The current screen reserves a learning column before a selection and keeps reading/sync tools always visible. The empty HTTP preview could not initialize its extension environment; no live learning state was observed. | Preserve reading modes, context, explanations, and Anki; move tools behind their relevant actions. Reduced distraction is a design hypothesis to evaluate, not a measured usability result. |
| [asbplayer's mining workflow](https://docs.asbplayer.dev/docs/getting-started/mining-subtitles/) | Documentation supports a direct path from a selected subtitle to a card. This was a workflow reference; its live product was not visually audited. | Keep save near the selected word and show clear save outcomes. Do not add its audio/image mining scope to this release. |
| [Seanime theme source](https://github.com/5rahim/seanime/blob/4bdff7b27b6c043dc87c0ccad3ead54596133a05/seanime-web/src/app/globals.css) | Source evidence: near-black background, restrained radius, and a practical sans-serif interface. | Inherit host components/tokens at integration time. Prototype colors are reference values, not an instruction to replace the host theme. |

## Recommended direction: watch first, study on demand

The picture occupies the available player. Controls stay at the perimeter. Japanese subtitles are the largest interface text, with readings clearly subordinate. Learning opens a single opaque right drawer while playback is paused; returning to watching dismisses the drawer. Closing a drawer alone never resumes playback.

Use a compact dictionary-first hierarchy: word/reading → concise meaning → dictionary form → frozen source sentence → optional AI explanation → save. A long grammar response is scrollable inside the drawer, with the save action reachable. Avoid making every linguistic field a card, badge, or permanent tab.

The study shares one drawer for lookup, subtitle discovery, transcript, and presentation settings. Only one is open at a time. A modal is unnecessary for routine discovery/settings. Host settings and account management are outside this addition.

## Surfaces and behavior

| Surface | Contents and primary action | Exit/recovery |
| --- | --- | --- |
| Watching | Episode context, picture, Japanese line, timeline, play/pause, subtitle/transcript/settings entry points. No permanent learning panel. | Clicking a token pauses and opens lookup; ordinary playback actions retain their meaning. |
| Word lookup | Selected word, reading, meaning, dictionary form, captured sentence, explanation action, Anki action. | Explicit resume closes the panel. Close keeps the scene paused. Changing the episode invalidates old requests. |
| Subtitle drawer | Current track, Jimaku candidates with source/release/format, selection, preview, use-selected action, local import, offset controls. | Keep previous working track until replacement applies; unavailable/no-match states offer local import. |
| Transcript | Nearby timestamped lines; active cue distinct from hover/focus. | Selecting a line seeks in the real implementation; the study updates fixture context only. |
| Presentation settings | Furigana/romaji/plain modes, subtitle size, contrast treatment, and theme-following accent option. | Updates appear immediately in the study. Connection/account setup remains outside the visual direction preview. |

## Visual and component treatment

- Use near-black host surroundings and solid charcoal panels, with subtle dividers. Contrast scrims over video have a legibility function; avoid decorative blur or glows.
- Use the host's UI sans-serif and a Japanese system fallback stack including Noto Sans CJK JP, Yu Gothic, and Meiryo. In production, use packaged/available fonts that support the selected language.
- Reference scale: 13–15 px secondary UI, 16 px reading text, 30–40 px desktop subtitle line, and 32 px selected word. Subtitle size remains user-configurable. Ruby is approximately half the base text size and reserves vertical space.
- Use a 4 px spacing scale, compact related controls, 8 px control corners, and a clearly separated drawer header/body/footer. The picture does not become a rounded decorative card.
- Proposed amber marks the selected token and principal learning actions. Use text/icons as well as color for status. Provide a host-accent comparison in the study; the final color choice is open.
- Consistent 1.75–2 px outline icons, visible keyboard focus, tabular timestamps, wrapping long filenames, and descriptive labels/tooltips for icon-only actions.
- The only structural motion is the drawer entering/exiting over about 180 ms. Reduced motion removes the transition. No automatic scene movement is needed for a UI study.

## Responsive and accessibility requirements

- Primary desktop checks: 1440×900 and 1280×800. The actual in-app viewport is also checked when available.
- At narrow widths, the study turns the drawer into a bottom sheet below a visible scene/subtitle area; content remains scrollable and actions remain reachable. This is resilience testing, not mobile release scope.
- At larger subtitle sizes, long lines wrap inside safe margins and do not fall behind controls. At narrow widths, condense lower-priority labels while keeping named accessible controls.
- Use semantic buttons, labelled inputs, an accessible drawer heading, Escape dismissal, focus return to the invoking control, and context-sensitive shortcuts that do not intercept typing. Space is the explicit play/pause action; Escape never resumes.
- Body/control text targets WCAG AA contrast. Subtitle white text uses a dark local backing plus a shadow against the image, not shadow alone. Focus is visible on picture, panel, and controls. Core controls have at least 36 px desktop hit areas; narrow/touch controls target 44 px.
- Loading, offline, no-results, malformed input, saved-locally, and exported states use concise actionable copy. The study demonstrates representative states; the engineering specification owns the complete failure matrix.

## UI acceptance criteria

| ID | Outcome |
| --- | --- |
| UI-01 | Initial watching view has no learning drawer and preserves a large readable picture and Japanese line. |
| UI-02 | A keyboard or pointer subtitle selection pauses the simulated state, opens the matching word context, and moves focus to the drawer heading. |
| UI-03 | Close/Escape returns focus and leaves playback paused; explicit resume closes the drawer and restores the watching state. |
| UI-04 | A user can choose a subtitle candidate, inspect its sample preview, apply it, and adjust/reset a clearly labelled offset. Candidate source and timing uncertainty remain visible. |
| UI-05 | Reading modes and font size update the subtitle without losing its selected sentence; long Japanese text and filenames remain contained. |
| UI-06 | Explanation and card controls show fixture loading/result states and never imply a real provider or Anki connection. An unavailable-service state preserves usable context. |
| UI-07 | The layout remains usable at the named desktop/narrow sizes, without page-level horizontal overflow or unreachable panel footer actions. |
| UI-08 | Keyboard navigation, input typing, focus return, reduced-motion styling, and text/control contrast are checked; screenshots alone do not prove interaction checks. |

## Scope boundaries and feasibility

This preview adds no live library, tracker, video decoder, Jimaku client, AI client, parser, or Anki connection. The generated scene is an original fictional asset and the episode is fictional. Design approval would settle hierarchy and appearance; it would not prove Denshi overlay compatibility. The native prototype in the engineering specification must still establish overlay/input handling and text access in windowed/fullscreen on Linux and Windows.

## Evidence

Implemented the isolated study and inspected watching, lookup, subtitle candidates, and appearance settings at 1440×900. Lookup was also checked at 1280×800, the actual 1280×720 in-app viewport, and 390×844. The narrow bottom sheet retains a visible scene/subtitle area and reachable save/resume actions. These captures are saved under `.impeccable/review/`.

Thirteen recorded browser checks passed: opt-in sentence meaning, explicit fixture explanation, truthful demo card-save result, Escape/focus return, subtitle offset sign, filename/format selection, large plain subtitle containment, unavailable-AI recovery, empty-result recovery, passive status-message hit testing, explicit resume, desktop containment, and narrow-sheet containment. A transient status message initially intercepted subtitle clicks; hit testing traced it to the toast, and `pointer-events: none` fixed the reproduction. The range/text-input checks also confirmed that a space typed into the question input did not toggle playback.

At the actual in-app viewport, measured solid-surface contrast was 15.58:1 for the definition, 7.23:1 for secondary text, and 10.57:1 for primary-button text. Tab from the drawer heading reached its close button with a visible outline. The reduced-motion media rule was inspected; an actual OS preference change was not exercised. Small functional labels were raised to 12 px after the one mechanical detector run. Its font warning is retained intentionally because Inter is inherited from the host interface.

A fresh reviewer inspected the six planned captures and source/evidence and returned **ship, UI direction prototype only**, with no material findings. The reviewer did not independently rerun browser interactions. The additional actual-window capture and measurements are parent verification. Native Denshi overlay/fullscreen, Windows runtime behavior, live subtitle import/parsing, authenticated services, complete screen-reader behavior, and production persistence remain unverified. Reference images establish visual patterns only.

The original generated scene includes its exact generation prompt as PNG metadata; the asset scan found one raster and no missing provenance. No existing anime artwork was copied into the prototype.
