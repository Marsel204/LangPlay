// Run the approved snapshot unchanged, with a portable repository location.
import { fileURLToPath } from 'node:url';
const previous = process.env.LANGPLAY_SOURCE_ROOT;
process.env.LANGPLAY_SOURCE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
try { await import('./proposals/local-meaning-proposal.mjs'); }
finally {
  if (previous === undefined) delete process.env.LANGPLAY_SOURCE_ROOT;
  else process.env.LANGPLAY_SOURCE_ROOT = previous;
}
