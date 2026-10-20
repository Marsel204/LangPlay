import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswer, renderAnswer } from '../src/answer.js';
const flatten = nodes => nodes.flatMap(n => [n, ...flatten(n.children)]);
const text = nodes => flatten(nodes).map(n => n.text).join('');

test('a tutor answer becomes semantic emphasis, quotes, and lists with contextual detail first', () => {
  const source = `**消す** means *to erase*.\n\n---\n\n### In This Context\n> **俗世の痛みを消す**\n> Zokuse no itami o kesu\n\n* **痛みを消す** means relieve pain.\n* Uses the pattern **dictionary form + ことができる**.\n\n### Key Grammar Points\n* **Verb class:** Godan, ending in *su*.\n\n### Examples\n1. 電気を消す — turn off the light.`;
  const result = parseAnswer(source), all = flatten(result);
  assert.deepEqual(result.map(n => n.tag), ['p', 'details', 'details', 'details']);
  assert.deepEqual(result[1].attrs, {open:''});
  assert.deepEqual(result[2].attrs, {});
  assert.ok(all.some(n => n.tag === 'strong'));
  assert.ok(all.some(n => n.tag === 'blockquote'));
  assert.ok(all.some(n => n.tag === 'ol'));
  assert.match(text(result), /dictionary form \+ ことができる/);
  assert.doesNotMatch(text(result), /\*\*|###|---/);
});

test('provider HTML and dangerous URLs never become executable elements', () => {
  const result = parseAnswer('<img src=x onerror=alert(1)>\n\n[click](javascript:evil)\n\n`<script>alert(1)</script>`');
  const all = flatten(result);
  assert.equal(all.some(n => ['img','script','a'].includes(n.tag)), false);
  assert.match(text(result), /<img src=x onerror=alert\(1\)>/);
  assert.match(text(result), /<script>alert\(1\)<\/script>/);
});

test('tables, code fences, wrapped lines, and ordered list numbers retain their content', () => {
  const result = parseAnswer('A wrapped\nparagraph.\n\n| Form | Meaning |\n| --- | --- |\n| 消す | erase |\n\n```\n<sample>\n```\n\n3. First\n4. Second');
  const all = flatten(result);
  assert.equal(result[0].children[0].text, 'A wrapped paragraph.');
  assert.ok(all.some(n=>n.tag === 'table'));
  assert.ok(all.some(n=>n.tag === 'code' && n.text === '<sample>'));
  assert.deepEqual(all.find(n=>n.tag==='ol').attrs,{start:'3'});
});

test('unchanged replies keep their DOM and disclosure state when playback updates', () => {
  const node = tag => ({ tag, children:[], attributes:{}, setAttribute(k,v){this.attributes[k]=v;}, append(n){this.children.push(n);}, replaceChildren(...nodes){this.children=nodes;} });
  const previous = globalThis.document;
  globalThis.document = {createElement:node};
  try {
    const root = node('div');
    renderAnswer(root, 'Answer.\n\n### Grammar\nDetails.');
    const first = root.children[1]; first.attributes.open = false;
    renderAnswer(root, 'Answer.\n\n### Grammar\nDetails.');
    assert.equal(root.children[1],first);
    renderAnswer(root,''); assert.equal(root.hidden,true); assert.equal(root.children.length,0);
  } finally { globalThis.document = previous; }
});

test('examples and grammar stay collapsed when a direct answer is already present',()=>{
  const result=parseAnswer('It means to relieve pain.\n\n### Example\n痛みを消す\n\n### Grammar\nA transitive verb.');
  assert.deepEqual(result.filter(n=>n.tag==='details').map(n=>n.attrs),[{},{}]);
});
