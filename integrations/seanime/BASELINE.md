# Seanime integration baseline

Implementation began 2026-10-15 on `codex/seanime-langplay` from clean
`230c4c3127d852d548a0312e4ea443c652907d09` in
`/home/marsel/Projects/LangPlay`. This directory owns the integration; the
extension, standalone player and companion retain their existing behavior.
No AEK enrollment, protected harness or applicable AGENTS.md was present.
The specification and approved implementation plan remain in the separate
`/home/marsel/Documents/ChatGPT/LangPlay App/docs/` workspace.

## Initial checks (before application changes)

| Command from source root | Result |
| --- | --- |
| `node --test tests/test_*.js` | PASS, 82 tests |
| `.venv/bin/python -m unittest discover -s tests -p 'test_*py'` | PASS, 22 tests |
| `node tests/browser_custom_ai.mjs` | FAIL at line 77: extension service worker never registered |

The existing browser runner passes `--load-extension=<repository root>`;
the manifest and background worker are in `extension/`, with no root
manifest. This path mismatch is present at the original commit. The test
and existing application are unchanged. Browser feature assertions did not run.
Raw baseline outputs were retained locally in `/tmp/langplay-baseline-*.log`.

## Available environment

- Node 26.8.1, npm 11.19.0; existing virtual environment Python 3.11.14.
- Linux 7.2.5-3-omarchy x86_64, Wayland/Hyprland, Intel Iris Xe (Tiger Lake).
- System mpv 0.41.0, libplacebo 7.360.1, FFmpeg 9.0.1; Chromium available.
- Seanime was not installed/running; Go was not installed. System mpv is
  not evidence of the Denshi embedded renderer's version or behavior.
- Compatibility target: Seanime/Denshi 3.10.4, source
  `4bdff7b27b6c043dc87c0ccad3ead54596133a05`.
- Interactive Windows test environment and native acceptance: not available
  in this session. See `docs/compatibility.md` for probe observations.

## Build and verification

The new scoped npm package must preserve the root CommonJS environment.
Use `npm --prefix integrations/seanime ci`, then `test` and `run build`.
Tests must enumerate files with Node APIs rather than shell glob expansion.
Native tests use disposable profiles and generated media; never point the
probe at an active library/profile or treat browser/mock checks as native proof.

Optional live prerequisites: configured companion with pinned Sudachi
dependencies, a Jimaku key entered in host configuration, AnkiConnect with
a disposable deck, and a host tracking test setup. None is needed for pure
core tests. No credentials were collected or active player configuration changed.

## Checkpoints and rollback

Commit passing milestones locally in dependency order. M02 must establish
the native APIs before dependent adapters/UI. M05–M08 may proceed while
native platform access is pending. Revert feature commits and dependents
in reverse order; preserve original media, diagnostic evidence and saved cards.
No publishing, deployment or installation into an active player is authorized.
