# Japanese parsing implementation verification

Tested 8 October 2026 in the `codex/japanese-parsing` worktrees of
LangPlayext and LangPlay. Sentence translation engines and settings are unchanged.

## Implementation

The backend adds offline Sudachi Core morphology at `POST /api/parse`, with
dictionary forms, POS, original morphemes, readings and JavaScript UTF-16 offsets.
The pinned engine/dictionary pair is SudachiPy 0.6.11 / Core 20250129.
Verb/auxiliary sequences form one clickable inflection while retaining raw
morphology. The shared extension client caches 256 lines and limits concurrent
requests. The server shares its dictionary with a separate tokenizer per thread.

YouTube and the standalone player render immediately with their lightweight
fallback, then update from asynchronous parsing. Drawer readings, word-definition
lookups and Anki data reuse the parser result. Version guards discard results
after a different cue/word/navigation, including clearing the overlay between cues.
Hidden overlays and closed drawers remain hidden after parsing finishes. Startup
completion retries the current subtitle and pinned word. The updated native helper
uses the backend's `.venv/bin/python` when available.

## Results

| Check | Result |
|---|---|
| Extension `node --test tests/test_*.js` | 67 passed |
| Extension `node run_tests.js` | All 13 suites passed |
| Native host process/protocol tests | 7 passed, including virtual environment selection |
| Backend Python morphology, HTTP and AI regressions | 14 passed |
| Chromium with real backend and extension worker | Passed |
| JavaScript / Python syntax | Passed |
| Regenerated `content.js` SHA-256 consistency | Passed |
| Both repository whitespace checks | Passed |

The browser test launches an actual Sudachi backend on an ephemeral loopback
port and loads the real extension in a disposable Chromium profile. Five reading
and lemma cases pass through backend HTTP and the worker. It also verifies the
YouTube overlay, drawer, hidden state and standalone renderer, including a delayed
result after clearing. The existing browser checks cover controls, keyboard,
fullscreen, navigation, native startup, Mix placement and Sensei chat scrolling.
Caption timing and translation responses are controlled fixtures; this was not a
live YouTube quality evaluation or an actual Anki desktop sync.

Rerunning the original 20-case diagnostic corpus with the implemented backend
gave **17/20 reading matches and 11/11 lemma checks**, versus the original
YouTube pipeline's **9/20 and 1/11**. This small stress corpus does not establish
general Japanese accuracy. The remaining readings concern `今日学校へ行った。`,
`一日中寝ていた。`, and the fictional name in `猫猫は薬師だ。`. A name glossary and
context-specific corrections remain useful; no blanket reading overrides are used.

## Performance and operational consequences

On an Intel i5-1135G7 / approximately 8 GB RAM, two browser runs measured
35.3–35.8 ms for the first request to a fresh parser process, and medians of
3.7–4.2 ms for four subsequent uncached requests. This includes extension
messaging, HTTP, parsing and reading normalization. OS files may already be cached;
five calls per run are integration timings, not a broad latency benchmark.

The earlier isolated parser benchmark measured 0.027 ms p50 / 0.042 ms p95
per short line over 2,000 warm calls, approximately 124 MiB total process peak
RSS, and 207 MiB installed dictionary storage (~69 MiB package download).
These are process-peak and install figures, not guaranteed incremental usage in
the complete server. Battery use and sustained video responsiveness were not
profiled. The browser no longer initializes Kuromoji's dictionary on its UI thread.

Sudachi requires no API key or recurring fee. Subtitle text goes to the existing
configured server URL; parsing is offline when that server is local. Older servers
or missing dependencies fall back to the existing lightweight readings. Parser
dependencies are loaded only when parsing is requested; unrelated endpoints still
work without them. Package licenses and bundled third-party notices must be preserved.

Both repositories need to ship together. Install backend dependencies, update the
native launcher, restart an older server and reload the extension as described in
the README and backend `PARSING.md`. The test environment is installed in the
backend worktree; the user's main checkout and installed launcher were not changed.

## Reproduce

In the backend checkout:

```sh
uv venv --python 3.14 .venv
uv pip install --python .venv/bin/python -r requirements-parser.txt
.venv/bin/python -m unittest discover -s tests -p 'test_*py'
```

In the extension checkout:

```sh
node --test tests/test_*.js
node run_tests.js
python3 tests/test_native_host.py
PARSER_SERVER_DIR=/path/to/LangPlay node tests/browser_custom_ai.mjs
```
