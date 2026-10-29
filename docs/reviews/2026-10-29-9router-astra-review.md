# Astra review of 9Router support

Astra reviewed Sol's uncommitted implementation against
`docs/plans/9router-token-support.md`. Astra also authored the specification and
orchestrated the work; this is a review by a different model from the implementer,
not an independently scoped specification review. No AEK enrollment applies.

## First-pass findings

1. **P1 — malformed upstream HTTP can leak raw data.**
   `Server.py:run_router_completion` catches URL, socket and JSON errors but lets
   `http.client.HTTPException` subclasses escape. Injecting
   `BadStatusLine('review-fake-token')` through the mocked opener propagates that
   exact sentinel; analyze/chat return `str(error)`, and analysis logs it.
   Sanitize protocol errors at the router transport boundary, preserve the
   deliberate actionable errors, and exercise both HTTP routes with sentinel
   protocol failures. Raw errors must not reach responses or logs.
2. **P2 — connection checks can describe obsolete form values.**
   In Options, begin Test, edit the token, then resolve the old response. The
   current code reports `9Router returned a completion` for the now-changed form.
   Load Models and Test can also race with one another. Snapshot request values,
   invalidate/abort obsolete checks on field changes and newer checks, suppress
   stale status/catalog writes, and clear a catalog for a changed connection.
   Verify the real event handlers, including deferred permission checks.
3. **P2 — provider switching leaves both players stuck loading.**
   The new `setAIProvider` aborts pending callbacks, but both app change handlers
   only update provider labels. Starting an explanation then switching providers
   leaves `aiLoadingSkeleton` visible and `aiTriggerSection` hidden. Reset the
   explanation state and cached AI result while preserving the selected word and
   sentence. The user must be able to request a fresh explanation immediately.
4. **P2 — saved router changes do not invalidate the extension player.**
   The extension AI module has no storage-change listener. A request started for
   model A can complete into the player after Options saves model B (or a different
   token, endpoint or provider). The content script does invalidate this case.
   Make the player observe relevant settings, abort/discard stale results, keep
   provider UI consistent, and return to a usable request state. Avoid canceling a
   fresh request because of a delayed notification for the player's own already
   applied provider change. Test unrelated settings and unchanged values too.

The first, second and fourth findings were reproduced using production functions
in an isolated Python/Node harness with fake values and deferred transport. The
third was reproduced by executing each production provider-change handler with
the UI in its real pending-state class configuration. No live upstream was used.

## Related transport checks

- The extension's `data?.choices?.[0]` accepts an object with a `0` property, even
  though the response contract requires an array. Require the expected shape and
  add that adversarial case.
- An HTTP error is raised before its fetch response body is consumed; the current
  `finally` clears the timeout without aborting or cancelling that body. Ensure
  failed or abandoned streams are released and verify this with a streaming fake.
- The companion's 45-second limit is a socket timeout, not a total deadline. Keep
  documentation explicit about this distinction; do not claim a wall-clock bound.

## Review status

Complete for the current uncommitted working-tree implementation. All four
first-pass findings and both extension transport findings are resolved. Astra
inspected the corrected sources and regression evidence and reran the focused
Python suite, full Node suite, and disposable Chromium integration.

The final pass found one small follow-up: Options cleared its discovered model
catalog on every model-field input, preventing normal suggestion filtering.
Astra added a regression which failed with 0 suggestions instead of 2, then
restricted catalog invalidation to URL/token changes. Model/provider edits still
invalidate old connection checks. The real browser check now verifies that typing
a model prefix retains the discovered options. This small correction was made
and self-reviewed by Astra; the main implementation and first-pass corrections
were coded and tested by Sol.

## Final verification

| Evidence | Result |
| --- | --- |
| Astra: `.venv/bin/python -m unittest discover -s tests -p test_9router.py` | 9 passed, including protocol-error redaction on both HTTP routes and analysis logs. |
| Astra: `node --test --test-reporter=dot tests/test_*.js` | 122 passed, including all 14 focused router checks. |
| Astra: `node tests/browser_9router.mjs` | Passed, 10 fake-router requests; Options discovery/filtering/Test/Save/races, worker dispatch, real extension-player state reset and retry. |
| Astra: `git diff --check` | Passed. |
| Sol: full Python suite on the unchanged final Python sources | 84 passed. |
| Sol: Seanime tests/build on unchanged integration sources and inputs | 136 passed; build passed. |
| Sol: temporary-output generator comparison | Matches checked-in content; neither file changed during the final pass. |

No remaining material findings. This review covers code, automated fixtures and
the stated browser interactions. It does not establish real 9Router/provider
connectivity, live Seanime or YouTube playback, or visual layout qualification.
The companion has a 45-second socket timeout, not a total deadline; extension
transport has a 30-second abort timer. Changes are not committed, installed,
published, or deployed.
