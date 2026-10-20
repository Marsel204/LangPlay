// A deliberately small Markdown reader. AI text only becomes text nodes and
// known formatting elements; raw HTML, images and executable links stay inert.
const node = (tag, children = [], text = '', attrs = {}) => ({ tag, children, text, attrs });
export function inlineAnswer(text) {
  const result = [], pattern = /(`[^`\n]+`|\*\*[^\n]+?\*\*|__[^\n]+?__|\*[^*\n]+?\*|_[^_\n]+?_|\[[^\]\n]+\]\([^\s)]+\))/g;
  let offset = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > offset) result.push(node('span', [], text.slice(offset, match.index)));
    const value = match[0];
    if (value.startsWith('`')) result.push(node('code', [], value.slice(1, -1)));
    else if (value.startsWith('**') || value.startsWith('__')) result.push(node('strong', inlineAnswer(value.slice(2, -2))));
    else if (value.startsWith('[')) result.push(node('span', [], value.slice(1, value.indexOf(']'))));
    else result.push(node('em', [], value.slice(1, -1)));
    offset = match.index + value.length;
  }
  if (offset < text.length) result.push(node('span', [], text.slice(offset)));
  return result;
}
const heading = line => /^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
const bullet = line => /^\s*(?:[-+*]|\d+[.)])\s+(.+)$/.exec(line);
const ordered = line => /^\s*\d+[.)]\s+/.test(line);
const rule = line => /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(value => value.trim());
const tableRule = line => line.includes('|') && cells(line).every(value => /^:?-{3,}:?$/.test(value));
function blocks(lines) {
  const result = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim() || rule(line)) { i++; continue; }
    if (/^\s*```/.test(line)) {
      const code = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      result.push(node('pre', [node('code', [], code.join('\n'))])); continue;
    }
    if (i + 1 < lines.length && line.includes('|') && tableRule(lines[i + 1])) {
      const rows = [node('tr', cells(line).map(value => node('th', inlineAnswer(value))))]; i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(node('tr', cells(lines[i++]).map(value => node('td', inlineAnswer(value)))));
      }
      result.push(node('div', [node('table', [node('tbody', rows)])], '', { 'data-answer-table': '' })); continue;
    }
    if (bullet(line)) {
      const tag = ordered(line) ? 'ol' : 'ul', items = [];
      const attrs = tag === 'ol' ? { start: line.trim().match(/^\d+/)[0] } : {};
      while (i < lines.length && bullet(lines[i]) && ordered(lines[i]) === (tag === 'ol')) {
        let content = bullet(lines[i++])[1];
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !bullet(lines[i])) content += ' ' + lines[i++].trim();
        items.push(node('li', inlineAnswer(content)));
        if (i + 1 < lines.length && !lines[i].trim() && bullet(lines[i + 1]) && ordered(lines[i + 1]) === (tag === 'ol')) i++;
      }
      result.push(node(tag, items, '', attrs)); continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      result.push(node('blockquote', blocks(quote.reduce((lines, line) => lines.concat(line, ''), [])))); continue;
    }
    const title = heading(line);
    if (title) { result.push(node('h4', inlineAnswer(title[1]))); i++; continue; }
    const paragraph = [line.trim()]; i++;
    while (i < lines.length && lines[i].trim() && !heading(lines[i]) && !bullet(lines[i]) && !rule(lines[i]) && !/^\s*(>|```)/.test(lines[i]) && !(lines[i].includes('|') && tableRule(lines[i + 1] || ''))) paragraph.push(lines[i++].trim());
    result.push(node('p', inlineAnswer(paragraph.join(' '))));
  }
  return result;
}
export function parseAnswer(value) {
  const parsed = blocks(String(value || '').replace(/\r\n?/g, '\n').split('\n'));
  // Keep the first explanation in view. Further named sections are available
  // on demand, without clipping or discarding any of the provider's answer.
  const result = [];
  let section = null;
  for (const item of parsed) {
    if (item.tag === 'h4') {
      section = node('details', [node('summary', item.children)], '', !section && (!result.length || /context|this sentence|meaning/i.test(item.children.map(n => n.text).join(''))) ? { open: '' } : {});
      result.push(section);
    } else (section ? section.children : result).push(item);
  }
  return result;
}

// Used by the browser panel. The player uses the same tree with Seanime's DOM bridge.
const renderedAnswers = new WeakMap();
export function renderAnswer(element, value) {
  const text = String(value || '');
  if (renderedAnswers.get(element) === text) return;
  renderedAnswers.set(element, text);
  element.setAttribute('data-answer', '');
  const create = item => {
    const el = document.createElement(item.tag);
    for (const [key, value] of Object.entries(item.attrs)) el.setAttribute(key, value);
    if (item.text) el.textContent = item.text;
    for (const child of item.children) el.append(create(child));
    return el;
  };
  element.replaceChildren(...parseAnswer(text).map(create));
  element.hidden = !text;
}
