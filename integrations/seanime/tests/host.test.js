import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost } from '../src/host.js';
import { validateMessage } from '../src/bridge.js';
import { createLearningController } from '../src/learning-controller.js';

test('Host converts seconds, withholds URLs, and rechecks playback before control', () => {
  let id = 'http://signed.example/movie?secret=private', pauses = 0;
  const core = { getCurrentClientId: () => 'a', getCurrentPlayerType: () => 'web',
    getCurrentPlaybackInfo: () => ({ id, media: { id: 10, title: { romaji: 'Test' } }, episode: { episodeNumber: 2 } }),
    getPlaybackStatus: () => ({ id, clientId: 'a', currentTime: 1.25, duration: 20, paused: false }),
    pause() { pauses++; }, resume() {} };
  const host = createHost(core), state = host.snapshot();
  assert.equal(state.positionMs, 1250); assert.equal(state.episode, '2');
  assert.equal(JSON.stringify(state).includes('private'), false);
  host.pause(state); assert.equal(pauses, 1);
  id = 'other'; assert.throws(() => host.pause(state), /changed/); assert.equal(pauses, 1);
  core.getCurrentPlayerType = () => 'mpv'; assert.equal(host.snapshot(), null);
});
test('Bridge rejects unknown operations and unbounded or malformed imports', () => {
  const message = (op, data) => ({ v: 1, id: 1, op, data });
  assert.equal(validateMessage(message('refresh', {})).op, 'refresh');
  assert.throws(() => validateMessage(message('fetch', { url: 'evil' })));
  assert.throws(() => validateMessage(message('import', { sourceId: 'x', format: 'srt', content: 'x'.repeat(10 * 1024 * 1024 + 1) })));
  assert.throws(() => validateMessage(message('select', { cueId: 'x', start: -1, end: 2 })));
  assert.throws(() => validateMessage({ v: 2, id: 1, op: 'refresh' }));
});
test('Host normalizes boxed Go title values before capturing a selection', () => {
  const core = { getCurrentClientId: () => 'a', getCurrentPlayerType: () => 'web',
    getCurrentPlaybackInfo: () => ({ id: 'b', media: { title: { romaji: new String('Japanese title') } } }),
    getPlaybackStatus: () => ({ id: 'b', clientId: 'a', currentTime: 1, duration: 30, paused: true }) };
  assert.equal(createHost(core).snapshot().title, 'Japanese title');
});

test('automatic discovery gets a numeric anime ID and episode changes invalidate a reused stream ID',()=>{
 let episode=1;
 const core={getCurrentClientId:()=> 'a',getCurrentPlayerType:()=> 'web',getCurrentPlaybackInfo:()=>({id:'same-stream',media:{id:189046},episode:{episodeNumber:episode}}),getPlaybackStatus:()=>({id:'same-stream',clientId:'a',currentTime:0,paused:true})};
 const host=createHost(core),first=host.snapshot();assert.equal(first.mediaId,189046);
 episode=2;assert.notEqual(host.snapshot().videoIdentity,first.videoIdentity);
});

test('unknown host duration preserves authoritative playback time and active subtitles', async () => {
  let duration;
  const core = {
    getCurrentClientId: () => 'client', getCurrentPlayerType: () => 'web',
    getCurrentPlaybackInfo: () => ({ id: 'stream' }),
    getPlaybackStatus: () => ({ id: 'stream', clientId: 'client', currentTime: 1.5, paused: false, duration }),
  };
  const host = createHost(core);
  const controller = createLearningController({ host, services: {} });
  await controller.refresh();
  await controller.loadSubtitle({ sourceId: 'sample', format: 'srt', content: '1\n00:00:01,000 --> 00:00:04,000\n日本語\n' });
  for (duration of [undefined, null, 0, -1, NaN, Infinity, 'unknown']) {
    await controller.refresh();
    assert.equal(controller.view().positionMs, 1500, `Unknown duration: ${duration}`);
    assert.equal(controller.view().activeCues[0]?.text, '日本語');
  }
  duration = 20;
  assert.equal(host.snapshot().durationMs, 20000);
});
