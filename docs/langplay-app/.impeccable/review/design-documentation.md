# Design documentation evidence

Disposition supplied by the finish reviewer: **SHIP — UI direction prototype only**. No material findings or optional changes. Documentation was extracted from `PRODUCT.md`, the UI specification, the surface brief, and the static HTML/CSS/JavaScript. No prototype code or image assets were changed during documentation; no browser interaction was rerun.

The reviewer inspected source and opened six supplied captures: `watch-desktop.jpg`, `lookup-desktop.jpg`, `subtitles-desktop.jpg`, and `settings-desktop.jpg` at 1440×900; `lookup-1280.jpg` at 1280×800; and `lookup-narrow.jpg` at 390×844. It did not independently rerun interactions. The parent also recorded `user-1280.jpg` at 1280×720 and validated image dimensions.

[interaction-checks.json](interaction-checks.json) contains thirteen passing browser checks. [display-checks.json](display-checks.json) records the actual 1280×720 viewport, no page overflow, a drawer footer bottom at 660px, definition/secondary/primary-button contrast ratios of 15.58/7.23/10.57, and visible close-button focus. Reduced-motion CSS was inspected; the OS preference was not changed.

[detector.json](detector.json) is the single earlier detector run, not a clean rerun. Its tiny-text findings were corrected in the source to functional labels of at least 12px. Its Inter warnings were intentionally retained to match the inherited host UI. The source scene has the exact generation prompt embedded; the provenance scan found one raster and zero missing prompts. No approved image comp exists: this was a code-first app-screen study.

The root `DESIGN.md` frontmatter owns the scoped primitive tokens; `.impeccable/design.json` follows the installed schemaVersion 2 extension format. Its eight-step tonal ramps are synthesized documentation swatches, not additional colors used by the preview. Component snippets are static render examples; they do not reproduce application behavior or establish integration readiness.

Native Denshi attachment/input handling, embedded subtitle access, Windows integration, and native fullscreen remain unverified. Browser fullscreen code exists but is not native-platform evidence. All media playback and learning/provider/Anki results remain fixtures. Amber remains provisional; production must inherit and validate the host's live theme tokens.
