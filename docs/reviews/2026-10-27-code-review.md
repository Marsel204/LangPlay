# Code review and refactoring — 2026-10-27

The implementation agent ran on **gpt-6.1-sol / High**, with two independent
**gpt-6.1-sol / Max** reviewers starting from different parts of the current code.

- [Backend-first review](t3-thread://v1/thread:delegated-task:command%3Amcp%3A89412091-5035-4b0f-bb38-3b4a94c4cfdd%3Adelegate-task%3A6607a7e1-31e6-462e-9c8d-adadd6426a1b): API, storage, subtitle discovery, installer, native host; traced outward into callers.
- [Frontend-first review](t3-thread://v1/thread:delegated-task:command%3Amcp%3A89412091-5035-4b0f-bb38-3b4a94c4cfdd%3Adelegate-task%3Af2f56ec8-bb85-44fe-bb70-ce8ab9cd8cfb): player actions, asynchronous requests, rendering, caption preparation, extension state; traced inward into services.

Base commit: `67fa26d3b8d0984fd3debbd1b2fc6ca616a7e3b5`.
The repository was already dirty. Existing work was preserved, and fixes remain
uncommitted. This project has no `.aek/project.json`, so no frozen AEK harness
or architecture approval is claimed.

## Comparison

The backend reviewer reported **7 confirmed findings**; the frontend reviewer
reported **8**. Their lists did not duplicate one another. Backend findings
concentrated on exposure and contracts between processes; frontend findings
concentrated on data ownership, cancellation, and out-of-order completion.
Both exposed gaps that passing unit suites had missed at component boundaries.

All 15 confirmed findings were addressed. The implementation agent also
reproduced and fixed three other bugs. Two additional timing concerns from the
frontend review have controlled-scheduling regression coverage and safeguards;
their frequency in a live Seanime host has not been measured.

The reviewers inspected a shared, changing working tree while the implementation
agent worked. Their reviews are independent investigations of the code, not
independent approval of the completed patch. The final implementation was
self-reviewed and tested. The frontend reviewer regenerated ignored build
artifacts during its initial test run; it made no source edits.

## Backend findings and fixes

| ID | Priority | Confirmed failure | Resolution |
| --- | --- | --- | --- |
| B1 | P1 | Untrusted browser origins could invoke AI and append bookmarks. | Centralized origin checks reject untrusted and malformed origins before provider or file access. Existing local, extension, and YouTube callers remain supported. Standalone hosting defaults to loopback. |
| B2 | P1 | The static handler exposed `.env`, source files, and saved cards. | GET and HEAD serve app HTML and public `static/` assets. Directory listings, traversal, and symlink escapes are rejected. |
| B3 | P2 | Partial bodies retained unlimited request workers without deadlines. | Both production server entry points use a 32-worker server and 10-second socket receive timeout. Excess clients receive 503; incomplete bodies time out and release workers. |
| B4 | P2 | Four dictionary requests plus sentence translation exceeded the backend's four shared slots, losing a word definition. | Dictionary and sentence translation share one bounded client queue while retaining request deduplication and caches. |
| B5 | P2 | A malformed preferred subtitle was cached and rejected again on every retry. | Complete timing/event structure is checked before caching and when reading legacy caches. Malformed candidates fall through to the next candidate. Generated Jimaku associations go through discovery validation. |
| B6 | P2 | The installer selected another companion port while the plugin still called 8765. | Setup requires the plugin's declared port 8765 and reports conflicts before downloads/state creation. Rerunning setup migrates stopped legacy installations; launching an unmigrated installation reports the required migration. |
| B7 | P2 | The installed companion read Jimaku credentials from the default Seanime profile. | The companion explicitly receives the installation-owned Seanime profile path. |

Relevant implementation: [Server.py](../../Server.py),
[subtitle discovery](../../subtitle_discovery.py),
[installer](../../installer/core.py),
[services](../../integrations/seanime/src/services.js), and
[automatic loading](../../integrations/seanime/src/auto-subtitles.js).

## Frontend findings and fixes

| ID | Priority | Confirmed failure | Resolution |
| --- | --- | --- | --- |
| F1 | P1 | Concurrent card saves silently overwrote one another. | All extension collection writes and clears go through one serialized background writer. Standalone, content-script, generated content source, and Options entry points use it. Persistence failures reach the caller. |
| F2 | P2 | Active captions after the first eight never received readings. | All active cues are eligible for preparation; future lookahead is bounded separately. Four outstanding parser requests remain the limit. |
| F3 | P2 | Old AI cleanup removed a newer request's abort handle and allowed obsolete callbacks. | Provider cleanup checks controller identity. Callback delivery checks cancellation and current ownership. |
| F4 | P2 | Explain and card actions used a later live sentence with the previously selected word. | Standalone actions use an immutable selected word/sentence context. Selection and playback changes invalidate obsolete callbacks. |
| F5 | P2 | Late caption completion from video A replaced video B's timeline. | Playback revisions guard initialization callbacks, caption completion, and related feedback updates. Local playback changes invalidate pending YouTube loads. |
| F6 | P2 | One manual upload disabled automatic captions for subsequent videos. | Installing an automatic timeline resets manual ownership. |
| F7 | P2 | An older saved import overwrote a newer manual source and its persisted association. | Each manual source choice has a revision checked at the controller's commit boundary and before persistence. Playback identity is checked there too. |
| F8 | P2 | A transient DOM bridge failure poisoned render caches, preventing paused captions from recovering. | Caption, sentence, and study render keys are committed after successful asynchronous rendering. |

Relevant implementation: [background writer](../../extension/background.js),
[Anki module](../../extension/js/anki.js), [AI module](../../extension/js/ai.js),
[standalone app](../../extension/js/app.js),
[learning session](../../integrations/seanime/src/core/session.js),
[learning plugin](../../integrations/seanime/src/learning-plugin.js), and
[player surface](../../integrations/seanime/src/player-surface.js).

## Additional investigation and safeguards

| Issue | Evidence and resolution |
| --- | --- |
| Unknown playback duration | A host snapshot at 1500 ms with missing duration produced a session at 0 ms and no active captions. Unknown/zero/invalid duration is now omitted instead of treated as a zero-length video. |
| Request parsing and bounds | Negative body lengths reached `read(-1)` on analysis/bookmark routes; malformed input returned 500. A shared bounded JSON-object reader validates framing before reading, checks complete bodies and text fields, and returns client errors. Regression cases cover all eight POST routes. |
| AI analysis cache identity | Colon-separated context fields collided; different readings also reused an explanation. Tuple keys preserve field boundaries and include the reading used to construct the prompt. |
| Seek while polling | A controlled seek/poll overlap retained an old selection at a new position. Pending discontinuities are now consumed after an in-progress poll. |
| Cancellation during installation | Disabling automatic loading during the final playback refresh could still install its source. The controller rechecks request ownership immediately before committing the source. |
| Duplicate dictionary keys | Removed shadowed entries for 好き and 嫌い while preserving the effective definitions. The build is free of those warnings. |

## Validation

Regression tests were added for reproduced failures and run before and after the
corresponding fixes. Test doubles controlled network responses, storage, and DOM
bridge timing; temporary servers exercised HTTP behavior.

| Check | Starting baseline | Final result |
| --- | --- | --- |
| `.venv/bin/python -m unittest discover -s tests -p 'test_*.py'` | 52 passed | 64 passed |
| `.venv/bin/python -m unittest discover -s installer/tests -p 'test_*.py'` | 20 passed | 23 passed |
| `node --test tests/test_*.js` | 82 passed | 93 passed |
| `npm --prefix integrations/seanime test` | 121 passed | 129 passed |
| `node extension/run_tests.js` | 14 suites passed | 14 suites passed |
| `npm --prefix integrations/seanime run build` | Passed with duplicate-key warnings | Passed without those warnings |
| `git diff --check` | Passed | Passed |

Total: **309 passing tests**, plus the extension's **14-suite** check. The HTTP
boundary test additionally verifies an overflowing client receives 503 while the
only test worker is occupied, then verifies recovery after the stalled request.
Python compilation and standalone JavaScript syntax checks passed.

Logs and the initial tracked working-tree patch are in
`/tmp/langplay-review-20261027/` for this local session.

## Compatibility and limits

- Standalone access defaults to `127.0.0.1`. Explicit `--host 0.0.0.0` remains
  available for a trusted LAN; it does not add authentication for native HTTP
  clients. The server is not intended for exposure to untrusted networks.
- The Seanime companion and AnkiConnect both default to port 8765. An existing
  conflicting service must be closed before desktop setup. Dynamic companion
  ports are intentionally rejected because the plugin's endpoint and network
  permission are fixed. Existing alternate-port installations need setup rerun.
- Live browser/native Seanime playback, Windows execution, real provider calls,
  packaged installer rebuilds, and deployment were not exercised. No running
  installation was updated. The finished patch has test and self-review evidence,
  rather than a second independent review after implementation.
