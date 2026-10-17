// Opaque process-local IDs prevent stream proxy credentials and local paths
// from crossing the webview boundary. Compare the original IDs at mutation time.
export function createHost(core) {
  let raw = null, serial = 0, identity = null;
  function snapshot() {
    const info = core.getCurrentPlaybackInfo(), status = core.getPlaybackStatus();
    const clientId = core.getCurrentClientId();
    if (String(core.getCurrentPlayerType()) !== 'web' || !info?.id || !status ||
        !clientId || status.clientId !== clientId || status.id !== info.id || !Number.isFinite(status.currentTime)) return null;
    if (!raw || raw.id !== info.id || raw.clientId !== clientId) {
      raw = { id: info.id, clientId }; serial++;
      identity = { clientId: `client-${serial}`, playbackId: `playback-${serial}`, videoIdentity: `video-${serial}` };
    }
    const title = info.media?.title;
    return { ...identity, positionMs: Math.max(0, status.currentTime * 1000),
      durationMs: Math.max(0, Number(status.duration || 0) * 1000), paused: !!status.paused, rate: 1,
      title: String(typeof title === 'string' ? title : (title?.userPreferred || title?.romaji || title?.english || '')),
      episode: String(info.episode?.episodeNumber || info.onlinestreamParams?.episodeNumber || ''),
      association: info.media?.id ? `${info.media.id}:${info.episode?.episodeNumber || info.onlinestreamParams?.episodeNumber || ''}` : '',
    };
  }
  function control(expected, op) {
    const state = snapshot();
    if (!state || !expected || ['clientId', 'playbackId', 'videoIdentity'].some(k => expected[k] !== state[k])) {
      throw new Error('Playback session changed; control rejected.');
    }
    core[op]();
  }
  return { snapshot, pause: expected => control(expected, 'pause'), resume: expected => control(expected, 'resume') };
}
