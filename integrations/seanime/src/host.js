// Opaque process-local IDs prevent stream proxy credentials and local paths
// from crossing the webview boundary. Compare the original IDs at mutation time.
export function createHost(core) {
  let raw = null, serial = 0, identity = null;
  function snapshot() {
    const info = core.getCurrentPlaybackInfo(), status = core.getPlaybackStatus();
    const clientId = core.getCurrentClientId();
    if (!['web', 'native'].includes(String(core.getCurrentPlayerType())) || !info?.id || !status ||
        !clientId || status.clientId !== clientId || status.id !== info.id || !Number.isFinite(status.currentTime)) return null;
    const episode = String(info.episode?.episodeNumber || info.onlinestreamParams?.episodeNumber || '');
    const mediaId = Number(info.media?.id) || 0;
    if (!raw || raw.id !== info.id || raw.clientId !== clientId || raw.episode !== episode || raw.mediaId !== mediaId) {
      raw = { id: info.id, clientId, episode, mediaId }; serial++;
      identity = { clientId: `client-${serial}`, playbackId: `playback-${serial}`, videoIdentity: `video-${serial}` };
    }
    const title = info.media?.title;
    const durationMs = Number(status.duration) * 1000;
    return { ...identity, positionMs: Math.max(0, status.currentTime * 1000),
      durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : undefined, paused: !!status.paused, rate: 1,
      title: String(typeof title === 'string' ? title : (title?.userPreferred || title?.romaji || title?.english || '')),
      episode, mediaId,
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
  async function matchesVideo(video) {
    const info = core.getCurrentPlaybackInfo();
    if (!info?.id) return false;
    const base = String(await video.getProperty('baseURI') || '');
    const pageMedia = base.match(/[?&]id=(\d+)/)?.[1];
    if (core.getCurrentPlayerType() === 'web' && pageMedia && String(info.media?.id) !== pageMedia) return false;
    const src = String(await video.getProperty('currentSrc') || await video.getProperty('src') || '');
    if (src && !src.startsWith('blob:') && info.streamUrl) {
      const origin = base.match(/^https?:\/\/[^/]+/)?.[0] || '';
      let expected = info.streamUrl.replace('{{SERVER_URL}}', origin);
      if (expected.startsWith('/')) expected = origin + expected;
      if (src !== expected) return false;
    }
    return true;
  }
  return { snapshot, matchesVideo, pause: expected => control(expected, 'pause'), resume: expected => control(expected, 'resume') };
}
