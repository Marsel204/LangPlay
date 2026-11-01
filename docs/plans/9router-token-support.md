# 9Router token support

## Scope and ownership

The user requested 9Router support using `/home/marsel/Projects/LangPlayext`
as the reference and confirmed both the Seanime/desktop companion and browser
extension. Keep existing providers and saved settings working. Astra owns this
specification, test proposal, orchestration, and final review. GPT-6.1 Sol owns
implementation and detailed testing.

This repository has no `.aek/project.json`; its existing test and build workflow
applies. The implementation request authorizes this work. No deployment,
installation into a live profile, publishing, or real credential is required.

## Required behavior

1. Add the explicit provider ID `9router`. Use the reference's default API base
   `http://127.0.0.1:20128/v1`, optional router token, and required model/combo ID.
   Preserve model IDs, including provider prefixes, exactly after trimming.
   Upstream provider credentials remain managed by 9Router.
2. The companion supports both `/api/ai/analyze` and `/api/ai/chat`. Select it
   through `LANGPLAY_AI_PROVIDER=9router`; configure
   `LANGPLAY_9ROUTER_BASE_URL`, `LANGPLAY_9ROUTER_API_KEY`, and
   `LANGPLAY_9ROUTER_MODEL`. Seanime uses those existing companion routes without
   receiving the token. Status reports configuration, never credentials or
   unverified connectivity. Analysis cache identity includes router configuration
   so changing endpoint, model, or credentials cannot reuse another configuration's
   answer. Validate configuration before reading a cached answer.
3. Extension Options provides a 9Router choice, labeled URL/token/model fields,
   Save, Load Models, and Test 9Router. Use the reference's storage names:
   `linguaplay_9router_url`, `linguaplay_9router_key`, and
   `linguaplay_9router_model`. A password field holds the token. A model list is
   discovery only; Test sends a completion using the unsaved form and does not
   implicitly save. Manual IDs and combos remain available. Preserve the existing
   page design; no redesign or large provider-browser port is required.
4. YouTube grammar, Sensei chat, song-identification AI when explicitly selected,
   and the extension standalone player route 9Router through the extension worker.
   The worker reads its token from extension storage. Content/page code receives
   only the result. Maintain both `build_content_js.py` and the generated
   `extension/content.js` without overwriting unrelated fixes.
5. The server-hosted standalone player can select 9Router and use companion
   configuration. Explain configuration in the UI without claiming the router
   is connected merely because it is selected. Keep provider selection and request
   cancellation behavior consistent across player surfaces.
6. Use OpenAI-compatible `POST /chat/completions`, a bearer token only when
   nonempty, `stream: false`, and `response_format: {type: 'json_object'}` for
   structured explanations. Do not hardcode an upstream provider or model. Use
   `GET /models` for extension discovery. Normalize a root base URL to `/v1`,
   trailing slashes, and an existing completion suffix consistently. Reject
   non-HTTP(S) endpoints and embedded credentials; never pass URL query/hash
   secrets through. Respect extension endpoint permissions.
7. Bound network timeouts and response sizes; reject empty, malformed, truncated,
   and unusable provider responses. Reject credential-bearing redirects. Error
   messages must be actionable for missing model, rejected token, rate limiting,
   unreachable router, timeout, and malformed responses, without echoing tokens,
   raw provider bodies, or credential-bearing transport errors. Do not silently
   switch a selected 9Router request to another provider. Late or aborted responses
   must not replace newer selections.

## Astra test proposal

Sol should first add focused executable tests and demonstrate their expected
failure before implementing. Tests must exercise production behavior with fake
credentials and blocked/mocked upstream transports, not duplicate implementation.

| Area | Required acceptance checks |
| --- | --- |
| Companion HTTP | Configured and explicitly selected 9Router serves analysis and contextual multi-turn chat; exact URL, bearer header, model, JSON mode, message ordering, and response contract. |
| Configuration | Default URL; trailing slash and completion suffix; missing model; optional blank token; invalid URL and field types; no network on invalid configuration; status has no token and makes no connectivity claim. |
| Isolation | Router endpoint/model/token changes invalidate analysis reuse; configuration validation is not bypassed by cache; no credential in bodies, responses, logs, or status; redirects cannot send credentials elsewhere. |
| Failure handling | 401/403, 429, timeout/network failure, invalid JSON, wrong top-level/choice/message shapes, empty content, truncation and oversized response fail usefully without exposing a sentinel token or calling another provider. |
| Extension settings | Save/reload round trip; provider keys remain separate; model discovery and manual combos preserve exact IDs; permission denial; Test uses current unsaved values, requires nonempty completion, and does not save. |
| Extension requests | Worker validation and auth; content chat/analysis use the worker rather than page fetch; extension standalone succeeds; missing model is actionable; no cross-provider fallback; late/aborted results are ignored. |
| Standalone/Seanime | Server player dispatches to the companion; Seanime explain and chat continue using existing credential-free payloads; old providers and defaults retain their behavior. |
| Integration | Real extension loaded into a disposable Chromium profile against a local fake router exercises Options, worker, and standalone player if available. No real token, AI call, or existing browser profile. |

## Milestones and verification

1. Add and run focused failing tests, then implement companion transport and
   dispatch. Verify the new HTTP contract and credential handling.
2. Implement extension settings/worker/client routing and server player selection.
   Verify persistence, completion dispatch, cancellation, and a fake-router browser
   integration. Keep documentation aligned with the implemented configuration.
3. Run focused tests, the existing Python/Node suites and Seanime tests/build.
   Record commands, pass/fail counts, baseline failures, and skipped dependencies.
   Use existing local environments when available. Never exercise live AI/CLI
   providers as an accidental side effect of tests.
4. Astra reviews the complete diff and verification evidence. Address concrete
   findings and rerun affected checks. Report any limits honestly.

Expected checks include `python -m unittest discover -s tests -p 'test_*.py'`,
`node --test tests/test_*.js`, `npm test` and `npm run build` in
`integrations/seanime`, and the focused fake-router browser check. Use `.venv`
for Python if it supplies the existing parser dependencies. Installer regression
checks apply if installer behavior changes.

Rollback consists of reverting the feature files. Existing credentials and
provider settings are not migrated, deleted, or overwritten; the reference
repository and live installed applications remain untouched.
