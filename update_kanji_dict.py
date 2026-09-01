import json, re

with open('extension/js/kanji-dict.js', 'r', encoding='utf-8') as f:
    dict_content = f.read()

# Replace resolveToHiragana in kanji-dict.js
new_resolve_code = """
/**
 * Resolves any Japanese word or phrase into pure Hiragana reading.
 * Uses Kun'yomi for standalone kanji & okurigana verb stems, and On'yomi for multi-kanji Jukugo compounds.
 */
export function resolveToHiragana(word) {
  if (!word || !word.trim()) return '';
  const w = word.trim();
  if (SPECIAL_WORDS[w]) return SPECIAL_WORDS[w];

  // 1. Single standalone Kanji: Use Kun'yomi (natural reading / verb stem) or fallback to On'yomi
  if (w.length === 1 && w >= '\\u4e00' && w <= '\\u9faf') {
    const info = KANJI_DB[w];
    if (info) {
      const [ons, kuns] = info;
      if (kuns && kuns.length > 0) {
        return kuns[0].split('.')[0];
      } else if (ons && ons.length > 0) {
        return ons[0];
      }
    }
    return w;
  }

  let res = '';
  let i = 0;
  while (i < w.length) {
    const ch = w[i];
    if (ch >= '\\u4e00' && ch <= '\\u9faf') {
      const info = KANJI_DB[ch];
      if (!info) {
        res += ch;
        i++;
        continue;
      }
      const [ons, kuns] = info;

      // Lookahead: is following character Hiragana (okurigana)?
      if (i + 1 < w.length && (w[i + 1] >= '\\u3040' && w[i + 1] <= '\\u309f')) {
        let matchedKun = null;
        if (kuns && kuns.length > 0) {
          for (let k = 0; k < kuns.length; k++) {
            const rawKun = kuns[k];
            if (rawKun.includes('.')) {
              const parts = rawKun.split('.');
              const stem = parts[0];
              const okuri = parts[1];
              const rest = w.slice(i + 1);
              if (rest.startsWith(okuri) || rest[0] === okuri[0]) {
                matchedKun = stem;
                break;
              }
            } else {
              matchedKun = rawKun;
              break;
            }
          }
        }
        if (matchedKun) {
          res += matchedKun;
        } else if (kuns && kuns.length > 0) {
          res += kuns[0].split('.')[0];
        } else if (ons && ons.length > 0) {
          res += ons[0];
        }
      } else {
        // Part of Jukugo (multi-kanji compound) -> use On'yomi
        if (ons && ons.length > 0) {
          res += ons[0];
        } else if (kuns && kuns.length > 0) {
          res += kuns[0].split('.')[0];
        }
      }
    } else {
      res += ch;
    }
    i++;
  }

  // Final sanitizer pass: if any rare kanji remain, replace from KANJI_DB
  let sanitized = '';
  for (let j = 0; j < res.length; j++) {
    const c = res[j];
    if (c >= '\\u4e00' && c <= '\\u9faf') {
      const fallback = KANJI_DB[c];
      sanitized += (fallback && fallback[1] && fallback[1][0]?.split('.')[0]) || (fallback && fallback[0] && fallback[0][0]) || '';
    } else {
      sanitized += c;
    }
  }

  return sanitized;
}
"""

m_start = dict_content.find('export function resolveToHiragana')
if m_start != -1:
    m_end = dict_content.find('export function getWordReading')
    dict_content = dict_content[:m_start] + new_resolve_code + '\n' + dict_content[m_end:]

with open('extension/js/kanji-dict.js', 'w', encoding='utf-8') as f:
    f.write(dict_content)

print('Updated extension/js/kanji-dict.js successfully!')
