export const compareCues = (a, b) => a.startMs - b.startMs || (a.layer || 0) - (b.layer || 0) || a.sourceIndex - b.sourceIndex;

// Balanced interval tree prunes expired subtrees instead of scanning a whole
// episode on every status update. All times here are SOURCE milliseconds.
export function createCueIndex(cues) {
  const ordered = cues.map(cue => {
    if (!Number.isSafeInteger(cue.startMs) || !Number.isSafeInteger(cue.endMs) || cue.startMs < 0 || cue.endMs <= cue.startMs) {
      throw new RangeError('Cue intervals require nonnegative integer milliseconds and end > start.');
    }
    return Object.freeze({ ...cue });
  }).sort(compareCues);
  function build(start, end) {
    if (start >= end) return null;
    const middle = Math.floor((start + end) / 2);
    const left = build(start, middle), right = build(middle + 1, end);
    return { cue: ordered[middle], left, right,
      maxEnd: Math.max(ordered[middle].endMs, left ? left.maxEnd : 0, right ? right.maxEnd : 0) };
  }
  const tree = build(0, ordered.length);
  function at(sourceMs, { styles } = {}) {
    if (!Number.isFinite(sourceMs)) throw new RangeError('Source time must be finite.');
    const selected = styles === undefined ? null : new Set(styles);
    const result = [];
    function visit(node) {
      if (!node || node.maxEnd <= sourceMs) return;
      visit(node.left);
      if (node.cue.startMs > sourceMs) return;
      if (sourceMs < node.cue.endMs && (!selected || selected.has(node.cue.style))) result.push(node.cue);
      visit(node.right);
    }
    visit(tree);
    return result;
  }
  return Object.freeze({ cues: Object.freeze(ordered), at });
}
