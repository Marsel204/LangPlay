import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSubtitles, SubtitleError } from '../src/core/subtitles.js';
import { makeSubtitle, dialogue } from './fixtures.js';

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
