import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost } from '../src/host.js';
import { validateMessage } from '../src/bridge.js';

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
