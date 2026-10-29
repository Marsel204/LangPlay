/* Shared by extension-owned Options and worker only. Never inject credentials into a page. */
globalThis.RouterAI = (() => {
  function config(values = {}, requireModel = true) {
    for (const field of ['url', 'key', 'model']) {
      if (values[field] !== undefined && typeof values[field] !== 'string') throw new Error('9Router settings must be text.');
    }
    let endpoint;
    try { endpoint = new URL(values.url?.trim() || 'http://127.0.0.1:20128/v1'); }
    catch { throw new Error('9Router URL must be a valid HTTP(S) API address.'); }
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      throw new Error('9Router URL must use HTTP(S), without credentials, query or fragment.');
    }
    let path = endpoint.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
    endpoint.pathname = path || '/v1';
    const model = values.model?.trim() || '';
    const key = values.key?.trim() || '';
    if (requireModel && !model) throw new Error('Enter your exact 9Router model or combo ID in Extension Settings.');
    if (/[\r\n]/.test(key)) throw new Error('9Router token must be a single line.');
    return {url: endpoint.href.replace(/\/$/, ''), model, key, origin: `${endpoint.protocol}//${endpoint.hostname}/*`};
  }
  class RouterRequestError extends Error {}
  async function request(values, {messages, isJson = false, models = false, signal} = {}) {
    const cfg = config(values, !models);
    if (!models && (!Array.isArray(messages) || !messages.length || !messages.every(m => m && ['system','user','assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim()))) {
      throw new Error('9Router requires nonempty valid chat messages.');
    }
    if (!await chrome.permissions.contains({origins:[cfg.origin]})) throw new Error('Allow access to the 9Router endpoint in Extension Settings.');
    if (signal?.aborted) throw new Error('9Router request cancelled.');
    const headers = {'Content-Type':'application/json'};
    if (cfg.key) headers.Authorization = `Bearer ${cfg.key}`;
    let response;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, {once:true});
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      response = await fetch(cfg.url + (models ? '/models' : '/chat/completions'), {
        method: models ? 'GET' : 'POST', headers, redirect:'error', signal:controller.signal,
        ...(models ? {} : {body:JSON.stringify({model:cfg.model, messages, stream:false, max_tokens:4096, ...(isJson ? {response_format:{type:'json_object'}} : {})})})
      });
      if (!response.ok) {
        throw new RouterRequestError({401:'9Router token rejected. Check the router token.',403:'9Router access denied. Check the router token.',429:'9Router rate limit reached. Wait and retry.'}[response.status] || '9Router request failed. Check its configuration.');
      }
      const reader = response.body?.getReader();
      if (!reader) throw new RouterRequestError('9Router returned an empty response.');
      const chunks = []; let size = 0;
      while (true) {
        const {value, done} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new RouterRequestError('9Router response is oversized.'); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.length;}
      let data;
      try {data = JSON.parse(new TextDecoder().decode(bytes));} catch {throw new RouterRequestError('9Router returned malformed JSON.');}
      if (models) {
        if (!Array.isArray(data?.data) || !data.data.every(m => m && typeof m.id === 'string' && m.id.trim())) throw new RouterRequestError('9Router returned a malformed model list.');
        return data.data.map(m => m.id);
      }
      const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
      if (choice?.finish_reason !== 'stop' || typeof choice?.message?.content !== 'string' || !choice.message.content.trim()) throw new RouterRequestError('9Router returned an empty, incomplete or malformed reply. Retry with a shorter request.');
      return choice.message.content.trim();
    } catch (error) {
      if (error instanceof RouterRequestError) throw error;
      throw new RouterRequestError('9Router unreachable, timed out or redirected. Check the final API address and that the router is running.');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      controller.abort();
      if (response?.body && !response.body.locked) {
        try {await response.body.cancel();} catch { /* already closed */ }
      }
    }
  }
  return {config, request};
})();
