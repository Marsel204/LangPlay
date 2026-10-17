const fields = ['surface', 'reading', 'baseForm', 'meaning', 'sentence', 'title', 'episode', 'videoTimeMs'];
const safeCell = value => {
  const text = String(value ?? '').replace(/[\t\r\n]+/g, ' ');
  return /^[=+@-]/.test(text) ? `'${text}` : text;
};
export function createCards(storage) {
  const stored = storage.read('cards', []);
  let cards = Array.isArray(stored) ? stored.filter(c => c && typeof c.surface === 'string' && typeof c.sentence === 'string').slice(0, 2000) : [];
  return {
    save(context) {
      const duplicate = cards.find(c => c.surface === context.surface && c.sentence === context.sentence && c.title === context.title && c.episode === context.episode);
      if (duplicate) return { target: 'local', id: duplicate.id, duplicate: true };
      if (cards.length >= 2000) throw new Error('Local card limit reached (2000). Export your cards first.');
      const card = { id: `card-${Date.now()}-${cards.length}`, createdAt: new Date().toISOString() };
      for (const field of fields) card[field] = field === 'videoTimeMs' ? Math.round(context[field] || 0) : String(context[field] || '').slice(0, 8192);
      const next = [...cards, card]; storage.write('cards', next); cards = next;
      return { target: 'local', id: card.id };
    },
    list: () => cards.map(c => ({ ...c })),
    tsv: () => [fields.join('\t'), ...cards.map(card => fields.map(field => safeCell(card[field])).join('\t'))].join('\n'),
  };
}
