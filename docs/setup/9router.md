# 9Router setup

9Router manages the upstream provider credentials. LangPlay uses its
OpenAI-compatible API and keeps all existing AI providers available.

## Desktop companion and Seanime

Set these environment variables before launching the companion:

```sh
export LANGPLAY_AI_PROVIDER=9router
export LANGPLAY_9ROUTER_BASE_URL=http://127.0.0.1:20128/v1
export LANGPLAY_9ROUTER_API_KEY='your-router-token'
export LANGPLAY_9ROUTER_MODEL='your-exact-model-or-combo-id'
```

The URL defaults to `http://127.0.0.1:20128/v1`. The model is required; provider
prefixes and combo names are preserved exactly after trimming surrounding spaces.
The token is optional only when authentication is disabled in your router.
Seanime continues using the companion's explain/chat routes and never receives
these credentials. In the server player, select **9Router** in the AI selector.
Its configuration badge does not establish connectivity. `/api/ai/status`
reports whether configuration is valid, without making an upstream request.

## Browser extension

Open extension **Options**, choose **9Router**, and enter the API base URL,
optional router token, and exact model/combo ID. **Load Models** discovers IDs;
you may still type a model or combo manually. **Test 9Router** sends a completion
using the current form; it does not save it. Click **Save Settings** to persist.
Allow access to the endpoint if the browser requests permission.

YouTube grammar, Sensei chat, explicitly selected song-identification AI, and
the extension player use the worker's saved configuration. The router token
stays in extension storage and is not passed to YouTube content/page requests.
The extension configuration is independent of the desktop companion variables.

Use an HTTP(S) API URL without embedded credentials, query strings or fragments.
A root address is normalized to `/v1`; trailing slashes and an existing
`/chat/completions` suffix are accepted. Redirects are rejected: enter the final
API URL directly. Rejected-token, rate-limit, timeout and malformed-response
errors do not expose upstream response bodies. A failed selected 9Router request
does not switch to another provider.
