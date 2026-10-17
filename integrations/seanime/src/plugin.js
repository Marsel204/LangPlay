// Deliberately limited probe. No tracking writes, network, credentials or timers.
export function start(ctx) {
  const core = ctx.videoCore;
  const panel = ctx.newWebview({
    slot: 'fixed', hidden: true, width: '420px', height: '580px',
    maxWidth: '95vw', maxHeight: '85vh', zIndex: 200,
    window: { draggable: true, defaultPosition: 'top-right' },
  });
  const tray = ctx.newTray({ iconUrl: '', withContent: false });
  tray.onClick(() => panel.isHidden() ? panel.show() : panel.hide());
  let selectedSession;
  let lastStatusAt;
  const cadence = [];
  const session = () => ({ client: core.getCurrentClientId(), playback: (core.getCurrentPlaybackInfo() || {}).id });
  const matches = expected => {
    const current = session();
    return expected && expected.client && expected.playback &&
      expected.client === current.client && expected.playback === current.playback;
  };
  // Target host drops object replies when its account token is empty. This
  // probe sends no credentials; a JSON string also supports local-only hosts.
  const reply = value => panel.channel.send('probe:result', JSON.stringify(value));
  const guard = fn => async payload => {
    try { await fn(payload); }
    catch (error) { reply({ error: String(error.message || error) }); }
  };

  // Bound the descriptor read rather than reading an entire file after a stat.
  function boundedRead(filePath) {
    if (typeof filePath !== 'string' || filePath.length > 4096 || !/\.(srt|vtt|ass|ssa)$/i.test(filePath)) {
      throw new Error('Choose a text subtitle within the configured anime library.');
    }
    const file = $os.openFile(filePath, 0, 0);
    try {
      const info = file.stat();
      const size = info.size();
      if (info.isDir() || size <= 0 || size > 10 * 1024 * 1024) throw new Error('Subtitle must be between 1 byte and 10 MiB.');
      const bytes = new Uint8Array(size);
      const count = file.readAt(bytes, 0);
      if (count !== size) throw new Error('Subtitle changed during read.');
      // Probe returns a bounded byte sample, not an unbounded file body.
      return { size, sample: Array.from(bytes.slice(0, 128)) };
    } finally { file.close(); }
  }

  panel.channel.on('probe:snapshot', guard(async () => {
    const state = core.getPlaybackState();
    const info = core.getCurrentPlaybackInfo();
    const tracks = await core.getTextTracks();
    reply({ session: session(), renderer: core.getCurrentPlayerType(), status: core.getPlaybackStatus(),
      stateAvailable: !!state, subtitleTracks: info ? info.subtitleTracks : [], textTracks: tracks || null,
      cadenceMs: cadence.slice(), byteAPI: typeof $os.openFile });
  }));
  panel.channel.on('probe:select', guard(payload => {
    if (!payload || typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 4096) {
      throw new Error('Paste a short line from the test subtitle first.');
    }
    const current = session();
    if (!matches(current)) throw new Error('No active identified playback.');
    selectedSession = current;
    core.pause();
    reply({ selected: payload.text, pausedRequested: true, session: selectedSession });
  }));
  panel.channel.on('probe:resume', guard(() => {
    if (!matches(selectedSession)) throw new Error('Playback changed; resume rejected.');
    core.resume();
    selectedSession = undefined;
    panel.hide();
  }));
  panel.channel.on('probe:close', () => panel.hide());
  panel.channel.on('probe:native-subtitle', guard(() => {
    const expected = session();
    const info = core.getCurrentPlaybackInfo();
    const video = info && info.localFile && info.localFile.path;
    const renderer = core.getCurrentPlayerType();
    // Denshi 3.10.4's embedded libmpv adapter reports "mpv", not "native".
    const embedded = renderer === 'native' || (renderer === 'mpv' && info && String(info.target) === 'mpvcore');
    if (!matches(expected) || !video || !embedded) {
      throw new Error('Play a local episode in the native player before running this test.');
    }
    // Recheck the complete identity immediately before the host mutation.
    const current = core.getCurrentPlaybackInfo();
    if (!matches(expected) || !current || !current.localFile || current.localFile.path !== video) {
      throw new Error('Playback changed; subtitle test rejected.');
    }
    core.addExternalSubtitleTrack({
      label: 'LangPlay native test.ja.srt', language: 'ja', type: 'srt', default: true,
      content: '1\n00:00:00,000 --> 23:59:59,000\n日本語の字幕テストです。\n',
    });
    reply({ nativeSubtitle: 'sent', session: expected,
      instruction: 'Check the native CC menu for LangPlay native test.ja.srt and select it. Report whether Japanese text appears. Sending the command is not proof of loading or selection.' });
  }));
  panel.channel.on('probe:read', guard(payload => reply({ file: boundedRead(payload && payload.path) })));
  panel.channel.on('probe:adjacent', guard(() => {
    const info = core.getCurrentPlaybackInfo();
    if (!info || !info.localFile || !info.localFile.path) throw new Error('No local file identity.');
    const dir = $os.openFile($filepath.dir(info.localFile.path), 0, 0);
    try {
      const entries = dir.readDir(201);
      reply({ adjacent: entries.slice(0, 200).filter(entry => !entry.isDir() && /\.(srt|vtt|ass|ssa)$/i.test(entry.name()))
        .map(entry => entry.name()), truncated: entries.length > 200 });
    } finally { dir.close(); }
  }));
  core.addEventListener('video-status', () => {
    const now = Date.now();
    if (lastStatusAt !== undefined) {
      cadence.push(now - lastStatusAt);
      if (cadence.length > 120) cadence.shift();
    }
    lastStatusAt = now;
    if (selectedSession && !matches(selectedSession)) selectedSession = undefined;
  });
  core.addEventListener('video-terminated', () => { selectedSession = undefined; lastStatusAt = undefined; });
  panel.setContent(() => `<!doctype html><html lang="en"><meta charset="utf-8">
<style>:root{color-scheme:light dark}body{font:15px system-ui;margin:18px}button,input,textarea{font:inherit;margin:5px 0;padding:8px;max-width:100%;box-sizing:border-box}textarea,input{width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;max-height:220px;overflow:auto}button{cursor:pointer}</style>
<h2>LangPlay native probe</h2><p>Development checks only. Paste text from your test subtitle; no automatic cue synchronization yet.</p>
<button data-op="snapshot">Inspect active player</button><button data-op="adjacent">List adjacent subtitles</button>
<button data-op="native-subtitle">Load generated JP test subtitle</button>
<textarea id="line" rows="2" aria-label="Subtitle test line" placeholder="Paste a Japanese subtitle line"></textarea>
<button data-op="select">Select line → pause</button><button data-op="close">Close (stay paused)</button><button data-op="resume">Explicit resume</button>
<input id="path" aria-label="Absolute subtitle path" placeholder="Absolute subtitle path in anime library"><button data-op="read">Check bounded byte read</button>
<pre id="result" role="status">Waiting for host…</pre>
<script>webview.on('probe:result', value => { const data=typeof value==='string'?JSON.parse(value):value; document.getElementById('result').textContent=JSON.stringify(data,null,2); });
document.addEventListener('click',event=>{const op=event.target.dataset.op;if(!op)return;webview.send('probe:'+op,{text:document.getElementById('line').value,path:document.getElementById('path').value});});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();webview.send('probe:close',{});}});</script></html>`);
}
