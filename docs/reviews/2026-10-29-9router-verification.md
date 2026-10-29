# 9Router implementation verification — 2026-10-29

Implementation by 6.1 Sol, with final review and one small correction by Astra;
see [Astra's review](2026-10-29-9router-astra-review.md). No commits, pushes,
installation, deployment, live profile changes or existing-service operations.
Target has no `.aek/project.json`; the parent's plan was the only initial change.
Reference `/home/marsel/Projects/LangPlayext` was inspected read-only.

## Changes

- `Server.py`: explicit `9router` dispatch for analyze/chat; companion environment
  configuration; normalized API URL; exact model IDs; optional bearer token;
  bounded response reads and socket timeouts; rejected redirects; sanitized errors;
  configuration-only status; configuration hash in analysis cache keys, validated
  before cache lookup. Credentials are not included in request payloads or status.
- Extension Options: separate URL/password/model settings, Save/reload, model
  discovery with manual combo entry, permission handling, and an unsaved-form Test.
  Existing provider keys and defaults are preserved.
- `extension/js/router.js`: shared Options/worker transport, streamed response-size
  bound, 30-second abort timer, redirect rejection, strict completion/model shapes,
  fixed authentication/rate-limit/transport errors. Worker reads credentials from
  storage. Its registration is classic service-worker mode with `importScripts`
  for the shared script; existing background behavior passes regression tests.
- Extension content and standalone player route selected 9Router requests through
  the worker. Content does not read router credentials. Song identification does
  not fall back from explicitly selected 9Router. Player provider changes abort
  callbacks; content analysis checks drawer/request versions; configuration changes
  invalidate content requests and chat context.
- Server player selects 9Router through the credential-free companion route and
  displays a configuration hint rather than claiming connectivity. Seanime source
  remains unchanged and continues using its existing companion payloads.
- `build_content_js.py` and `extension/content.js` match byte-for-byte when the
  generator is executed with output redirected to a temporary file.
- Setup: `docs/setup/9router.md`, linked from README, documents all four companion
  variables and independent extension setup.

## Red → green evidence

Before production changes:

- `python -m unittest discover -s tests -p test_9router.py`: **4 errors / 4 tests**,
  expected missing `router_config` and `run_router_completion` entry points.
- `node --test tests/test_9router.js`: **3 failures / 3 tests**, expected missing
  `extension/js/router.js`.

After implementation, the initial 4 Python and 3 Node checks passed. Additional
boundary/HTTP/player/content and review regression tests bring focused totals to
**9 Python + 14 Node**, including Astra's final model-filtering regression.
Tests exercise production functions with in-memory fake transports or loopback
HTTP clients. HTTP tests prohibit Antigravity/DeepSeek fallback. All keys are fake.

## Final commands and results

| Command | Result |
| --- | --- |
| `.venv/bin/python -m unittest discover -s tests -p 'test_*.py'` | **84 passed**, 9.166 seconds; no failures |
| `node --test --test-reporter=dot tests/test_*.js` (final Astra run) | **122 passed**, no failures/skips |
| `npm test` in `integrations/seanime` (initial implementation run) | **136 passed**, no failures/skips; not repeated for review corrections because its sources/build inputs did not change |
| `npm run build` in `integrations/seanime` (initial implementation run) | Passed deterministic bundle and isolated callback smoke; 8,576-byte host and 201,874-byte learning payload |
| `node tests/browser_9router.mjs` | Passed real Options/worker, deferred Options checks, actual extension player provider/configuration resets and fresh retry, unchanged-setting preservation, standalone module analysis and missing-model error; **10 fake-router HTTP requests** |
| Temporary-output execution of `build_content_js.py`, byte comparison with checked-in content | Passed |
| `git diff --check` | Passed |

The focused browser script fixes the older browser check's root assumption by
loading `/home/marsel/Projects/LangPlay/extension`. It creates and removes a
separate Chromium profile and local fake router. It records that every request
carries the fake bearer only in headers, not bodies, and never originates from
YouTube. No native-host startup checks are invoked. It does not use a live AI,
existing browser profile, or real provider credentials.

Focused coverage includes URL defaults/suffix/root normalization, exact prefixed
models, optional token, rejected URL credentials/query/hash, invalid settings
field types, missing model, JSON mode and stream=false, contextual chat ordering,
cache endpoint/model/token isolation and validation before cache, no-network
permission denial, model discovery, 401/403/429 hints, sanitized network/timeout
errors, empty/wrong/truncated/malformed/oversized replies, redirect rejection,
credential-free server dispatch and worker-only content dispatch.

## Review concerns and limits

- No unresolved test failures. The Node suite initially exposed static-import
  incompatibility with its VM worker harnesses; classic service-worker loading
  resolved it and real Chromium confirmed registration. One newly added server
  module test initially retained an ES import in its VM harness; the harness was
  corrected and passes.
- Browser integration exercises real Options/worker, the standalone AI module,
  and the actual extension player page with its production app handlers and a
  synthetic selected token. It checks provider switching during loading, saved
  model/provider updates, immediate retry, and preservation of rendered cards for
  unchanged/unrelated storage changes. It does not play video, load a real YouTube
  watch page, or visually audit the UI. External dictionary/translation requests
  are blocked during the player check and its companion status fetch is stubbed.
  Both server and extension player change handlers are also executed by Node
  tests with pending-state DOM stubs; the server player is not browser-validated.
- No real 9Router instance, model-provider connectivity, live Seanime host, or
  external account was exercised. Seanime's existing 136 tests/build remain green.
- No new visual redesign or screenshot audit was performed; the additions use
  the current Options form classes. Model discovery uses a native datalist and
  retains manual IDs/combos.
- Companion configuration errors on analysis currently use the existing route's
  HTTP 500 error contract, with an actionable sanitized message. Chat configuration
  errors use HTTP 400 through its existing ValueError handler.
- Companion socket timeout is 45 seconds; extension requests have a 30-second
  wall-clock abort timer. A model that exceeds those limits should be shortened
  or configured differently upstream.


## Astra review corrections — Sol follow-up

All four actionable findings and both related extension transport findings were
addressed in the shared checkout before handoff. Final Astra review is recorded
in the linked review report and the addendum below.

- Catch `http.client.HTTPException` at the router boundary, including
  `BadStatusLine` and `IncompleteRead`. Both HTTP routes and analysis logs are
  checked against a fake sentinel; deliberate actionable router errors remain.
- Options snapshots unsaved values, shares one current check across Test and Load
  Models, aborts superseded transport, invalidates on input/change, clears obsolete
  catalogs, and guards both transport and permission continuations. Deferred
  permission acceptance/denial cannot start obsolete transport or overwrite status.
- Both player provider handlers reset skeleton, stream, cards, errors and cached
  AI data while retaining selected word/context. Extension saved-settings updates
  use the same reset and refresh provider UI. Effective applied settings are tracked
  so unchanged values and the player's own delayed provider notification do not
  cancel later requests. Inactive router/server changes do not clear another
  provider's current data.
- Initial extension storage loading is awaited before requests dispatch and before
  initial provider UI refresh. Changes applied while that read is pending win over
  its older snapshot. Both callback and Promise storage interfaces are supported.
- Router transport now requires array-shaped choices, accepts caller cancellation,
  aborts abandoned fetches, and explicitly cancels unlocked HTTP error bodies.

Review regressions were added before production corrections. Red commands:

- `.venv/bin/python -m unittest discover -s tests -p test_9router.py`:
  **8 passed, 1 failed / 9**, exposing the sentinel in the analyze HTTP error and log.
- `node --test tests/test_9router.js`: **6 passed, 4 failed / 10**, exposing
  object-shaped choices, obsolete Options success, stuck player skeleton, and
  missing saved-settings listener. The player test executes each production
  provider-change handler, and Options tests invoke production registered handlers.
- A subsequent inactive-transport regression failed **1 / 13** before narrowing
  invalidation to the active transport. Additional deferred-body/permission and
  initialization ordering coverage passes in the final 13-test focused suite.

Final follow-up commands:

| Command | Result |
| --- | --- |
| `.venv/bin/python -m unittest discover -s tests -p test_9router.py` | **9 passed** |
| `node --test tests/test_9router.js` | **13 passed** |
| `.venv/bin/python -m unittest discover -s tests -p 'test_*.py'` | **84 passed**, 9.166 seconds |
| `node --test tests/test_*.js` | **121 passed**, no failures/cancellations/skips |
| `node tests/browser_9router.mjs` | Passed, **10 fake-router HTTP requests**, disposable profile cleaned |
| Execute `build_content_js.py` with only its output open redirected to a temporary directory; compare bytes | Passed, generated content unchanged |
| `git diff --check` | Passed |

During follow-up, the first broader Node rerun exposed six existing async-provider
tests whose Promise-only storage mock did not invoke a callback. Supporting both
storage forms resolved this without changing those existing tests or assertions.
The expanded browser scenario also exposed and now covers initial storage loading
canceling the first imported-module request. No unresolved test failures remain.

The browser test now times out stalled CDP operations and closes fake-router
connections during cleanup. Two interrupted exploratory browser runs were stopped
and their disposable profiles removed. No existing profiles or services were used.
No live AI, real secrets, child agents, Seanime rebuild, commit, push, PR, deployment,
or service restart was performed. Companion timeout remains a 45-second **socket**
timeout, not a total wall-clock deadline.

## Final Astra verification

Astra independently inspected Sol's corrections and found one small remaining
Options issue: typing a model prefix cleared the discovered suggestions. A new
production-handler regression failed before the one-line correction and passed
afterward. Catalogs now clear when URL or token changes; edits still invalidate
stale connection tests. The browser check also exercises prefix typing against
the real Options page.

Final reruns passed: **9 focused Python tests**, **122 Node tests** (including
**14 focused router tests**), the disposable Chromium check (**10 fake-router
requests**), and `git diff --check`. No Python, Seanime, generator or generated
content sources changed in this final pass. Astra's review is complete with no
remaining material findings and the live-integration limits stated above.
