# LangPlay × Seanime exploration

This workspace contains the integration specification and a proposed playback UI direction. The interactive study uses sample media and simulated services; it is not the installed Seanime plugin.

- [Integration specification](docs/specs/seanime-langplay-integration.md)
- [Everyday desktop, streaming and download setup specification](docs/specs/seanime-everyday-setup.md)
- [UI direction and verification notes](docs/specs/langplay-ui-direction.md)
- [Implementation plan](docs/plans/seanime-langplay-implementation.md)
- [Interactive study source](prototypes/langplay-ui/index.html)

## Run the UI study

From this directory:

```sh
python -m http.server 48772 --bind 127.0.0.1 --directory prototypes/langplay-ui
```

Open [the local preview](http://127.0.0.1:48772/). On Windows, use `py` in place of `python` if that is the installed Python launcher.

Click `来ない` in the subtitle to open lookup. Use the bottom controls to inspect subtitle candidates and appearance settings. Close/Escape keeps the scene paused; Resume returns to watching. Appearance settings also expose sample unavailable-service and no-results states, plus an amber/host-violet comparison.

No credentials, AI calls, Jimaku downloads, Anki writes, or real video decoding occur in the study. Fullscreen/native integration on Linux and Windows still requires the engineering prototype described in the specification.
