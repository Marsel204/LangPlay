// Redistribution-safe generated corpus. Every sentence/track here is test data.
export function makeSubtitle(format, cues, { bom = false, crlf = false } = {}) {
  const stamp = (ms, ass = false) => {
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    const pad = n => String(n).padStart(2, '0');
    const tail = ass ? String(Math.floor(ms % 1000 / 10)).padStart(2, '0') : String(ms % 1000).padStart(3, '0');
    return `${ass ? h : pad(h)}:${pad(m)}:${pad(s)}${format === 'srt' ? ',' : '.'}${tail}`;
  };
  let text;
  if (format === 'ass' || format === 'ssa') {
    text = '[Script Info]\nTitle: Generated corpus\nScriptType: v4.00+\n\n[Events]\n' +
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' +
      cues.map(cue => `Dialogue: ${cue.layer || 0},${stamp(cue.startMs, true)},${stamp(cue.endMs, true)},${cue.style || 'Default'},,0,0,0,,${cue.text}`).join('\n');
  } else {
    text = (format === 'vtt' ? 'WEBVTT\n\n' : '') + cues.map((cue, i) =>
      `${cue.identifier ?? i + 1}\n${stamp(cue.startMs)} --> ${stamp(cue.endMs)}${cue.settings ? ' ' + cue.settings : ''}\n${cue.text}`).join('\n\n');
  }
  return (bom ? '\uFEFF' : '') + (crlf ? text.replaceAll('\n', '\r\n') : text);
}

export const dialogue = [
  { startMs: 10000, endMs: 12500, text: '今日は\n来ない。' },
  { startMs: 13000, endMs: 14000, text: '猫と𠮷野 🐈' },
];
