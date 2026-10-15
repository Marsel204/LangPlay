import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSubtitles, SubtitleError } from '../src/core/subtitles.js';
import { makeSubtitle, dialogue } from './fixtures.js';
import { createCueIndex } from '../src/core/cues.js';

for (const format of ['srt', 'vtt']) {
  test(`${format}: millisecond cues preserve Unicode, line breaks and original bytes as text`, () => {
    const original = makeSubtitle(format, dialogue, { bom: true, crlf: true });
    const parsed = parseSubtitles(original, { format });
    assert.equal(parsed.original, original);
    assert.deepEqual(parsed.cues.map(({ startMs, endMs, text }) => ({ startMs, endMs, text })), dialogue);
    assert.deepEqual(parsed.cues.map(c => c.id), parseSubtitles(original, { format }).cues.map(c => c.id));
    assert.notEqual(parsed.cues[0].id, parsed.cues[1].id);
  });
  test(`${format}: boundary times, stable ordering and source-scoped IDs`, () => {
    const original = makeSubtitle(format, [
      { startMs: 3600000, endMs: 3600001, text: '一時間' },
      { startMs: 0, endMs: 1, text: '最初' },
      { startMs: 0, endMs: 100, text: '同時' },
    ]);
    const cues = parseSubtitles(original, { format, sourceId: 'release:a' }).cues;
    assert.deepEqual(cues.map(c => c.text), ['最初', '同時', '一時間']);
    assert.equal(cues[0].id, 'release:a:1');
    assert.equal(cues[2].endMs, 3600001);
    assert.notEqual(cues[0].id, parseSubtitles(original, { format, sourceId: 'release:b' }).cues[0].id);
  });
  test(`${format}: empty cue text is excluded, long lines are not truncated`, () => {
    const text = '日本語'.repeat(10000);
    const cues = parseSubtitles(makeSubtitle(format, [
      { startMs: 0, endMs: 100, text: '' }, { startMs: 100, endMs: 200, text },
    ]), { format }).cues;
    assert.equal(cues.length, 1);
    assert.equal(cues[0].text, text);
  });
  test(`${format}: rejects malformed timing instead of partially replacing a source`, () => {
    const valid = makeSubtitle(format, dialogue);
    for (const broken of ['', '\0', 'not subtitles', valid.replace('-->', '->'), valid.replace('00:10', '00:70'),
      makeSubtitle(format, [{ startMs: 1000, endMs: 1000, text: '無効' }])]) {
      assert.throws(() => parseSubtitles(broken, { format }), SubtitleError);
    }
  });
}

test('WebVTT metadata, cue settings, ruby and comments remain separate from lookup text', () => {
  const original = 'WEBVTT title\nKind: captions\n\nNOTE ignored\nnot a cue\n\nSTYLE\n::cue {color:red}\n\n' +
    'id-日本語\n00:01.000 --> 00:02.000 align:start line:90%\n<v 太郎><ruby>猫<rt>ねこ</rt></ruby></v> &amp; &#x1f408;';
  const cue = parseSubtitles(original, { format: 'vtt' }).cues[0];
  assert.equal(cue.text, '猫 & 🐈');
  assert.equal(cue.identifier, 'id-日本語');
  assert.equal(cue.settings, 'align:start line:90%');
  assert.throws(() => parseSubtitles('WEBVTT\n00:01.000 --> 00:02.000\n猫', { format: 'vtt' }), /header/);
});

test('SRT formatting is plain learning text; escaped literal markup is not executed', () => {
  const cue = parseSubtitles(makeSubtitle('srt', [{ startMs: 0, endMs: 1000,
    text: '<i>来ない</i><br>前 &lt;b&gt; &quot;猫&quot;' }]), { format: 'srt' }).cues[0];
  assert.equal(cue.text, '来ない\n前 <b> "猫"');
});

test('Unsupported format produces an actionable typed error', () => {
  assert.throws(() => parseSubtitles('image', { format: 'pgs' }), { code: 'UNSUPPORTED_FORMAT' });
});

for (const format of ['ass', 'ssa']) {
  test(`${format}: removes overrides/drawings and preserves metadata, commas and line breaks`, () => {
    let original = makeSubtitle(format, [
      { startMs: 0, endMs: 2000, text: '{\\k20}今日{\\i1}は{\\i0}、猫\\N来ない。', style: 'Dialogue' },
      { startMs: 1000, endMs: 3000, text: '{\\pos(30,20)}駅, station', style: 'Sign', layer: 2 },
      { startMs: 2000, endMs: 2500, text: '{\\p1}m 0 0 l 100 100{\\p0}読む' },
      { startMs: 3000, endMs: 3500, text: '{\\p1}m 0 0 l 100 100' },
    ], { bom: true, crlf: true });
    if (format === 'ssa') original = original.replace('Format: Layer,', 'Format: Marked,').replaceAll('Dialogue: 0,', 'Dialogue: Marked=0,');
    const parsed = parseSubtitles(original, { format });
    assert.equal(parsed.original, original);
    assert.equal(parsed.metadata.scriptInfo.Title, 'Generated corpus');
    assert.deepEqual(parsed.cues.map(c => c.text), ['今日は、猫\n来ない。', '駅, station', '読む']);
    assert.equal(parsed.cues[0].style, 'Dialogue');
    assert.equal(parsed.cues[1].layer, 2);
    assert.ok(parsed.cues[0].rawText.includes('\\k20'));
    const index = createCueIndex(parsed.cues);
    assert.deepEqual(index.at(1500).map(c => c.text), ['今日は、猫\n来ない。', '駅, station']);
    assert.deepEqual(index.at(1500, { styles: ['Dialogue'] }).map(c => c.text), ['今日は、猫\n来ない。']);
    assert.equal(index.at(3500).length, 0, 'Cue end is exclusive');
  });
}

test('ASS honors event field order, actor/effect/styles and centisecond precision', () => {
  const original = '[V4+ Styles]\nFormat: Name,Fontname\nStyle: Talk,Noto Sans\n[Events]\n' +
    'Format: Start, End, Layer, Style, Actor, Effect, Text\n' +
    'Comment: 0:00:00.00,0:00:01.00,0,Talk,,,ignored\n' +
    'Dialogue: 0:00:00.01,0:00:01.99,3,Talk,太郎,Banner,猫\\hです';
  const parsed = parseSubtitles(original, { format: 'ass' });
  assert.equal(parsed.cues[0].startMs, 10);
  assert.equal(parsed.cues[0].endMs, 1990);
  assert.equal(parsed.cues[0].speaker, '太郎');
  assert.equal(parsed.cues[0].effect, 'Banner');
  assert.equal(parsed.cues[0].text, '猫\u00a0です');
  assert.deepEqual(parsed.metadata.styleDefinitions, ['Talk,Noto Sans']);
});

test('ASS rejects missing event format, truncated columns, bad times/layers and bitmap formats', () => {
  const valid = makeSubtitle('ass', [{ startMs: 0, endMs: 1000, text: '猫' }]);
  for (const broken of [valid.replace(/^Format:.*\n/m, ''), valid.replace('0:00:01.00', '0:00:61.00'),
    valid.replace('Dialogue: 0,', 'Dialogue: NaN,'), valid.replace('0,0,0,,猫', '猫'),
    valid.replace('Effect, Text', 'Text, Effect')]) {
    assert.throws(() => parseSubtitles(broken, { format: 'ass' }), SubtitleError);
  }
});

test('Interval queries match a reference scan with long dialogue/sign overlaps and duplicate starts', () => {
  const cues = Array.from({ length: 5000 }, (_, i) => ({ id: `cue:${i}`, sourceIndex: i,
    startMs: Math.floor(i / 3) * 100, endMs: Math.floor(i / 3) * 100 + (i % 29 === 0 ? 20000 : 50), layer: i % 3 }));
  const index = createCueIndex(cues.reverse());
  for (let ms = -1; ms < 180000; ms += 997) {
    assert.deepEqual(index.at(ms).map(c => c.id), index.cues.filter(c => c.startMs <= ms && ms < c.endMs).map(c => c.id));
  }
  assert.deepEqual(createCueIndex([]).at(0), []);
  assert.throws(() => index.at(NaN), RangeError);
  assert.throws(() => createCueIndex([{ startMs: -1, endMs: 10 }]), RangeError);
});
