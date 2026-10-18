const operations = new Set(['refresh', 'import', 'saved-list', 'saved-import', 'saved-open', 'offset', 'select', 'close', 'resume', 'explain', 'chat', 'save', 'export', 'preferences', 'auto-retry', 'hide']);
export function validateMessage(value) {
  if (!value || value.v !== 1 || !Number.isSafeInteger(value.id) || value.id < 0 || !operations.has(value.op)) throw new Error('Invalid LangPlay message.');
  const d = value.data || {};
  if (value.op === 'saved-import' && (typeof d.name !== 'string' || !d.name.length || d.name.length > 256 || /[/\\\x00]/.test(d.name) ||
      !/\.(srt|vtt|ass|ssa)$/i.test(d.name) || !['auto', 'shift_jis'].includes(d.encoding) || !Number.isSafeInteger(d.offsetMs) || Math.abs(d.offsetMs) > 3600000)) throw new Error('Choose a saved subtitle and a valid encoding and delay.');
  if (value.op === 'import' && (typeof d.content !== 'string' || !d.content.length || d.content.length > 10 * 1024 * 1024 ||
      typeof d.sourceId !== 'string' || !d.sourceId.length || d.sourceId.length > 256 || !['srt', 'vtt', 'ass', 'ssa'].includes(d.format) ||
      !Number.isSafeInteger(d.offsetMs || 0))) throw new Error('Choose an SRT, VTT, ASS or SSA subtitle up to 10 MiB.');
  if (value.op === 'select' && (typeof d.cueId !== 'string' || d.cueId.length > 512 || !Number.isInteger(d.start) ||
      !Number.isInteger(d.end) || d.start < 0 || d.end <= d.start || d.end > 4096)) throw new Error('Invalid word selection.');
  if (value.op === 'offset' && (!Number.isSafeInteger(d.offsetMs) || Math.abs(d.offsetMs) > 3600000)) throw new Error('Offset must be within one hour.');
  if (value.op === 'chat' && (typeof d.question !== 'string' || !d.question.trim() || d.question.length > 2000)) throw new Error('Ask a question of up to 2000 characters.');
  if (value.op === 'preferences' && (d.readingMode === undefined && d.autoSubtitles === undefined || d.readingMode !== undefined && !['plain', 'furigana', 'romaji'].includes(d.readingMode) || d.autoSubtitles !== undefined && typeof d.autoSubtitles !== 'boolean')) throw new Error('Invalid subtitle preferences.');
  return { v: 1, id: value.id, op: value.op, data: d };
}
