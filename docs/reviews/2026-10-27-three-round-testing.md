# Three paired testing rounds — 27 October 2026

Status: all three paired rounds completed; all 30 confirmed issue families repaired and verified.

## Method and comparison

The requested models were used for each pair: **Claude Sonnet 5.5 with
Ultrathink** (its available highest reasoning setting) and **GPT-6.1 Sol with
Ultra**. Each review was a fresh delegated task. The parent reproduced findings,
made repairs, and added regression coverage between rounds. Reviewers did not
edit project source. This gives independent testing of parent-authored fixes;
the parent’s own runtime findings are explicitly separate.

The repository is not AEK-enrolled. Existing uncommitted work was preserved.
Nothing was committed, published, installed into the active profile, or deployed.
This report supplements `2026-10-27-code-review.md`, which records the earlier
review/refactor rather than the three testing rounds below.

| Round | Sonnet direction and result | Sol direction and result |
| --- | --- | --- |
| 1 | Runtime, HTTP, installer, files: 11 confirmed findings | Frontend/Seanime state and recovery: 2 confirmed findings |
| 2 | Swapped to uploads, cues, controller and service queue: 7 confirmed findings | Swapped to backend stress and limits: 1 confirmed finding; independently confirmed prior backend fixes |
| 3 | Backend regressions and cross-layer validation: 2 confirmed unusual-provider failures | Real UI/bridge/plugin/controller/service flow: 3 confirmed cancellation boundary failures; prior fixes independently verified |

The first two rounds found different failures rather than duplicating one
another. Sol’s second round also encountered recursive cache metadata while its
fix was landing; a fresh-process rerun confirmed the repair, so it is not counted
as another outstanding bug. Four additional root-page parity failures were
identified and repaired by the parent during runtime testing. These are **30 issue families** across the three rounds and parent runtime work,
all repaired; this count does not include the earlier refactor report’s findings.
The final five repairs were made after both third-round reviewers finished, then
self-reviewed and verified with their executable probes and persistent regressions.
There was no fourth independent review of those last repairs.

## Confirmed findings and repairs

| ID | Source | Severity | Trigger and repair |
| --- | --- | --- | --- |
| B1 | R1 Sonnet | Medium | Another service owns the companion port: bounded, typed health validation now reports the friendly ownership error. |
| B2 | R1 Sonnet | Low–Medium | Malformed Jimaku response shapes dropped HTTP replies: validate lists, dictionaries and URL strings before use. |
| B3 | R1 Sonnet | Low–Medium | Windows Shift_JIS extensions failed: decode the legacy option with CP932, preserving `①㈱髙`. |
| B4 | R1 Sonnet | Low | Health bypassed Origin checks: apply the same local-origin guard before returning profile information. |
| B5 | R1 Sonnet | Low | Directories named as subtitle/cache files leaked descriptors: close the descriptor if `fdopen` fails. |
| B6 | R1 Sonnet | Low | Deep JSON caused server errors: return 400 for recursion; also reject lone surrogate keys/values before side effects. |
| B7 | R1 Sonnet | Low | Percent-encoded NUL in static paths dropped connections: reject with 404. |
| B8 | R1 Sonnet | Low | Slow-drip clients indefinitely occupied workers: enforce a total header/body receive deadline, canceled before provider work. |
| B9 | R1 Sonnet | Low | Large CLI arguments failed with E2BIG: enforce a 16 KiB UTF-8 prompt bound and return a client error before execution. |
| B10 | R1 Sonnet | Low | Bookmark CR and leading `#` damaged Anki rows: flatten line separators and HTML-escape the initial comment marker. |
| B11 | R1 Sonnet | Low | Non-string analysis provider returned 500: validate consistently and return 400. |
| S1 | R1 Sol | Medium | 300 simultaneous cues churned the 256-entry reading cache and starved later cues: retain active readings separately from the general LRU. |
| S2 | R1 Sol | Medium | Concurrent same-selection chat reordered history: serialize turns per context and release the guard after errors. |
| P1 | Parent runtime | Medium | Root page used the advancing sentence for a previously clicked word: capture immutable word/sentence context for explanation and cards. |
| P2 | Parent runtime/parity | Medium | Older asynchronous caption loads crossed video changes: guard completion and fallback paths by playback revision. |
| P3 | Parent parity | Medium | Automatic replacement retained manual-caption ownership: reset the flag when replacing the timeline. |
| P4 | Parent parity | Medium | Canceled root AI responses could update a later selection: guard callback identity and cleanup. |
| F1 | R2 Sonnet | Medium | Earlier slow subtitle read overwrote a later pick: guard file completion by upload revision. |
| F2 | R2 Sonnet | Medium | Pending subtitle read attached to a new video: guard completion by playback revision too. |
| F3 | R2 Sonnet | Medium | Invalid replacement erased working captions: validate before replacement, handle read errors, and reset the input for retry. |
| F4 | R2 Sonnet | Medium | Short overlapping cues hid an enclosing long cue: binary-search starts and use prefix maximum ends to find active overlaps. |
| S3 | R2 Sonnet | Low–Medium | Seanime file reads reversed import order: check the latest choice after the read and capture encoding/delay at pick time. |
| S4 | R2 Sonnet | Low–Medium | Stale queued lookups blocked a new sentence: check selection interest before dispatch and prioritize sentence translation within the four-request budget. Shared words remain useful to new selections. |
| S5 | R2 Sonnet | Low | Reapplying the same delay erased the study panel: reset only when the session actually invalidates its selection. |
| B12 | R2 Sol | Low | Mixed nested Jimaku flag types caused a sort TypeError: accept only Boolean anime/external/unverified flags; malformed entries produce the existing recovery response. |
| B13 | R3 Sonnet | Low–Medium | Malformed upstream HTTP, incomplete reads, socket/TLS failures and invalid Content-Length escaped recovery: normalize them to actionable Jimaku client errors. |
| B14 | R3 Sonnet | Low–Medium | Lone-surrogate filenames aborted search after a write: filter invalid Unicode before downloading or writing; valid fallback candidates remain usable. |
| S6 | R3 Sol | Medium | Pending local file overwrote a later saved/pasted source: all manual source choices invalidate pending reads. |
| S7 | R3 Sol | Medium | A pending local file attached to the next episode: invalidate on published playback identity changes and validate the captured identity again at the plugin boundary. |
| S8 | R3 Sol | Low | Obsolete queued translations exhausted admission for the newest selection: remove/cancel obsolete queued entries, count live interests for admission, and guard map cleanup by request identity. |

Root-page fixes and upload/overlap regressions cover both `static/js` and
`extension/js`. The repeated import races, read errors, active-cue oracle, dense
cache, chat order/retry, queue interest, and unchanged-delay behavior have
persistent automated regressions in the repository.

## Final automated checks

The affected Python/installer and Seanime suites were rerun after the final
repairs. Root and extension checks below passed at their final unchanged source
versions before round 3; their relevant sources did not change afterward.

| Check | Result |
| --- | --- |
| Python `tests/test_*.py` | 75 passed |
| Installer `installer/tests/test_*.py` | 25 passed |
| Root `node --test tests/test_*.js` | 108 passed |
| `npm --prefix integrations/seanime test` | 136 passed |
| `node extension/run_tests.js` | 14 suites passed |
| `npm --prefix integrations/seanime run build` | Passed deterministic bundle and isolated callback smoke |
| `git diff --check` | Passed |

Total: **344 automated tests**, plus the extension’s **14-suite** check. Python
discovery was run through a guard wrapper that rejects external network access,
blocks unmocked subprocesses, and pins AI executable discovery to a nonexistent
test path. The wrapper still discovers and runs the existing Python and installer
suites; native-host fixture installation and venv setup are explicitly allowed.

## Runtime and adversarial evidence

- Ran the real Python HTTP handler and Sudachi parser in temporary profiles on
  separate loopback ports. User services on 8765 and 43211 were left running.
- Browser playback decoded 59 frames of a generated six-second WebM and advanced
  approximately 0.642 seconds. Imported real SRT cues, changed reading modes,
  adjusted delay, and verified input-focused shortcuts did not alter delay.
- Captured `猫` in `猫がいる`, advanced captions to `犬がいる`, then verified the
  fixture AI prompt and saved card still used `猫がいる`. The pipeline exercised
  real HTTP, parsing, file writes and UI; AI responses were controlled fixtures.
- Loaded the learning bundle in an isolated official Seanime 3.10.4 desktop
  sidecar and granted permissions through its UI. Logs confirm registration and
  plugin initialization. Its later exit followed the desktop sidecar log message
  “No connection detected for 10 seconds” after test tabs closed,
  rather than a demonstrated application crash. Actual player-overlay behavior
  was not qualified.
- Sonnet R1: 1,500 Unicode parser strings remained lossless with exact UTF-16
  spans; Origin matrices and repeated concurrent parsing passed.
- Sol R2: exact route body limits and cap+1, 16,384/16,385-byte prompts across
  ASCII/CJK/astral characters, 32 malformed JSON/Unicode requests, CP932, 120
  rejected filesystem paths without descriptor growth, cache tamper repair,
  24 concurrent bookmark writes, and bounded health payload parsing passed.
- Sol R2: saturated worker recovery passed for idle/header/body trickles at a
  shortened 0.4-second receive deadline. A completed body followed by a slow
  fixture provider still returned 200, confirming the receive timer is disarmed.
- Parent independently reran the malformed nested Jimaku reproduction after its
  repair: HTTP 400 with an actionable response; all 32 worker slots recovered.

- Sol R3: 150,000 seeded overlap queries passed across root, extension and Seanime.
  The real UI → bridge → plugin → controller → storage probes independently
  confirmed the mixed-source and episode failures. After repair, all eight
  integration probe groups pass, including 300 active cues with exactly 300
  parse requests, shared-word/sentence reuse, and ordered chat.
- Sonnet R3: malformed HTTP/status/header/read/TLS cases now return friendly 400
  responses. Invalid filename candidates produce no orphan files, and a valid
  second candidate succeeds. Its fallback fixture was corrected from SRT bytes
  labeled VTT to a matching SRT extension. Sol’s post-fix switch probe was also
  adjusted to accept an absent association map, which is the repaired behavior.

## Limits and test-side effects

This is broad edge-case coverage, not proof that every possible input or platform
works. Linux was exercised. Windows/macOS, native fullscreen, trusted-pointer
actionability, installed Chrome extension behavior, real Anki import, real
YouTube/yt-dlp, actual AI quality/CLI option parsing, and real Jimaku/Google API
integration remain unqualified. Local subtitle encodings beyond the tested
backend/Seanime paths were not qualified. The full ten-second receive deadline
was represented by shorter deterministic stress tests rather than a long soak.

One parent validation test initially missed a provider mock and invoked the local
AI CLI once with an artificial Japanese word. It completed before the attempted
targeted stop. The test was corrected and stronger executable, provider, network
and temporary-file guards added. Browser AI testing used fixtures. Sonnet’s
initial lone-surrogate CLI probe failed during argv encoding before execution;
its later probes used a fake executable. No other real provider testing is
claimed. Test-generated files were isolated; an untracked empty bookmark header
was removed only after its exact fixture bytes were verified.

No security exploit is claimed from unconfirmed `innerHTML` concerns. A single
unreproduced connection reset, expected 503 admission responses under saturation,
and preview actionability timeouts were not counted as product bugs.

## Evidence locations

Session artifacts are in `/tmp/langplay-testing-20261027/`: `round1-sonnet.md`,
`round1-sol.md`, `round2-sonnet.md`, `round2-sol.md`, the final round reports,
individual standalone probes/logs, browser JSON, `final-*.log`, and
`round3-source-sha256.json`. These temporary artifacts may not survive reboot.
Persistent tests and this report are the durable record. The snapshot fingerprint
covers 14 relevant source files; both final reviewers verified all 14 remained
unchanged during their runs. `final-source-sha256.json` records the final source
after the five parent repairs. The reviewers’ earlier raw reports describe the
before-fix failures; `parent-after` probe logs and the final regression logs record
the repaired behavior.

## PR preparation and local recovery follow-up

After the testing task, the user's active Seanime profile was inspected for
missing LangPlay controls. Its installed bundle differed from the tested build,
and the startup log contained an asynchronous `TypeError`. Updating and reloading
only LangPlay recovered one control group without its `hidden` attribute and one
caption surface through the host DOM bridge. The installed manifest then matched
the tested build exactly. The precise failing startup call and native pointer
interaction were not established by that check. The original manifest was backed
up; cards, preferences and unrelated extensions were preserved.

A later T3 restart cleared the temporary testing artifacts. Before PR creation,
the cancelled caption/service command was rerun successfully (19 tests), followed
by fresh full verification: 75 Python, 25 installer, 108 root Node and 136 Seanime
tests, all 14 extension suites, the production build and whitespace checks passed.
The new PR branch starts from current `main` and preserves its serialized
bundle-building tests and Windows-safe browser entry path. Fresh session logs
are under `/tmp/langplay-pr-20261027/`; persistent regression tests remain the
reproducible evidence.
