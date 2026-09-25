import json, re

with open('extension/js/kanji-dict.js', 'r', encoding='utf-8') as f:
    dict_content = f.read()

expanded_special_words = {
    "私": "わたし",
    "俺": "おれ",
    "僕": "ぼく",
    "君": "きみ",
    "あなた": "あなた",
    "誰": "だれ",
    "彼": "かれ",
    "彼女": "かのじょ",
    "今日": "きょう",
    "明日": "あした",
    "昨日": "きのう",
    "明後日": "あさって",
    "今年": "ことし",
    "去年": "きょねん",
    "今夜": "こんや",
    "今朝": "けさ",
    "大人": "おとな",
    "子供": "こども",
    "友達": "ともだち",
    "一人": "ひとり",
    "二人": "ふたり",
    "三人": "さんにん",
    "一日": "ついたち",
    "二日": "ふつか",
    "三日": "みっか",
    "四日": "よっか",
    "五日": "いつか",
    "六日": "むいか",
    "七日": "なのか",
    "八日": "ようか",
    "九日": "ここのか",
    "十日": "とおか",
    "二十日": "はつか",
    "二十歳": "はたち",
    "眼鏡": "めがね",
    "部屋": "へや",
    "時計": "とけい",
    "田舎": "いなか",
    "土産": "みやげ",
    "お土産": "おみやげ",
    "果物": "くだもの",
    "景色": "けしき",
    "紅葉": "もみじ",
    "吹雪": "ふぶき",
    "足袋": "たび",
    "浴衣": "ゆかた",
    "為替": "かわせ",
    "八百屋": "やおや",
    "上手": "じょうず",
    "下手": "へた",
    "清水": "しみず",
    "お母さん": "おかあさん",
    "お父さん": "おとうさん",
    "お兄さん": "おにいさん",
    "お姉さん": "おねえさん",
    "日": "ひ",
    "月": "つき",
    "火": "ひ",
    "水": "みず",
    "木": "き",
    "金": "かね",
    "土": "つち",
    "日本": "にほん",
    "日本語": "にほんご",
    "言葉": "ことば",
    "嫌悪": "けんお",
    "自己": "じこ",
    "自己嫌悪": "じこけんお",
    "自分": "じぶん",
    "世界": "せかい",
    "綺麗": "きれい",
    "本当": "ほんとう",
    "本当は": "ほんとうは",
    "存在": "そんざい",
    "日の目": "ひのめ",
    "本音": "ほんね",
    "一輪": "いちりん",
    "隙間": "すきま",
    "書架": "しょか",
    "気持ち": "きもち",
    "一番": "いちばん",
    "一緒": "いっしょ",
    "一緒に": "いっしょに",
    "大丈夫": "だいじょうぶ",
    "ありがとう": "ありがとう",
    "最後": "さいご",
    "最初": "さいしょ",
    "先生": "せんせい",
    "時間": "じかん",
    "心": "こころ",
    "愛": "あい",
    "夢": "ゆめ",
    "命": "いのち",
    "力": "ちから",
    "光": "ひかり",
    "影": "かげ",
    "食べ物": "たべもの",
    "飲み物": "のみもの",
    "前": "まえ",
    "後": "あと",
    "好き": "すき",
    "嫌い": "きらい",
    "新しい": "あたらしい",
    "古い": "ふるい",
    "高い": "たかい",
    "低い": "ひくい",
    "多い": "おおい",
    "少ない": "すくない",
    "良い": "いい",
    "悪い": "わるい",
    "美しい": "うつくしい",
    "楽しい": "たのしい",
    "嬉しい": "うれしい",
    "悲しい": "かなしい",
    "見せてくれた": "みせてくれた",
    "落ちてく": "おちてく"
}

new_engine_code = '''
/**
 * Matches verb/adjective inflections and Onbin shifts (Godan, Ichidan, Kuru, Suru).
 */
export function matchVerbInflectionAt(text, startIndex, kanjiDb) {
  const kanjiChar = text[startIndex];
  const restText = text.slice(startIndex + 1);
  const kanjiDbEntry = kanjiDb[kanjiChar];
  if (!kanjiDbEntry) return null;
  const [ons, kuns] = kanjiDbEntry;
  if (!kuns || kuns.length === 0) return null;

  // Special irregular verbs check
  if (kanjiChar === '来') {
    if (restText.startsWith('る')) return 'く';
    if (restText.startsWith('た') || restText.startsWith('て') || restText.startsWith('ます') || restText.startsWith('ま')) return 'き';
    if (restText.startsWith('ない') || restText.startsWith('ず') || restText.startsWith('よう') || restText.startsWith('られ')) return 'こ';
    if (restText.startsWith('れば')) return 'く';
    return 'き';
  }
  if (kanjiChar === '行') {
    if (restText.startsWith('った') || restText.startsWith('って')) return 'い';
    if (restText.startsWith('く') || restText.startsWith('かない') || restText.startsWith('きます') || restText.startsWith('けば') || restText.startsWith('こう') || restText.startsWith('き')) return 'い';
    return 'い';
  }

  // Iterate over dotted kunyomi entries (e.g. 'か.く', 'お.ちる', 'た.べる', 'うつく.しい')
  for (const rawKun of kuns) {
    if (!rawKun.includes('.')) continue;
    const [stem, okuri] = rawKun.split('.');
    
    // Direct match (e.g. okuri === 'く' and restText starts with 'く')
    if (restText.startsWith(okuri)) {
      return stem;
    }

    const lastOkuri = okuri[okuri.length - 1];
    const okuriPrefix = okuri.slice(0, -1);

    if (okuriPrefix.length > 0 && !restText.startsWith(okuriPrefix)) {
      continue;
    }

    const suffixToMatch = okuriPrefix.length > 0 ? restText.slice(okuriPrefix.length) : restText;

    if (lastOkuri === 'く') {
      if (/^(いて|いた|かない|きます|けば|こう|き|こ)/.test(suffixToMatch)) return stem;
    } else if (lastOkuri === 'ぐ') {
      if (/^(いで|いだ|がない|ぎます|げば|ごう|ぎ|ご)/.test(suffixToMatch)) return stem;
    } else if (lastOkuri === 'す') {
      if (/^(して|した|さない|します|せば|そう|し|せ)/.test(suffixToMatch)) return stem;
    } else if (lastOkuri === 'つ') {
      if (/^(って|った|たない|ちます|てば|とう|ち|て)/.test(suffixToMatch)) return stem;
    } else if (lastOkuri === 'ぬ') {
      if (/^(んで|んだ|なない|にます|ねば|のう|に|ね)/.test(suffixToMatch)) return stem;
    } else if (lastOkuri === 'ぶ') {
      if (/^(んで|んだ|ばない|びます|べば|ぼう|び|べ)/.test(suffixToMatch)) return stem;
    } else if (lastOkuri === 'む') {
      if (/^(んで|んだ|まない|みます|めば|もう|み|め)/.test(suffixToMatch)) return stem;
    } else if (lastOkuri === 'う') {
      if (/^(って|った|わない|います|えば|おう|い|え)/.test(suffixToMatch)) return stem;
    } else if (lastOkuri === 'る') {
      if (/^(って|った|らない|ります|れば|ろう|り|れ)/.test(suffixToMatch)) return stem;
      if (/^(て|た|ない|ます|れば|よう|られ|させ)/.test(suffixToMatch)) return stem;
    } else if (lastOkuri === 'い') {
      if (/^(かった|くて|くない|くなかった|く|ければ|そう)/.test(suffixToMatch)) return stem;
    }
  }

  // Fallback to first dotted kun'yomi stem if okurigana is present
  for (const rawKun of kuns) {
    if (rawKun.includes('.')) {
      return rawKun.split('.')[0];
    }
  }
  return (kuns && kuns.length > 0) ? kuns[0].split('.')[0] : (ons && ons.length > 0 ? ons[0] : kanjiChar);
}

/**
 * Resolves any Japanese word or phrase into pure Hiragana reading.
 * Uses Kun'yomi for standalone kanji & okurigana verb stems, and On'yomi for multi-kanji Jukugo compounds.
 */
export function resolveToHiragana(word) {
  if (!word || !word.trim()) return '';
  const w = word.trim();
  if (SPECIAL_WORDS[w]) return SPECIAL_WORDS[w];

  // 1. Single standalone Kanji: Use Kun'yomi (natural reading / verb stem) or fallback to On'yomi
  if (w.length === 1 && w.charCodeAt(0) >= 0x4E00 && w.charCodeAt(0) <= 0x9FAF) {
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
    const code = ch.charCodeAt(0);
    if (code >= 0x4E00 && code <= 0x9FAF) {
      // Check multi-character substring in SPECIAL_WORDS first (sliding window)
      let matchedSpecial = null;
      for (let len = Math.min(6, w.length - i); len >= 1; len--) {
        const sub = w.slice(i, i + len);
        if (SPECIAL_WORDS[sub]) {
          matchedSpecial = { len, val: SPECIAL_WORDS[sub] };
          break;
        }
      }
      if (matchedSpecial) {
        res += matchedSpecial.val;
        i += matchedSpecial.len;
        continue;
      }

      const info = KANJI_DB[ch];
      if (!info) {
        res += ch;
        i++;
        continue;
      }
      const [ons, kuns] = info;

      // Lookahead: is following character Hiragana (okurigana)?
      const nextCode = i + 1 < w.length ? w.charCodeAt(i + 1) : 0;
      const isNextHiragana = nextCode >= 0x3040 && nextCode <= 0x309F;

      if (isNextHiragana) {
        const matchedStem = matchVerbInflectionAt(w, i, KANJI_DB);
        res += matchedStem || (kuns && kuns.length > 0 ? kuns[0].split('.')[0] : (ons && ons[0]) || ch);
      } else {
        // Part of Jukugo (multi-kanji compound) -> use On'yomi
        if (ons && ons.length > 0) {
          res += ons[0];
        } else if (kuns && kuns.length > 0) {
          res += kuns[0].split('.')[0];
        } else {
          res += ch;
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
    const cCode = c.charCodeAt(0);
    if (cCode >= 0x4E00 && cCode <= 0x9FAF) {
      const fallback = KANJI_DB[c];
      sanitized += (fallback && fallback[1] && fallback[1][0]?.split('.')[0]) || (fallback && fallback[0] && fallback[0][0]) || '';
    } else {
      sanitized += c;
    }
  }

  return sanitized;
}

/**
 * Converts Hiragana to Modified Hepburn Romaji with particle & sokuon handling.
 */
export function toModifiedHepburnRomaji(hira, originalWord, wanakana) {
  if (!hira) return '';
  const w = (originalWord || '').trim();
  if (w === 'は') return 'wa';
  if (w === 'へ') return 'e';
  if (w === 'を') return 'o';
  if (w === 'こんにちは') return 'konnichiwa';
  if (w === 'こんばんは') return 'konbanwa';

  const engine = wanakana || (typeof window !== 'undefined' ? window.wanakana : null);
  if (engine && engine.toRomaji) {
    return engine.toRomaji(hira);
  }
  return hira;
}

export function getWordReading(word, wanakana) {
  if (!word || !word.trim()) return { furigana: '', romaji: '' };
  const hira = resolveToHiragana(word);
  const romaji = toModifiedHepburnRomaji(hira, word, wanakana);
  return { furigana: hira, romaji };
}
'''

# Replace SPECIAL_WORDS
m_spec_start = dict_content.find('export const SPECIAL_WORDS = {')
m_spec_end = dict_content.find('export const KANJI_DB = {')
formatted_special_words = 'export const SPECIAL_WORDS = ' + json.dumps(expanded_special_words, ensure_ascii=False, indent=2) + ';\n\n'
dict_content = dict_content[:m_spec_start] + formatted_special_words + dict_content[m_spec_end:]

# Replace functions
m_fn_start = dict_content.find('/**\n * Matches verb/adjective inflections')
if m_fn_start == -1:
    m_fn_start = dict_content.find('/**\n * Resolves any Japanese word or phrase into pure Hiragana reading.')
if m_fn_start == -1:
    m_fn_start = dict_content.find('export function resolveToHiragana')

dict_content = dict_content[:m_fn_start] + new_engine_code.strip() + '\n'

with open('extension/js/kanji-dict.js', 'w', encoding='utf-8') as f:
    f.write(dict_content)

print('Updated extension/js/kanji-dict.js successfully!')

