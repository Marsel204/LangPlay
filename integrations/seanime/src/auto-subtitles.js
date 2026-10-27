// Fetch work never blocks the playback clock. Each result belongs to one
// playback identity and must lose to a later episode or manual source choice.
export function createAutoSubtitles({host, controller, services, storage, onChange = () => {}}) {
  let target = '', attempted = '', sequence = 0, pending = null, enabled = true;
  let feedback = {state:'idle', message:''};
  const identity = state => state && JSON.stringify([state.clientId,state.playbackId,state.videoIdentity,state.association]);
  function setStatus(state, message) {
    if (feedback.state === state && feedback.message === message) return;
    feedback = {state,message};
    Promise.resolve(onChange()).catch(() => {});
  }
  function update(wanted = true) {
    enabled = wanted;
    const snapshot = host.snapshot(), key = identity(snapshot);
    if (!enabled || !snapshot) {
      sequence++; target = attempted = ''; pending = null; setStatus('idle','');
      return Promise.resolve();
    }
    if (key !== target) { sequence++; target = key; attempted = ''; pending = null; setStatus('idle',''); }
    if (controller.view().source) {
      setStatus('ready',feedback.state === 'ready' ? feedback.message : 'Japanese subtitles ready.');
      return Promise.resolve();
    }
    if (attempted === key) return pending || Promise.resolve();
    attempted = key;
    const parts = /^(\d+):(\d+)$/.exec(snapshot.association || '');
    const mediaId = Number(snapshot.mediaId || parts?.[1]), episode = Number(snapshot.episode);
    if (!parts || !Number.isSafeInteger(mediaId) || mediaId <= 0 || !Number.isSafeInteger(episode) || episode <= 0 || Number(parts[2]) !== episode) {
      setStatus('error','Automatic subtitles need an identified anime episode. Load a file manually.');
      return Promise.resolve();
    }
    const ticket = ++sequence, originalSource = controller.view().source;
    const current = () => enabled && ticket === sequence && identity(host.snapshot()) === key;
    setStatus('searching','Finding Japanese subtitles for this episode…');
    pending = (async () => {
      try {
        const associations = storage.read('sources',{}) || {};
        const saved = associations[snapshot.association];
        let subtitle = null;
        const namedEpisode = typeof saved?.sourceId === 'string' && /(?:^|[. _-])(?:S\d{1,3})?E(?:P(?:ISODE)?)?[. _-]*0*(\d{1,5})(?!\d)/i.exec(saved.sourceId);
        const namedAnime = typeof saved?.sourceId === 'string' && /^Jimaku\.(\d+)\./i.exec(saved.sourceId);
        // Provider caches must pass the companion's structure/hash checks too.
        if (saved?.sourceId && !namedAnime && (!namedEpisode || Number(namedEpisode[1]) === episode)) {
          try { subtitle = await services.savedSubtitles({action:'read',name:saved.sourceId,encoding:'auto'}); }
          catch (_) { /* A removed saved file falls back to the provider. */ }
        }
        if (!current() || controller.view().source !== originalSource) return;
        if (!subtitle) subtitle = await services.discoverSubtitles({mediaId,episode});
        if (!current() || controller.view().source !== originalSource) return;
        if (!subtitle?.content || !subtitle.sourceId) throw new Error('No usable Japanese subtitles found. Load a saved file or retry.');
        const offsetMs = saved?.sourceId === subtitle.sourceId ? saved.offsetMs || 0 : 0;
        await controller.loadSubtitle({...subtitle,offsetMs}, {expectedPlayback:snapshot,expectedSource:originalSource,isCurrent:current});
        if (!current()) return;
        const sources = storage.read('sources',{}) || {};
        sources[snapshot.association] = {sourceId:subtitle.sourceId,offsetMs};
        storage.write('sources',Object.fromEntries(Object.entries(sources).slice(-100)));
        setStatus('ready',subtitle.originalName ? `Loaded automatically from Jimaku: ${subtitle.originalName}. Timing can vary by release.` : 'Loaded the saved Japanese subtitle for this episode.');
      } catch (error) {
        if (current()) setStatus('error',String(error.message || error));
      } finally { if (ticket === sequence) pending = null; }
    })();
    return pending;
  }
  return {update, status:() => ({...feedback}),
    retry() { sequence++; attempted = ''; return update(enabled); },
    cancel() { sequence++; pending = null; setStatus('idle',''); },
  };
}
