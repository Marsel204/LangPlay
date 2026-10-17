---
name: LangPlay UI study
description: Scoped preview of on-demand learning inside Seanime's player.
colors:
  page: "#090a0b"
  panel: "#17191c"
  surface: "#22252a"
  text: "#f2f1ed"
  secondary: "#b9babd"
  muted: "#a4a6ab"
  line: "#36393f"
  accent: "#eac38a"
  accent-ink: "#20180f"
  host-accent-comparison: "#c4b5fd"
  host-accent-ink-comparison: "#211b35"
typography:
  subtitle:
    fontFamily: '"Noto Sans CJK JP", "Noto Sans JP", "Yu Gothic", Meiryo, sans-serif'
    fontSize: "34px"
    fontWeight: 500
    lineHeight: 2
  lookup-word:
    fontFamily: '"Noto Sans CJK JP", "Noto Sans JP", "Yu Gothic", Meiryo, sans-serif'
    fontSize: "36px"
    fontWeight: 500
    lineHeight: 1.5
  definition:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.5
  title:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "16px"
    fontWeight: 550
    lineHeight: "normal"
  body:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "normal"
rounded:
  word: "3px"
  segment: "4px"
  subtitle: "5px"
  icon: "6px"
  control: "7px"
spacing:
  compact: "4px"
  related: "8px"
  control: "12px"
  section: "16px"
  inset: "20px"
  drawer: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    width: "100%"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    width: "100%"
  button-resume:
    backgroundColor: "transparent"
    textColor: "{colors.secondary}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    width: "100%"
  question-field:
    backgroundColor: "#101214"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "3px 3px 3px 11px"
  segmented-control:
    backgroundColor: "#0d0f11"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "3px"
  subtitle-candidate:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.subtitle}"
    padding: "15px 10px"
  player-actions:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
  learning-drawer:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    width: "374px"
  subtitle-word:
    backgroundColor: "transparent"
    textColor: "#ffffff"
    typography: "{typography.subtitle}"
    rounded: "{rounded.word}"
    padding: "0 1px"
---

# Design System: LangPlay UI study

## Overview

**Creative North Star: "Watch first, study on demand"**

This documents the isolated static study in `prototypes/langplay-ui/`, an ordinary addition to Seanime's inherited visual world. It is a record of the implemented preview, not a new global identity, an approved amber palette, or a production plugin theme. The frontmatter is normative only for this preview; production should inherit the host's live theme tokens, components, typography, and native player geometry.

The picture leads. Compact edge controls and one opaque contextual drawer make Japanese learning available after selection. The working description above comes from the existing direction brief, not a separate brand decision. Playback and dictionary, AI, provider, and Anki actions are fixtures; host library and tracking remain outside the study. The original generated platform still is illustrative, not video or a captured anime frame.

**Key Characteristics:**

- Near-black surroundings and solid charcoal content surfaces.
- Large Japanese subtitles with subordinate readings and local contrast backing.
- One contextual panel, dictionary first, explicit return to watching.
- Provisional amber with a reversible host-violet comparison.

See [the surface brief](.impeccable/surfaces/prototypes-langplay-ui-index-html.md) for composition and [the UI specification](docs/specs/langplay-ui-direction.md) for product behavior.

## Colors

### Primary

Warm amber (`accent`) marks selected words, principal learning actions, focus, and progress. Dark amber ink (`accent-ink`) provides readable button text. The settings option labelled “Host violet” swaps these two values to the comparison pair; it approximates a host accent for evaluation, rather than reading Seanime's active theme. Neither choice is user-approved.

### Neutral

Near-black page, charcoal panel, and lighter control surface establish depth. Warm white carries primary text; secondary gray carries translations and supporting actions; muted gray carries labels and metadata. Slate lines separate content without turning each field into a card.

**The Host Inheritance Rule.** Treat preview values as reference measurements. Resolve production colors against Seanime's actual tokens and theme states before integration.

## Typography

Inter with system UI fallbacks matches the host-oriented study; retain this practical choice rather than changing type for novelty. No webfont is bundled. Japanese uses Noto Sans CJK JP / Noto Sans JP, Yu Gothic, Meiryo, then sans-serif, subject to installed fonts.

The frontmatter captures the main hierarchy. Supporting readings/translations use (14px); captured Japanese context uses (19px / 1.85); explanations use (14px / 1.8). Functional labels and timecodes are at least (12px). Timestamps use tabular numerals. Ruby uses (0.42em) and the subtitle's generous line height reserves reading space. Plain mode hides ruby without collapsing that space. Subtitle size is adjustable from (24–44px), in (2px) steps.

## Layout

The desktop wrapper has a (76px) header, (20px) side padding, and (1800px) maximum width. The rectangular player height is `min(74vw, calc(100svh - 136px))`, with a (460px) minimum. The scene covers the player, positioned at (45% 50%). Subtitles sit (100px) above the bottom controls with (30px) side margins; opening a panel reserves its width in both subtitle and transport areas.

The default drawer is (374px) wide; its header uses (19px 22px 15px), body (22px 24px 26px), and footer (16px 24px) padding. The body scrolls independently; the footer does not shrink. Spacing mostly follows a (4px) rhythm, with small optical adjustments in controls.

- At widths of at least (1600px), the drawer becomes (398px), with (28px) body side padding.
- At widths up to (1100px), it becomes (350px); an open drawer removes compact transport controls and lower-priority action text.
- At widths up to (760px), the header becomes (64px), outer side padding (8px), and player height `calc(100svh - 125px)` with a (440px) minimum. An open drawer occupies the lower (63%) as a full-width sheet. The scene remains visible above it; subtitles cap at (26px). Transport is hidden while the sheet is open, and the footer supplies explicit resume. Compact controls, transcript entry, fullscreen entry, and secondary title text are omitted at this width. This is resilience behavior; mobile remains outside release scope.

Long Japanese text and filenames wrap. The page has a (320px) minimum width. Do not infer support below that boundary.

## Elevation & Depth

The drawer is solid, separated by a (1px) border. Scrims over the picture support title and transport legibility; the subtitle uses a dark translucent backing plus a text shadow. There is no decorative blur. Only the transient status toast uses a lifted shadow (`0 12px 28px rgb(0 0 0 / .35)`); it cannot intercept pointer input.

The drawer enters over (180ms) with `cubic-bezier(.16,1,.3,1)`, translating (20px) while fading. Closing hides it immediately; no exit animation is implemented. The reduced-motion media rule removes animation and transitions and restores automatic scrolling.

## Shapes

The picture and drawer have square outer corners. Compact controls use the small radii in frontmatter; buttons and fields use a restrained (7px) curve. Icons are (20px) outline SVGs with a (1.8px) round stroke; action-specific icons may be smaller. Borders, spacing, and tonal shifts carry grouping, rather than nested cards.

## Components

**Buttons and controls.** Primary, secondary, and resume buttons share a full-width layout and (42px) minimum height. Secondary actions have a (1px) gray stroke; hover lightens the surface. Primary hover raises brightness. Icon controls are (36px) square on desktop and at least (44px) in narrow layouts. Pressed settings use `aria-pressed`; selection is also indicated through text, underlining, radio controls, or a distinct surface.

**Question field.** A dark inset row contains a labelled text input and send action. The border changes to the accent on focus within. Questions remain available in the simulated unavailable state. This is a fixture tutor, not an AI connection.

**Subtitle and lookup.** Word buttons show readings above the Japanese line. Hover/selection adds the accent and a (2px) underline. Selecting a word pauses the fixture and opens the one shared drawer: word → reading → meaning → dictionary form → captured sentence → optional explanation → save. Sentence translation is opt-in. The captured context stays fixed during delayed fixture actions; generation checks discard responses after a panel/context change.

**Drawer and footer.** Lookup, subtitle discovery, transcript, and presentation settings share the same non-modal `aside`; they do not stack. Opening moves programmatic focus to its labelled heading. Close/Escape restores focus and keeps playback paused. Resume or the explicit play action closes the drawer and resumes the fixture. Native buttons, labelled ranges, a radio fieldset, `aria-live` responses, and status regions provide semantics. Keyboard shortcuts avoid text-entry fields; Space retains native button activation when a button is focused.

**Subtitle discovery.** Candidate rows expose source/release/timing uncertainty with radios and wrapping filenames. Applying changes only the sample filename/format. The visible preview remains fixed fixture text, not a per-file parsed preview. Local import validates the extension and displays the filename only. Offset controls update a displayed value; they do not retime media. Transcript selection changes the sample cue/context.

**Accessibility evidence.** Focus styling is an accent outline (2px, 3px offset), with a separate field focus border. Supplied browser evidence records thirteen passing checks and contrast ratios of (15.58:1) for the definition, (7.23:1) for secondary text, and (10.57:1) for the primary button. This is sampled evidence, not a complete WCAG audit. See [the documentation evidence note](.impeccable/review/design-documentation.md) for review scope and unverified native behavior.

## Do's and Don'ts

### Do:

- **Do** inherit Seanime's actual theme and components when implementing the plugin.
- **Do** preserve the selected sentence and require an explicit playback action to resume.
- **Do** retain visible focus, local subtitle backing, wrapping content, and a reachable drawer footer.
- **Do** identify fixture content and simulated results wherever they could imply a live service.

### Don't:

- **Don't** treat amber, the comparison violet, or this study header as an approved global identity.
- **Don't** reserve a permanent learning column before subtitle selection.
- **Don't** interpret screenshots or browser fixtures as proof of native playback, fullscreen overlays, Windows compatibility, or service integration.
