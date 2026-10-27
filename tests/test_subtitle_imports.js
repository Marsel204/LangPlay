const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(directory) {
  const sandbox = { readers: [], playbackVersion: 0, currentYouTubeId: null,
    clearWordSelection() {}, showNativeUI() {}, loadLocalVideo() {}, renderTokens() {}, showToast() {},
    FileReader: class {
      constructor() { sandbox.readers.push(this); }
      readAsText() {}
      finish(text) { this.onload({ target: { result: text } }); }
    },
  };
  const element = () => ({ value: 'chosen', textContent: '', addEventListener(_event, callback) { this.change = callback; } });
  for (const name of ['videoInput', 'subInput', 'videoLabel', 'subLabel', 'tokensContainer']) sandbox[name] = element();
  const read = name => fs.readFileSync(path.join(__dirname, `../${directory}/js/${name}.js`), 'utf8');
  const app = read('app');
  vm.runInNewContext(read('subtitles').replace(/^import .*;$/m, '').replace(/export /g, '')
    + '\nglobalThis.api = {setTimeline, getTimeline, isManualCaptionsLoaded, findCueIndexAtTime};\n'
    + app.slice(app.indexOf("  videoInput.addEventListener('change'"), app.indexOf("  youtubeLoadBtn.addEventListener('click'")), sandbox);
  sandbox.pick = name => sandbox.subInput.change({ target: { files: [{ name }] } });
  return sandbox;
}
const srt = text => `1\n00:00:01,000 --> 00:00:03,000\n${text}\n`;
for (const directory of ['static', 'extension']) {
  test(`${directory}: last subtitle pick wins and old reads cannot cross video changes`, () => {
    const f = fixture(directory);
    f.pick('A.srt'); f.pick('B.srt');
    f.readers[1].finish(srt('B')); f.readers[0].finish(srt('A'));
    assert.equal(f.api.getTimeline()[0].text, 'B');
    assert.equal(f.subLabel.textContent, 'B.srt');
    f.pick('old.srt'); f.videoInput.change({ target: { files: [{ name: 'new.webm' }] } });
    f.readers[2].finish(srt('old'));
    assert.equal(f.api.getTimeline().length, 0);
    assert.equal(f.api.isManualCaptionsLoaded(), false);
  });
  test(`${directory}: invalid and failed replacements preserve captions and permit retry`, () => {
    const f = fixture(directory);
    f.pick('good.srt'); f.readers[0].finish(srt('good'));
    f.pick('bad.srt'); f.readers[1].finish('garbage');
    f.pick('failed.srt'); f.readers[2].onerror();
    assert.equal(f.api.getTimeline()[0].text, 'good');
    assert.equal(f.subLabel.textContent, 'good.srt');
    assert.equal(f.subInput.value, '');
    f.pick('good.srt'); f.readers[3].finish(srt('retry'));
    assert.equal(f.api.getTimeline()[0].text, 'retry');
  });
  test(`${directory}: overlapping intervals agree with an exhaustive active-cue oracle`, () => {
    const { api } = fixture(directory);
    const cues = [{ start: 0, end: 100, text: 'long' }, ...Array.from({ length: 80 }, (_, i) => ({ start: i + 10, end: i + 10.25, text: String(i) }))];
    api.setTimeline(cues);
    for (let time = -1; time < 102; time += 0.125) {
      const index = api.findCueIndexAtTime(cues, time);
      const active = cues.some(cue => cue.start <= time && time <= cue.end);
      assert.equal(index >= 0, active, `time=${time}`);
      if (index >= 0) assert.ok(cues[index].start <= time && time <= cues[index].end);
    }
  });
}
