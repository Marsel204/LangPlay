import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = process.env.LANGPLAY_SOURCE_ROOT || fileURLToPath(new URL('../../../', import.meta.url));
const moduleUrl = pathToFileURL(path.join(root, 'integrations/seanime/src/learning-controller.js')).href;
const subtitle = '1\n00:00:01,000 --> 00:00:04,000\n今日は日本語を勉強します。\n';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function fixture(overrides = {}) {
  let implementation;
  try { implementation = await import(moduleUrl); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      assert.fail('The production learning controller is absent; the current integration is only a probe.');
    }
    throw error;
  }
  const calls = [];
  let state = { clientId: 'client-a', playbackId: 'playback-a', videoIdentity: 'media:1:episode:1',
    positionMs: 1500, durationMs: 24000, paused: false, rate: 1, title: 'Generated test anime', episode: '1' };
  const host = {
    snapshot: () => ({ ...state }),
    pause: identity => { calls.push(['pause', identity]); state.paused = true; },
    resume: identity => { calls.push(['resume', identity]); state.paused = false; },
  };
  const services = {
    parse: async () => ({ status: 'success', engine: 'fixture', tokens: [
      { surface: '日本語', start: 3, end: 6, reading: 'ニホンゴ', base_form: '日本語' },
    ] }),
    lookup: async () => ({ meaning: 'Japanese language' }),
    explain: async context => { calls.push(['explain', context]); return { explanation: 'Generated explanation' }; },
    save: async card => { calls.push(['save', card]); return { target: 'local', id: 'card-1' }; },
    ...overrides,
  };
  const controller = implementation.createLearningController({ host, services });
  await controller.refresh();
  await controller.loadSubtitle({ sourceId: 'generated-ja', format: 'srt', content: subtitle, offsetMs: 0 });
  return { controller, calls, setState: next => { state = { ...state, ...next }; } };
}

function selection(controller) {
  const cue = controller.view().activeCues[0];
  assert.ok(cue, 'A matching imported cue must be active at the current playback time');
  return { cueId: cue.id, start: 3, end: 6 };
}

test('Imported Japanese subtitles synchronize without opening learning tools or calling AI', async () => {
  const { controller, calls } = await fixture();
  const view = controller.view();
  assert.equal(view.activeCues[0].text, '今日は日本語を勉強します。');
  assert.equal(view.drawerOpen, false);
  assert.equal(calls.length, 0);
});

test('Word selection pauses the matching player and returns real parser/dictionary context', async () => {
  const { controller, calls } = await fixture();
  await controller.select(selection(controller));
  const view = controller.view();
  assert.equal(calls[0][0], 'pause');
  assert.equal(calls[0][1].clientId, 'client-a');
  assert.equal(calls[0][1].playbackId, 'playback-a');
  assert.equal(view.drawerOpen, true);
  assert.equal(view.selected.surface, '日本語');
  assert.equal(view.selected.sentence, '今日は日本語を勉強します。');
  assert.equal(view.reading, 'ニホンゴ');
  assert.equal(view.meaning, 'Japanese language');
  assert.equal(calls.some(([op]) => op === 'explain'), false);
});

test('Closing the drawer stays paused; only explicit resume continues playback', async () => {
  const { controller, calls } = await fixture();
  await controller.select(selection(controller));
  controller.close();
  assert.equal(controller.view().drawerOpen, false);
  assert.equal(calls.some(([op]) => op === 'resume'), false);
  await controller.resume();
  assert.equal(calls.filter(([op]) => op === 'resume').length, 1);
});

test('Episode changes prevent an old selection from resuming a different playback', async () => {
  const { controller, calls, setState } = await fixture();
  await controller.select(selection(controller));
  setState({ playbackId: 'playback-b', videoIdentity: 'media:1:episode:2' });
  await controller.refresh();
  await assert.rejects(() => controller.resume(), /session|playback|selection|changed/i);
  assert.equal(calls.some(([op]) => op === 'resume'), false);
  assert.equal(controller.view().selected, null);
  assert.deepEqual(controller.view().activeCues, []);
});

test('Late parsing cannot populate the drawer after an episode switch', async () => {
  const pending = deferred();
  const { controller, setState } = await fixture({ parse: () => pending.promise });
  const work = controller.select(selection(controller));
  setState({ playbackId: 'playback-b', videoIdentity: 'media:1:episode:2' });
  await controller.refresh();
  pending.resolve({ status: 'success', tokens: [{ surface: '日本語', start: 3, end: 6, reading: 'OLD' }] });
  await work;
  assert.equal(controller.view().selected, null);
  assert.notEqual(controller.view().reading, 'OLD');
  assert.equal(controller.view().drawerOpen, false);
});

test('Unavailable companion preserves captured text and does not resume playback', async () => {
  const { controller, calls } = await fixture({ parse: async () => { throw new Error('Companion unavailable'); } });
  await controller.select(selection(controller));
  assert.equal(controller.view().selected.surface, '日本語');
  assert.equal(controller.view().drawerOpen, true);
  assert.match(controller.view().error, /unavailable/i);
  assert.equal(calls.some(([op]) => op === 'resume'), false);
});

test('A malformed subtitle replacement preserves the previous working source', async () => {
  const { controller } = await fixture();
  await assert.rejects(() => controller.loadSubtitle({ sourceId: 'bad', format: 'srt', content: '1\ninvalid timing\n壊れた字幕', offsetMs: 0 }));
  assert.equal(controller.view().activeCues[0].text, '今日は日本語を勉強します。');
});

test('Positive subtitle offset delays the learning cue exactly once', async () => {
  const { controller, setState } = await fixture();
  await controller.loadSubtitle({ sourceId: 'delayed', format: 'srt', content: subtitle, offsetMs: 1000 });
  assert.deepEqual(controller.view().activeCues, []);
  setState({ positionMs: 2500 });
  await controller.refresh();
  assert.equal(controller.view().activeCues[0].text, '今日は日本語を勉強します。');
});

test('Explicit explanation and local card save use the frozen word and sentence', async () => {
  const { controller, calls, setState } = await fixture();
  await controller.select(selection(controller));
  setState({ positionMs: 9000 });
  await controller.refresh();
  await controller.explain();
  await controller.save();
  for (const op of ['explain', 'save']) {
    const context = calls.find(([name]) => name === op)?.[1];
    assert.equal(context.surface, '日本語');
    assert.equal(context.sentence, '今日は日本語を勉強します。');
    assert.equal(context.episode, '1');
    assert.equal(context.videoTimeMs, 1500);
  }
});


test('Selected romaji comes from the parser and clears with the old playback', async () => {
  const { controller, setState } = await fixture({ parse: async () => [
    {surface:'日本語',start:3,end:6,reading:'ニホンゴ',romaji:'nihongo',baseForm:'日本語'},
  ] });
  await controller.select(selection(controller));
  assert.equal(controller.view().romaji, 'nihongo');
  setState({playbackId:'new-playback', videoIdentity:'new-episode'});
  await controller.refresh();
  assert.equal(controller.view().romaji, '');
});
