import test from 'node:test';
import assert from 'node:assert/strict';
import { createLearningSession } from '../src/core/session.js';
import { parseSubtitles } from '../src/core/subtitles.js';
import { createCueIndex, activeAtVideoTime, cueVideoTime } from '../src/core/cues.js';
import { makeSubtitle } from './fixtures.js';

const episode = n => ({ clientId: 'desktop:linux', playbackId: `play:${n}`, videoIdentity: `sha256:release:${n}` });
function setup() {
  let time = 0;
  const session = createLearningSession({ now: () => time });
  session.setPlayback(episode(1));
  const parsed = parseSubtitles(makeSubtitle('ass', [
    { startMs: 10000, endMs: 12000, text: '🐈は来ない。', style: 'Dialogue' },
    { startMs: 11000, endMs: 13000, text: '駅', style: 'Sign', layer: 2 },
  ]), { format: 'ass', sourceId: 'subtitle:one' });
  session.setSource(parsed);
  session.update({ positionMs: 10000, paused: false });
  return { session, parsed, advance(ms) { time += ms; } };
}

test('Positive 500 ms offset delays both active and clickable cue times exactly once', () => {
  const { session } = setup();
  session.setOffset(500);
  session.update({ positionMs: 10499, paused: true });
  assert.equal(session.active().length, 0);
  session.update({ positionMs: 10500, paused: true });
  const cue = session.active()[0];
  const context = session.select({ cueId: cue.id, start: 3, end: 6 });
  assert.equal(context.surface, '来ない');
  assert.equal(context.cueVideoStartMs, 10500);
  assert.equal(context.offsetMs, 500);
  session.update({ positionMs: 12499, paused: true });
  assert.equal(session.active().length, 2);
  session.update({ positionMs: 12500, paused: true });
  assert.deepEqual(session.active().map(c => c.text), ['駅']);
  assert.equal(cueVideoTime(10000, -500), 9500);
});

test('Clock follows rate/pause/seek and bounds extrapolation during missing host updates', () => {
  const { session, advance } = setup();
  advance(250); assert.equal(session.position(), 10250);
  session.update({ positionMs: 10250, paused: false, rate: 2 });
  advance(250); assert.equal(session.position(), 10750);
  session.update({ positionMs: 10750, paused: true, rate: 2 });
  advance(5000); assert.equal(session.position(), 10750);
  session.update({ positionMs: 4000, paused: false, rate: 1 }, { discontinuity: true });
  advance(5000); assert.equal(session.position(), 5000);
  session.update({ positionMs: 11900, paused: false, durationMs: 12000 });
  advance(500); assert.equal(session.position(), 12000);
});

test('Clicked context is immutable UTF-16 text and survives pause acknowledgement and subsequent clock ticks', () => {
  const { session, parsed, advance } = setup();
  const context = session.select({ cueId: parsed.cues[0].id, start: 3, end: 6, title: '日本語の作品', episode: 'S1' });
  const pending = session.token();
  session.update({ positionMs: 10100, paused: true });
  assert.equal(session.isCurrent(pending), true, 'Pause acknowledgement must not cancel the clicked lookup');
  session.update({ positionMs: 11000, paused: false, rate: 1.5 });
  advance(1000);
  assert.equal(context.sentence, '🐈は来ない。');
  assert.equal(context.videoTimeMs, 10000);
  assert.equal(context.episode, 'S1');
  assert.equal(session.selected(), context);
  assert.ok(Object.isFrozen(context) && Object.isFrozen(context.span) && Object.isFrozen(context.cueIds));
  assert.throws(() => { context.span.start = 0; }, TypeError);
  parsed.cues[0].text = 'replacement';
  assert.equal(context.sentence, '🐈は来ない。');
});

test('Invalid UTF-16 spans cannot split supplementary characters or refer beyond a cue', () => {
  const { session, parsed } = setup();
  const cueId = parsed.cues[0].id;
  for (const [start, end] of [[0, 1], [1, 2], [-1, 2], [0, 100], [2, 2], [0.5, 2]]) {
    assert.throws(() => session.select({ cueId, start, end }), /UTF-16/);
  }
  assert.equal(session.select({ cueId, start: 0, end: 2 }).surface, '🐈');
});

test('New word, seek, source, offset and playback generation reject obsolete async replies', async () => {
  for (const action of ['word', 'seek', 'source', 'offset', 'episode', 'client', 'release', 'close']) {
    const { session, parsed } = setup();
    session.select({ cueId: parsed.cues[0].id, start: 3, end: 6 });
    const pending = session.token();
    let resolve;
    const response = new Promise(done => { resolve = done; });
    const applied = response.then(() => session.isCurrent(pending));
    if (action === 'word') session.select({ cueId: parsed.cues[1].id, start: 0, end: 1 });
    if (action === 'seek') session.update({ positionMs: 2000, paused: true }, { discontinuity: true });
    if (action === 'source') session.setSource({ ...parsed, sourceId: 'subtitle:replacement' });
    if (action === 'offset') session.setOffset(100);
    if (action === 'episode') session.setPlayback(episode(2));
    if (action === 'client') session.setPlayback({ ...episode(1), clientId: 'other-client' });
    if (action === 'release') session.setPlayback({ ...episode(1), videoIdentity: 'sha256:other-release' });
    if (action === 'close') session.close();
    resolve(); assert.equal(await applied, false, action);
  }
});

test('Switching playback clears source, time and selection; same identity preserves them', () => {
  const { session } = setup();
  const old = session.token();
  session.setPlayback({ ...episode(1) });
  assert.equal(session.isCurrent(old), true);
  assert.equal(session.active().length, 1);
  session.setPlayback(episode(2));
  assert.equal(session.position(), null);
  assert.deepEqual(session.active(), []);
  assert.equal(session.selected(), null);
});

test('Failed source replacement is atomic; duplicate cue IDs and invalid inputs fail explicitly', () => {
  const { session, parsed } = setup();
  const pending = session.token();
  assert.throws(() => session.setSource({ sourceId: 'broken', cues: [{ ...parsed.cues[0], endMs: 0 }] }));
  assert.equal(session.isCurrent(pending), true);
  assert.equal(session.active()[0].text, '🐈は来ない。');
  assert.throws(() => createCueIndex([parsed.cues[0], parsed.cues[0]]), /unique/);
  assert.throws(() => session.setOffset(0.5), RangeError);
  assert.throws(() => session.update({ positionMs: NaN, paused: false }), RangeError);
  assert.throws(() => activeAtVideoTime(createCueIndex([]), Infinity), RangeError);
  assert.throws(() => session.setPlayback({ clientId: 'x' }), TypeError);
  session.close();
  assert.throws(() => session.token(), /active playback/);
});

test('Dialogue style filter preserves selectable overlapping cues without mutating source times', () => {
  const { session, parsed } = setup();
  session.update({ positionMs: 11000, paused: true });
  assert.equal(session.active().length, 2);
  assert.deepEqual(session.active({ styles: ['Dialogue'] }).map(c => c.text), ['🐈は来ない。']);
  session.setOffset(-500);
  assert.equal(parsed.cues[0].startMs, 10000);
  assert.equal(session.active().length, 2);
});
