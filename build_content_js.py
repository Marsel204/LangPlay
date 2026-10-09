import json, re, os

dict_file = 'extension/js/kanji-dict.js' if os.path.exists('extension/js/kanji-dict.js') else 'js/kanji-dict.js'
rules_file = 'extension/lib/deinflect-rules.json' if os.path.exists('extension/lib/deinflect-rules.json') else 'lib/deinflect-rules.json'
out_file = 'extension/content.js' if os.path.exists('extension/manifest.json') else 'content.js'

with open(dict_file, 'r', encoding='utf-8') as f:
    dict_content = f.read()

with open(rules_file, 'r', encoding='utf-8') as f:
    deinflect_rules_json = f.read()

m_spec = re.search(r'export const SPECIAL_WORDS = ({.*?});', dict_content, re.DOTALL)
m_db = re.search(r'export const KANJI_DB = ({.*?});', dict_content, re.DOTALL)

special_words_code = m_spec.group(1)
kanji_db_code = m_db.group(1)

content_code = """/**
 * LinguaPlay Chrome Extension — YouTube On-Site Content Script (content.js)
 * Standalone bundle with 3,800+ Kanji DB, Zero-Kanji Guarantee,
 * Contextual Kun'yomi vs On'yomi resolution, non-interrupting video playback,
 * native sidebar drawer integration, and default Antigravity CLI support.
 */

(function () {
  'use strict';

  // ── 1. Comprehensive Kanji & Vocabulary Reading Database (3,800+ Kanji) ──
  const SPECIAL_WORDS = """ + special_words_code + """;

  const KANJI_DB = """ + kanji_db_code + """;

  // ── Yomitan Deinflection Engine (<0.1ms rule-driven state transitions) ──
  const YOMITAN_DEINFLECT_RULES = """ + deinflect_rules_json + """;

  class YomitanDeinflector {
    constructor(rules) {
      this.reasons = rules || YOMITAN_DEINFLECT_RULES;
    }

    deinflect(source) {
      if (!source || typeof source !== 'string') return [];
      const results = [{ term: source, rules: 0, reasons: [] }];
      for (let i = 0; i < results.length; ++i) {
        const { rules, term, reasons } = results[i];
        for (let r = 0; r < this.reasons.length; r++) {
          const reasonEntry = this.reasons[r];
          const reasonName = reasonEntry[0];
          const variants = reasonEntry[1];
          for (let v = 0; v < variants.length; v++) {
            const [kanaIn, kanaOut, rulesIn, rulesOut] = variants[v];
            if (
              (rules !== 0 && (rules & rulesIn) === 0) ||
              !term.endsWith(kanaIn) ||
              (term.length - kanaIn.length + kanaOut.length) <= 0
            ) {
              continue;
            }

            const deinflectedTerm = term.substring(0, term.length - kanaIn.length) + kanaOut;
            results.push({
              term: deinflectedTerm,
              rules: rulesOut,
              reasons: [reasonName, ...reasons]
            });
          }
        }
      }
      return results;
    }
  }

  const yomitanDeinflector = new YomitanDeinflector();

  function resolveDeinflectedReading(word) {
    if (!word || !word.trim()) return null;
    const w = word.trim();
    if (SPECIAL_WORDS[w]) return SPECIAL_WORDS[w];
    const deinflections = yomitanDeinflector.deinflect(w);
    // 来る changes its stem with the inflection. 行く must retain the
    // established reading ahead of the ambiguous 行う candidate.
    if (w.startsWith('来') && deinflections.some(candidate => candidate.term === '来る')) {
      const suffix = w.slice(1);
      const stem = /^(?:な|ず|ぬ|よう|られ|させ|い|れる)/.test(suffix)
        ? 'こ' : /^(?:る|れ)/.test(suffix) ? 'く' : 'き';
      return stem + suffix;
    }
    if (w.startsWith('行') && deinflections.some(candidate => candidate.term === '行く')) {
      return 'い' + w.slice(1);
    }
    for (let dIdx = 0; dIdx < deinflections.length; dIdx++) {
      const { term } = deinflections[dIdx];
      if (SPECIAL_WORDS[term]) {
        const baseReading = SPECIAL_WORDS[term];
        if (term.endsWith('い') && baseReading.endsWith('い')) {
          const stemReading = baseReading.slice(0, -1);
          const stemWord = term.slice(0, -1);
          if (w.startsWith(stemWord)) {
            return stemReading + w.slice(stemWord.length);
          }
        }
        if (term.endsWith('る') && baseReading.endsWith('る')) {
          const stemReading = baseReading.slice(0, -1);
          const stemWord = term.slice(0, -1);
          if (w.startsWith(stemWord)) {
            return stemReading + w.slice(stemWord.length);
          }
        }
      }
      const firstChar = term[0];
      const dbEntry = KANJI_DB[firstChar];
      if (dbEntry && dbEntry[1]) {
        const okuri = term.slice(1);
        for (let kIdx = 0; kIdx < dbEntry[1].length; kIdx++) {
          const kun = dbEntry[1][kIdx];
          if (kun.includes('.')) {
            const [stemReading, okuriReading] = kun.split('.');
            if (okuri === okuriReading) {
              return stemReading + w.slice(1);
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Matches verb/adjective inflections and Onbin shifts (Godan, Ichidan, Kuru, Suru).
   */
  function matchVerbInflectionAt(text, startIndex, kanjiDb) {
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

    return null;
  }

  /**
   * Resolves any Japanese word or phrase into pure Hiragana reading.
   * Uses Kun'yomi for standalone kanji & okurigana verb stems, and On'yomi for multi-kanji Jukugo compounds.
   */
  function resolveToHiragana(word) {
    if (!word || !word.trim()) return '';
    const w = word.trim();
    if (SPECIAL_WORDS[w]) return SPECIAL_WORDS[w];
    const deinf = resolveDeinflectedReading(w);
    if (deinf) return deinf;

    const isKanji = (c) => c >= 0x4E00 && c <= 0x9FAF;
    const isKatakana = (c) => c >= 0x30A1 && c <= 0x30F6;

    // 1. Single standalone Kanji: Use Kun'yomi or fallback to On'yomi
    if (w.length === 1 && isKanji(w.charCodeAt(0))) {
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

      // Check substring in SPECIAL_WORDS first (sliding window)
      let matchedSpecial = null;
      const prevIsKanji = i > 0 && isKanji(w.charCodeAt(i - 1));
      const nextIsKanji = i + 1 < w.length && isKanji(w.charCodeAt(i + 1));
      const isPartOfJukugo = prevIsKanji || nextIsKanji;

      for (let len = Math.min(6, w.length - i); len >= 1; len--) {
        if (len === 1 && isPartOfJukugo) continue;
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

      if (isKanji(code)) {
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
      } else if (isKatakana(code)) {
        res += String.fromCharCode(code - 0x60);
      } else {
        res += ch;
      }
      i++;
    }

    // Final sanitizer pass
    let sanitized = '';
    for (let j = 0; j < res.length; j++) {
      const c = res[j];
      const cCode = c.charCodeAt(0);
      if (isKanji(cCode)) {
        const fallback = KANJI_DB[c];
        sanitized += (fallback && fallback[1] && fallback[1][0]?.split('.')[0]) || (fallback && fallback[0] && fallback[0][0]) || '';
      } else if (isKatakana(cCode)) {
        sanitized += String.fromCharCode(cCode - 0x60);
      } else {
        sanitized += c;
      }
    }

    return sanitized;
  }

  /**
   * Converts Hiragana to Modified Hepburn Romaji with particle & sokuon handling.
   */
  function toModifiedHepburnRomaji(hira, originalWord) {
    if (!hira) return '';
    const w = (originalWord || '').trim();
    if (w === 'は') return 'wa';
    if (w === 'へ') return 'e';
    if (w === 'を') return 'o';
    if (w === 'こんにちは') return 'konnichiwa';
    if (w === 'こんばんは') return 'konbanwa';

    const wk = window.wanakana;
    if (wk && wk.toRomaji) {
      return wk.toRomaji(hira);
    }
    return hira;
  }

  function getWordReading(word) {
    if (!word || !word.trim()) return { furigana: '', romaji: '' };
    const hira = resolveToHiragana(word);
    const romaji = toModifiedHepburnRomaji(hira, word);
    return { furigana: hira, romaji };
  }

  const japaneseParser = globalThis.LinguaPlayParser?.create({ wanakana: window.wanakana });

  const COPULAS = new Set([
    'だった', 'でした', 'だろう', 'でしょう', 'だ', 'です',
    'じゃない', 'じゃなかった', 'ではない', 'ではなかった'
  ]);

  const PARTICLES = new Set([
    'は', 'が', 'を', 'に', 'で', 'へ', 'と', 'も', 'の', 'か', 'よ', 'ね', 'な', 'ぞ', 'ぜ', 'さ',
    'より', 'から', 'まで', 'だけ', 'ほど', 'ばかり', 'など', 'くらい', 'ぐらい',
    'けれど', 'けれども', 'けど', 'のに', 'ので', 'ても', 'でも', 'なら', 'って'
  ]);

  const COMMON_WORDS = new Set([
    'また', 'もっと', 'ずっと', 'いつも', 'きっと', 'たぶん', 'とても', 'たくさん',
    'ちょっと', 'すぐ', 'もう', '僕', '君', '私', '俺', 'これ', 'それ', 'あれ', 'どれ',
    'ここ', 'そこ', 'あそこ', 'どこ', 'どう', 'そう', 'こう', 'なぜ', 'どうして'
  ]);

  function segmentJapaneseSentence(text) {
    if (!text || !text.trim()) return [];
    const clean = text.trim();
    const rawTokens = [];
    let i = 0;

    while (i < clean.length) {
      if (/\\s/.test(clean[i])) { i++; continue; }
      if (/[、。！？，．…〜「」『』（）,.!?]/.test(clean[i])) {
        rawTokens.push({ text: clean[i], isPunct: true });
        i++;
        continue;
      }

      // 1. Check longest match in SPECIAL_WORDS, COMMON_WORDS, or COPULAS
      let matchedPrefix = null;
      for (let len = Math.min(12, clean.length - i); len >= 2; len--) {
        const sub = clean.slice(i, i + len);
        if (SPECIAL_WORDS[sub] || COMMON_WORDS.has(sub) || COPULAS.has(sub)) {
          matchedPrefix = sub;
          break;
        }
      }
      if (matchedPrefix) {
        const isCop = COPULAS.has(matchedPrefix);
        rawTokens.push({ text: matchedPrefix, isSpecial: !isCop, isCopula: isCop });
        i += matchedPrefix.length;
        continue;
      }

      // 2. Check if candidate starting at i can be deinflected as a verb/adjective
      let matchedVerb = null;
      for (let len = Math.min(12, clean.length - i); len >= 2; len--) {
        const candidate = clean.slice(i, i + len);
        if (resolveDeinflectedReading(candidate)) {
          matchedVerb = candidate;
          break;
        }
      }
      if (matchedVerb) {
        rawTokens.push({ text: matchedVerb, isVerb: true });
        i += matchedVerb.length;
        continue;
      }

      // 3. Kanji word (run of Kanji)
      if (/[\\u4E00-\\u9FAF]/.test(clean[i])) {
        let wordEnd = i + 1;
        while (wordEnd < clean.length && /[\\u4E00-\\u9FAF]/.test(clean[wordEnd])) {
          wordEnd++;
        }
        rawTokens.push({ text: clean.slice(i, wordEnd), isKanjiWord: true });
        i = wordEnd;
        continue;
      }

      // 4. Copulas / Particles
      let matchedPart = null;
      for (let pLen = Math.min(6, clean.length - i); pLen >= 1; pLen--) {
        const sub = clean.slice(i, i + pLen);
        if (COPULAS.has(sub) || PARTICLES.has(sub)) {
          matchedPart = sub;
          break;
        }
      }
      if (matchedPart) {
        const isCop = COPULAS.has(matchedPart);
        rawTokens.push({ text: matchedPart, isParticle: !isCop, isCopula: isCop });
        i += matchedPart.length;
        continue;
      }

      // 5. Standalone Kana word
      let kanaEnd = i + 1;
      while (kanaEnd < clean.length && /[\\u3040-\\u309F\\u30A0-\\u30FF]/.test(clean[kanaEnd])) {
        if (/[、。！？，．…〜「」『』（）,.!?\\s]/.test(clean[kanaEnd]) || /[\\u4E00-\\u9FAF]/.test(clean[kanaEnd])) break;
        let isPart = false;
        for (let pLen = Math.min(6, clean.length - kanaEnd); pLen >= 1; pLen--) {
          const sub = clean.slice(kanaEnd, kanaEnd + pLen);
          if (PARTICLES.has(sub) || COPULAS.has(sub)) { isPart = true; break; }
        }
        if (isPart) break;
        kanaEnd++;
      }
      rawTokens.push({ text: clean.slice(i, kanaEnd), isKana: true });
      i = kanaEnd;
    }

    // Sokuon safety binder: merge any leading 'っ' token into preceding token
    const boundTokens = [];
    for (let idx = 0; idx < rawTokens.length; idx++) {
      const tok = rawTokens[idx];
      if (tok.text.startsWith('っ') && boundTokens.length > 0 && !boundTokens[boundTokens.length - 1].isPunct) {
        boundTokens[boundTokens.length - 1].text += tok.text;
      } else {
        boundTokens.push(tok);
      }
    }

    return boundTokens;
  }

  function generateSentenceRomaji(sentenceText, targetWord) {
    if (!sentenceText || !sentenceText.trim()) return '';
    const parsedRomaji = japaneseParser?.romaji(sentenceText, targetWord);
    if (parsedRomaji != null) return parsedRomaji;
    const clean = sentenceText.trim();
    const tokens = segmentJapaneseSentence(clean);

    const targetClean = targetWord ? targetWord.trim() : '';
    const targetHira = targetClean ? resolveToHiragana(targetClean) : '';
    const targetRomaji = targetClean ? toModifiedHepburnRomaji(targetHira, targetClean) : '';

    const romajiTokens = [];

    for (let idx = 0; idx < tokens.length; idx++) {
      const tok = tokens[idx];
      if (tok.isPunct) {
        if (romajiTokens.length > 0) {
          const last = romajiTokens[romajiTokens.length - 1];
          if (/[、,]/.test(tok.text)) romajiTokens[romajiTokens.length - 1] = last + ',';
          else if (/[。.]/.test(tok.text)) romajiTokens[romajiTokens.length - 1] = last + '.';
          else if (/[！!]/.test(tok.text)) romajiTokens[romajiTokens.length - 1] = last + '!';
          else if (/[？?]/.test(tok.text)) romajiTokens[romajiTokens.length - 1] = last + '?';
          else romajiTokens.push(tok.text);
        } else {
          romajiTokens.push(tok.text);
        }
        continue;
      }

      let tokRomaji = '';
      if (tok.isParticle) {
        if (tok.text === 'は') tokRomaji = 'wa';
        else if (tok.text === 'へ') tokRomaji = 'e';
        else if (tok.text === 'を') tokRomaji = 'o';
        else tokRomaji = toModifiedHepburnRomaji(tok.text, tok.text);
      } else {
        const hira = resolveToHiragana(tok.text);
        tokRomaji = toModifiedHepburnRomaji(hira, tok.text);
      }

      // Check target highlight
      let isTarget = false;
      if (targetClean) {
        if (tok.text === targetClean || (targetClean.length >= 2 && tok.text.includes(targetClean)) || (tok.text.length >= 2 && targetClean.includes(tok.text))) {
          isTarget = true;
        }
      }

      if (isTarget) {
        if (targetRomaji && tokRomaji.includes(targetRomaji) && tokRomaji !== targetRomaji) {
          const highlighted = tokRomaji.replace(targetRomaji, `<span style="color:#fda4af; font-weight:bold; background:rgba(253,164,175,0.18); padding:0 3px; border-radius:3px;">${targetRomaji}</span>`);
          romajiTokens.push(highlighted);
        } else {
          romajiTokens.push(`<span style="color:#fda4af; font-weight:bold; background:rgba(253,164,175,0.18); padding:0 3px; border-radius:3px;">${tokRomaji}</span>`);
        }
      } else {
        romajiTokens.push(tokRomaji);
      }

      // Sokuon safety check on romaji token level: merge floating double consonants with preceding token
      if (romajiTokens.length >= 2) {
        const lastIdx = romajiTokens.length - 1;
        const currentTok = romajiTokens[lastIdx];
        if (/^(tt|kk|pp|ss|cc|hh|mm|nn|rr|ww|yy|zz)/i.test(currentTok)) {
          romajiTokens[lastIdx - 1] += currentTok;
          romajiTokens.pop();
        }
      }
    }

    return romajiTokens.join(' ');
  }


  // ── Offline JDICT Dictionary Subset (<10ms instant lookup) ──
  const JDICT = {
    '私': 'I; me', '俺': 'I; me (masculine)', '僕': 'I; me (humble, male)', '君': 'you (informal)', 'あなた': 'you', '彼': 'he; him; boyfriend', '彼女': 'she; her; girlfriend', '誰': 'who',
    'これ': 'this', 'それ': 'that', 'あれ': 'that (over there)', 'どれ': 'which one', 'ここ': 'here', 'そこ': 'there', 'あそこ': 'over there', 'どこ': 'where',
    '自己': 'self; oneself', '嫌悪': 'disgust; hate; abhorrence', '自己嫌悪': 'self-hatred; self-disgust',
    '綺麗': 'beautiful; pretty; lovely; clean', '世界': 'world; universe; society',
    '美味しい': 'delicious; tasty', '美味しかった': 'was delicious', '届く': 'to reach; to arrive; to deliver', '届かぬ': 'unreachable; cannot reach',
    'は': '(topic marker)', 'が': '(subject marker)', 'を': '(object marker)', 'に': 'to; at; in', 'で': 'at; by; with', 'へ': 'towards', 'も': 'also; too',
    'の': '(possessive; of)', 'と': 'and; with; quotation', 'か': '(question marker)', 'よ': '(emphasis)', 'ね': '(confirmation; right?)', 'より': 'than; from',
    'から': 'from; since; because', 'まで': 'until; even', 'だけ': 'only; just', 'しか': 'only; but (with negative)', 'けど': 'but; however',
    '見': 'to see; to look; to watch', '見る': 'to see; to look; to watch', '見せる': 'to show; to display', '見せてくれた': 'showed (me); displayed for (me)', '見せて': 'showing; show (me)',
    '落ちる': 'to fall; to drop; to crash', '落ちてく': 'falling down; fading away', '落ち': 'falling; drop',
    'する': 'to do', 'ある': 'to exist (inanimate); to have', 'いる': 'to exist (animate); to be', '行く': 'to go', '来る': 'to come',
    '聞く': 'to hear; to listen; to ask', '言う': 'to say; to tell', '食べる': 'to eat', '飲む': 'to drink', '買う': 'to buy', '書く': 'to write',
    '読む': 'to read', '話す': 'to speak; to talk', '会う': 'to meet', '待つ': 'to wait', '立つ': 'to stand', '座る': 'to sit', '歩く': 'to walk', '走る': 'to run',
    '止まる': 'to stop', '始まる': 'to begin', '終わる': 'to end; to finish', '作る': 'to make; to create', '出る': 'to leave; to go out', '入る': 'to enter',
    '乗る': 'to ride; to get on', '降りる': 'to get off; to descend', '開ける': 'to open', '閉める': 'to close', '教える': 'to teach; to tell',
    '学ぶ': 'to learn; to study', '勉強する': 'to study', '働く': 'to work', '休む': 'to rest; to take a day off', '遊ぶ': 'to play; to hang out',
    '使う': 'to use', '持つ': 'to hold; to have', '置く': 'to put; to place', '取る': 'to take; to get', '送る': 'to send', '受ける': 'to receive',
    '返す': 'to return (something)', '帰る': 'to return home', '死ぬ': 'to die', '生きる': 'to live; to be alive', '生まれる': 'to be born',
    '変わる': 'to change (intrans.)', '変える': 'to change (trans.)', '思う': 'to think; to feel', '考える': 'to think; to consider', '知る': 'to know',
    '分かる': 'to understand; to know', '忘れる': 'to forget', '覚える': 'to remember; to memorize', '信じる': 'to believe', '感じる': 'to feel',
    '好き': 'to like', '嫌い': 'to dislike; to hate', '欲しい': 'to want (adjective)', 'できる': 'can do; to be able to', 'なる': 'to become',
    '人': 'person; people', '今': 'now', '今日': 'today', '明日': 'tomorrow', '昨日': 'yesterday', '日本': 'Japan', '日本語': 'Japanese (language)',
    '水': 'water', 'お金': 'money', '友達': 'friend', '先生': 'teacher', '時間': 'time', '心': 'heart; mind', '愛': 'love',
    '夢': 'dream', '命': 'life', '言葉': 'word; language', '本当': 'truth; really', '大丈夫': 'okay; fine', 'ありがとう': 'thank you', '最後': 'last; final'
  };

  let activeVideoEl = null;
  let subtitleTimeline = [];
  let currentSubIndex = -1;
  let timingOffset = 0.0;
  let readingMode = 'furigana';
  let currentVideoId = null;
  let lyricsFetchAttemptedVid = null;
  let isFetchingLyrics = false;
  let lastAiData = null;
  let senseiChatHistory = [];
  let activeSenseiChatRequest = null;
  let drawerContextVersion = 0;
  let refreshDrawerParsing = () => {};
  let drawerContextSentence = '';
  let drawerActiveWord = '';
  let activeLiveSentence = '';
  let isPanelCollapsed = true;
  let areSubtitlesHidden = false;
  let playerUI = null;
  let liveCaptionObserver = null;
  let drawerPlacementObserver = null;
  let drawerSidebar = null;

  // ── Load Settings ──
  let renderedSentence = '';
  let subtitleRenderVersion = 0;

  chrome.storage.local.get(['linguaplay_reading_mode', 'linguaplay_panel_collapsed'], (res) => {
    if (res.linguaplay_reading_mode) readingMode = res.linguaplay_reading_mode;
    if (typeof res.linguaplay_panel_collapsed === 'boolean') isPanelCollapsed = res.linguaplay_panel_collapsed;
    updateWidgetState();
  });

  // ── Tokenizer with Kanji Resolution ──
  function tokenize(sentence) {
    if (!sentence || !sentence.trim()) return [];
    const parsed = japaneseParser?.cached(sentence);
    if (parsed) return parsed;
    
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      try {
        const seg = new Intl.Segmenter('ja-JP', { granularity: 'word' });
        return Array.from(seg.segment(sentence.trim())).map(s => {
          const w = s.segment;
          const reading = getWordReading(w);
          return {
            surface: w,
            reading: reading.furigana || w,
            furigana: reading.furigana || '',
            romaji: reading.romaji || '',
            baseForm: w
          };
        });
      } catch (e) { /* ignore */ }
    }

    return sentence.split(/([、。！？\\s]+)/).filter(Boolean).map(w => {
      const reading = getWordReading(w);
      return {
        surface: w,
        reading: reading.furigana || w,
        furigana: reading.furigana || '',
        romaji: reading.romaji || '',
        baseForm: w
      };
    });
  }

  // ── Subtitle Parser (VTT / SRT / XML TimedText) ──
  function parseVTT(raw) {
    if (!raw) return [];
    if (raw.includes('<timedtext') || raw.includes('<p t=')) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(raw, 'text/xml');
        const pTags = doc.querySelectorAll('p');
        const cues = [];
        pTags.forEach(p => {
          const t = parseFloat(p.getAttribute('t') || '0');
          const d = parseFloat(p.getAttribute('d') || '0');
          const text = (p.textContent || '').replace(/<[^>]+>/g, '').trim();
          if (text) {
            cues.push({
              start: t / 1000,
              end: (t + d) / 1000,
              text: text
            });
          }
        });
        if (cues.length > 0) return cues.sort((a, b) => a.start - b.start);
      } catch (e) {}
    }
    const lines = raw.replace(/\\r\\n/g, '\\n').split('\\n');
    const cues = [];
    const re = /(\\d{1,2}:)?(\\d{2}):(\\d{2})[.,](\\d{3})\\s*-->\\s*(\\d{1,2}:)?(\\d{2}):(\\d{2})[.,](\\d{3})/;

    let i = 0;
    while (i < lines.length) {
      const match = lines[i].trim().match(re);
      if (match) {
        const start = (parseInt(match[1] || 0) * 3600) + (parseInt(match[2]) * 60) + parseInt(match[3]) + (parseInt(match[4]) / 1000);
        const end = (parseInt(match[5] || 0) * 3600) + (parseInt(match[6]) * 60) + parseInt(match[7]) + (parseInt(match[8]) / 1000);
        i++;
        const textLines = [];
        while (i < lines.length && lines[i].trim() !== '') {
          textLines.push(lines[i].trim().replace(/<[^>]+>/g, ''));
          i++;
        }
        if (textLines.length > 0) {
          cues.push({ start, end, text: textLines.join(' ') });
        }
      } else {
        i++;
      }
    }
    return cues.sort((a, b) => a.start - b.start);
  }

  function parseSRT(raw) {
    if (!raw) return [];
    const blocks = raw.replace(/\\r\\n/g, '\\n').split(/\\n\\s*\\n/);
    const cues = [];
    const re = /(\\d{2}):(\\d{2}):(\\d{2})[.,](\\d{3})\\s*-->\\s*(\\d{2}):(\\d{2}):(\\d{2})[.,](\\d{3})/;

    for (const block of blocks) {
      const lines = block.split('\\n').map(l => l.trim()).filter(Boolean);
      let timeIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) { timeIdx = i; break; }
      }
      if (timeIdx === -1) continue;
      const m = lines[timeIdx].match(re);
      if (!m) continue;
      const start = (parseInt(m[1]) * 3600) + (parseInt(m[2]) * 60) + parseInt(m[3]) + (parseInt(m[4]) / 1000);
      const end = (parseInt(m[5]) * 3600) + (parseInt(m[6]) * 60) + parseInt(m[7]) + (parseInt(m[8]) / 1000);
      const text = lines.slice(timeIdx + 1).join(' ').replace(/<[^>]+>/g, '');
      if (text) cues.push({ start, end, text });
    }
    return cues.sort((a, b) => a.start - b.start);
  }

  function parseLRC(raw) {
    if (!raw) return [];
    const lines = raw.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n').split('\\n');
    const rawCues = [];
    let globalOffset = 0.0;
    const timeRegex = /\\[(\\d{1,2}):(\\d{2})(?:[.:](\\d{2,3}))?\\]/g;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const offsetMatch = trimmed.match(/^\\[offset:\\s*([+-]?\\d+)\\s*\\]/i);
      if (offsetMatch) {
        globalOffset = (parseInt(offsetMatch[1], 10) || 0) / 1000;
        continue;
      }

      if (/^\\[[a-z]{2,8}:/i.test(trimmed)) continue;

      const matches = [...trimmed.matchAll(timeRegex)];
      if (matches.length === 0) continue;

      const text = trimmed.replace(timeRegex, '').replace(/<[^>]+>/g, '').trim();
      if (!text) continue;

      for (const m of matches) {
        const minutes = parseInt(m[1], 10);
        const seconds = parseInt(m[2], 10);
        let millis = 0;
        if (m[3]) {
          if (m[3].length === 2) {
            millis = parseInt(m[3], 10) * 10;
          } else {
            millis = parseInt(m[3].padEnd(3, '0').slice(0, 3), 10);
          }
        }
        const start = Math.max(0, minutes * 60 + seconds + (millis / 1000) + globalOffset);
        rawCues.push({ start, text });
      }
    }

    if (rawCues.length === 0) return [];
    rawCues.sort((a, b) => a.start - b.start);

    const cues = [];
    for (let i = 0; i < rawCues.length; i++) {
      const curr = rawCues[i];
      let end;
      if (i + 1 < rawCues.length) {
        const nextStart = rawCues[i + 1].start;
        end = nextStart > curr.start ? Math.min(nextStart, curr.start + 8.0) : curr.start + 3.0;
      } else {
        end = curr.start + 4.0;
      }
      cues.push({ start: curr.start, end, text: curr.text });
    }

    return cues;
  }

  function parseSubtitleFile(raw, filename = '') {
    const isVtt = filename.toLowerCase().endsWith('.vtt') || raw.trim().startsWith('WEBVTT');
    if (isVtt) return parseVTT(raw);
    const isLrc = filename.toLowerCase().endsWith('.lrc') || /\\[\\d{1,2}:\\d{2}[.:]\\d{2,3}\\]/.test(raw);
    if (isLrc) return parseLRC(raw);
    return parseSRT(raw);
  }

  function cleanSongTitle(rawTitle, rawChannel = '') {
    if (!rawTitle || typeof rawTitle !== 'string') {
      const fallback = (rawChannel || '').trim();
      return { trackName: '', artistName: fallback, query: fallback };
    }

    let clean = rawTitle.trim();
    clean = clean.replace(/\\s*-\\s*YouTube$/i, '').trim();

    // Strip sumitsuki kakko 【...】 if there is text outside of it
    const withoutSumitsuki = clean.replace(/【[^】]*】/g, ' ').trim();
    if (withoutSumitsuki) {
      clean = withoutSumitsuki;
    } else {
      clean = clean.replace(/[【】]/g, ' ').trim();
    }

    // Strip anime theme metadata in parentheses if there is text outside of it
    const withoutAnimeParens = clean.replace(/[（\\(](?:TVアニメ|アニメ|TV Anime|Anime|主題歌|OP|ED|挿入歌|テーマ|Character Song).*?[）\\)]/gi, ' ').trim();
    if (withoutAnimeParens) {
      clean = withoutAnimeParens;
    }

    clean = clean.replace(/\\[(?:Official|MV|Music Video|Full|Audio|Lyric Video|4K|HD|Remastered|Live).*?\\]/gi, ' ');
    clean = clean.replace(/\\((?:Official|Music Video|MV|Audio|Lyric Video|Full Ver\\.?|Live|Visualizer|THE FIRST TAKE).*?\\)/gi, ' ');
    clean = clean.replace(/THE FIRST TAKE/gi, ' ');
    clean = clean.replace(/\\b(?:Official Music Video|Official Video|Music Video|Lyric Video|Official Audio)\\b/gi, ' ');

    const cleanChannel = (rawChannel || '')
      .replace(/(?:\\s*-\\s*Topic|Official Channel|OFFICIAL CHANNEL|Official YouTube Channel|OFFICIAL|Official|チャンネル)/gi, '')
      .trim();

    let trackName = '';
    let artistName = '';

    const quoteMatch = clean.match(/[『「]([^』」]+)[』」]/);
    if (quoteMatch) {
      trackName = quoteMatch[1].trim();
      const before = clean.slice(0, quoteMatch.index).replace(/[-/／|｜~～\\s]+$/, '').trim();
      const after = clean.slice(quoteMatch.index + quoteMatch[0].length).replace(/^[-/／|｜~～\\s]+/, '').trim();
      if (before && !/^(?:MV|Official)$/i.test(before)) {
        artistName = before.replace(/\\s*(?:x|feat\\.?|ft\\.?).*$/i, '').trim();
      } else if (after) {
        const candidate = after.split(/[/／|｜]/)[0].replace(/\\s*(?:x|feat\\.?|ft\\.?).*$/i, '').trim();
        if (candidate && !/^(?:MV|Official)$/i.test(candidate)) {
          artistName = candidate;
        }
      }
    }

    if (!trackName) {
      const parts = clean.split(/\\s*[-—／|｜]\\s*|\\s+\\/\\s+/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const chLower = cleanChannel.toLowerCase();
        if (chLower && parts[0].toLowerCase().includes(chLower)) {
          artistName = parts[0];
          trackName = parts[1];
        } else if (chLower && parts[1].toLowerCase().includes(chLower)) {
          artistName = parts[1];
          trackName = parts[0];
        } else {
          artistName = parts[0];
          trackName = parts[1];
        }
      } else {
        trackName = clean;
      }
    }

    if (!artistName && cleanChannel) {
      artistName = cleanChannel;
    }

    const stripFeatures = (str) => {
      return str
        .replace(/\\s*(?:feat\\.?|ft\\.?)\\s+.*$/i, '')
        .replace(/\\s*（(?:CV|feat|ft).*?）/gi, '')
        .replace(/\\s*\\((?:CV|feat|ft).*?\\)/gi, '')
        .replace(/[（\\(][^）\\)]*[）\\)]/g, '')
        .replace(/[/／|｜].*$/, '')
        .trim();
    };

    trackName = stripFeatures(trackName);
    artistName = stripFeatures(artistName);

    const query = [artistName, trackName].filter(Boolean).join(' ') || clean;
    return { trackName, artistName, query };
  }

  // ── Language Detection Helper ──
  function hasJapaneseCharacters(text) {
    if (!text || typeof text !== 'string') return false;
    return /[\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FAF]/.test(text);
  }

  // ── Multi-Track Japanese Discovery & Prioritization ──
  function findJapaneseCaptionTrack(tracks) {
    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) return null;

    function isJapaneseTrack(t) {
      if (!t) return false;
      const code = (t.languageCode || t.lang || '').toLowerCase();
      if (code.startsWith('ja')) return true;
      const vss = (t.vssId || t.vss_id || '').toLowerCase();
      if (vss === '.ja' || vss === 'a.ja' || vss.endsWith('.ja') || vss.includes('ja')) return true;
      const name = (
        (t.name?.runs?.[0]?.text) ||
        (t.name?.simpleText) ||
        t.displayName ||
        t.languageName ||
        (typeof t.name === 'string' ? t.name : '')
      ).toLowerCase();
      return name.includes('japan') || name.includes('jepang') || name.includes('日本語') || name.includes('にほんご');
    }

    // 1. Priority 1: Human-curated Japanese track (not ASR)
    const manualJa = tracks.find(t => {
      if (!isJapaneseTrack(t)) return false;
      const isAsr = t.kind === 'asr' || (t.vssId && t.vssId.startsWith('a.')) || (t.vss_id && t.vss_id.startsWith('a.'));
      return !isAsr;
    });
    if (manualJa) return manualJa;

    // 2. Priority 2: Auto-generated Japanese track (ASR)
    const asrJa = tracks.find(t => isJapaneseTrack(t));
    if (asrJa) return asrJa;

    return null;
  }

  // ── Extract Caption Tracks from Page DOM ──
  function getOnPageCaptionTracks() {
    try {
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        const text = s.textContent || '';
        if (text.includes('captionTracks')) {
          const m = text.match(/"captionTracks":\\s*(\\[.*?\\])/);
          if (m) {
            try {
              const parsed = JSON.parse(m[1]);
              if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            } catch (e) {}
          }
        }
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // ── Switch YouTube Native Player Track to Japanese ──
  function switchYouTubePlayerCaptionTrack(targetTrackOrLang) {
    if (activeVideoEl && activeVideoEl.textTracks) {
      for (let i = 0; i < activeVideoEl.textTracks.length; i++) {
        const track = activeVideoEl.textTracks[i];
        const lang = (track.language || '').toLowerCase();
        if (lang.startsWith('ja')) {
          track.mode = 'showing';
        } else if (track.mode === 'showing') {
          track.mode = 'hidden';
        }
      }
    }

    try {
      const targetLang = typeof targetTrackOrLang === 'string' ? targetTrackOrLang : (targetTrackOrLang?.languageCode || 'ja');
      const vssId = targetTrackOrLang?.vssId || targetTrackOrLang?.vss_id || '';
      window.dispatchEvent(new CustomEvent('LINGUAPLAY_REQUEST_TRACK_SWITCH', {
        detail: { languageCode: targetLang, vssId: vssId }
      }));
    } catch (e) {}
  }

  // ── In-Memory Player Track Discovery Bridge ──
  function inspectAndSwitchPlayerTracks() {
    try {
      window.dispatchEvent(new CustomEvent('LINGUAPLAY_REQUEST_TRACK_SWITCH', {
        detail: { languageCode: 'ja' }
      }));
    } catch (e) {}
  }

  // ── Innertube Android VR Direct Caption Extractor (Zero PO-Token Required) ──
  async function fetchInnertubeCaptions(videoId) {
    try {
      let visitorData = '';
      try {
        if (typeof window.ytcfg?.get === 'function') {
          visitorData = window.ytcfg.get('VISITOR_DATA') || '';
        }
      } catch (e) {}

      if (!visitorData) {
        const scripts = document.querySelectorAll('script');
        for (const s of scripts) {
          const txt = s.textContent || '';
          const m = txt.match(/"VISITOR_DATA":\\s*"([^"]+)"/) || txt.match(/"visitorData":\\s*"([^"]+)"/);
          if (m) {
            visitorData = m[1];
            break;
          }
        }
      }

      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
        'X-YouTube-Client-Name': '28',
        'X-YouTube-Client-Version': '1.65.10',
        'Origin': 'https://www.youtube.com'
      };
      if (visitorData) headers['X-Goog-Visitor-Id'] = visitorData;

      const payload = {
        context: {
          client: {
            clientName: 'ANDROID_VR',
            clientVersion: '1.65.10',
            deviceMake: 'Oculus',
            deviceModel: 'Quest 3',
            androidSdkVersion: 32,
            osName: 'Android',
            osVersion: '12L',
            hl: 'en',
            timeZone: 'UTC',
            utcOffsetMinutes: 0
          }
        },
        videoId: videoId,
        playbackContext: {
          contentPlaybackContext: {
            html5Preference: 'HTML5_PREF_WANTS',
            signatureTimestamp: 20717
          }
        },
        contentCheckOk: true,
        racyCheckOk: true
      };

      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (Array.isArray(tracks) && tracks.length > 0) {
          const jaTrack = findJapaneseCaptionTrack(tracks);
          if (jaTrack && jaTrack.baseUrl) {
            switchYouTubePlayerCaptionTrack(jaTrack);
            ensureYouTubeCCEnabled();
            const subRes = await fetch(jaTrack.baseUrl);
            if (subRes.ok) {
              const text = await subRes.text();
              const cues = parseVTT(text);
              if (cues.length > 0) return cues;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[LinguaPlay] Innertube caption fetch error:', e);
    }
    return [];
  }

  // ── Caption Fetchers with Auto-Discovery & Auto-Switch ──
  async function fetchYouTubeCaptions(videoId) {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/captions?v=${videoId}`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const vtt = await res.text();
        const cues = parseVTT(vtt);
        const hasJp = cues.some(c => hasJapaneseCharacters(c.text));
        if (cues.length > 0 && hasJp) return cues;
      }
    } catch (e) { /* ignore */ }

    // 1. Probe player in-memory tracklist directly
    inspectAndSwitchPlayerTracks();

    // 2. Direct Android VR Innertube Fetch (Bypasses PO-token and exp=xpe)
    const innertubeCues = await fetchInnertubeCaptions(videoId);
    if (innertubeCues && innertubeCues.length > 0) {
      return innertubeCues;
    }

    // 3. Check on-page script data first (fastest zero-latency path)
    const onPageTracks = getOnPageCaptionTracks();
    if (onPageTracks) {
      const jaTrack = findJapaneseCaptionTrack(onPageTracks);
      if (jaTrack) {
        switchYouTubePlayerCaptionTrack(jaTrack);
        ensureYouTubeCCEnabled();
      }
      if (jaTrack && jaTrack.baseUrl) {
        try {
          const sep = jaTrack.baseUrl.includes('?') ? '&' : '?';
          const vttRes = await fetch(`${jaTrack.baseUrl}${sep}fmt=vtt`);
          if (vttRes.ok) {
            const vtt = await vttRes.text();
            const cues = parseVTT(vtt);
            if (cues.length > 0) return cues;
          }
        } catch (e) { /* ignore */ }
      }
    }

    // 4. Fallback to fetching YouTube page HTML with hl=ja
    try {
      const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=ja`);
      if (pageRes.ok) {
        const html = await pageRes.text();
        const m = html.match(/"captionTracks":\\s*(\\[.*?\\])/);
        if (m) {
          const tracks = JSON.parse(m[1]);
          const jaTrack = findJapaneseCaptionTrack(tracks);
          if (jaTrack) {
            switchYouTubePlayerCaptionTrack(jaTrack);
            ensureYouTubeCCEnabled();
          }
          if (jaTrack && jaTrack.baseUrl) {
            const sep = jaTrack.baseUrl.includes('?') ? '&' : '?';
            const vttRes = await fetch(`${jaTrack.baseUrl}${sep}fmt=vtt`);
            if (vttRes.ok) {
              const vtt = await vttRes.text();
              const cues = parseVTT(vtt);
              if (cues.length > 0) return cues;
            }
          }
        }
      }
    } catch (e) { /* ignore */ }

    return [];
  }

  // ── Sensei AI LLM Call Engine (Shared Across LinguaPlay) ──
  function getSenseiProvider(config) {
    return config.linguaplay_ai_provider || (config.linguaplay_gemini_key ? 'gemini' : 'antigravity');
  }

   async function callSenseiLlmApi({ messages, isJson, config, word, romaji, sentence, prompt }) {
    const provider = getSenseiProvider(config);
    const geminiKey = (config.linguaplay_gemini_key || '').trim();
    const deepseekKey = (config.linguaplay_deepseek_key || '').trim();
    const openrouterKey = (config.linguaplay_openrouter_key || '').trim();
    const openrouterModel = (config.linguaplay_openrouter_model || 'deepseek/deepseek-chat').trim();
    const serverUrl = (config.linguaplay_server_url || 'http://127.0.0.1:8000').trim();

    // 1. Google Gemini Flash Direct
    if (provider === 'gemini') {
      if (!geminiKey) throw new Error('Missing Google Gemini API key. Add it in Extension Settings.');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      
      const contents = [];
      for (const m of messages) {
        if (m.role === 'system') continue;
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        });
      }
      if (contents.length === 0 && messages.length > 0) {
        contents.push({ role: 'user', parts: [{ text: messages[0].content }] });
      }

      const sysMsg = messages.find(m => m.role === 'system');
      const body = {
        contents,
        generationConfig: isJson ? { responseMimeType: 'application/json' } : {}
      };
      if (sysMsg) {
        body.systemInstruction = { parts: [{ text: sysMsg.content }] };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini API returned status ${res.status}`);
      }
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // 2. DeepSeek Direct API
    if (provider === 'deepseek') {
      if (!deepseekKey) throw new Error('Missing DeepSeek API key. Add it in Extension Settings.');
      const url = 'https://api.deepseek.com/v1/chat/completions';
      const body = {
        model: 'deepseek-chat',
        messages: messages,
        response_format: isJson ? { type: 'json_object' } : undefined
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekKey}`
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `DeepSeek API returned status ${res.status}`);
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }

    // 3. OpenRouter Direct API
    if (provider === 'openrouter') {
      if (!openrouterKey) throw new Error('Missing OpenRouter API key. Add it in Extension Settings.');
      const url = 'https://openrouter.ai/api/v1/chat/completions';
      const body = {
        model: openrouterModel,
        messages: messages,
        response_format: isJson ? { type: 'json_object' } : undefined
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openrouterKey}`,
          'HTTP-Referer': 'https://linguaplay.app',
          'X-Title': 'LinguaPlay'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(14000)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `OpenRouter API returned status ${res.status}`);
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }

    // 4. OpenCode Custom Endpoint
    if (provider === 'opencode') {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'CALL_CUSTOM_AI', messages, isJson }, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!response || !response.success) {
            reject(new Error(response?.error || 'Custom endpoint request failed'));
          } else {
            resolve(response.content);
          }
        });
      });
    }

    // 5. Antigravity CLI Local Server
    if (provider === 'antigravity') {
      const localAiTimeout = 120000;
      if (isJson) {
        try {
          const res = await fetch(`${serverUrl}/api/ai/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word, romaji, sentence, ...(prompt ? { prompt } : {}), provider: 'antigravity' }),
            signal: AbortSignal.timeout(localAiTimeout)
          });
          const raw = await res.json().catch(() => ({}));
          if (!res.ok || raw.status === 'error') throw new Error(raw.message || `Local server returned ${res.status}`);
          return JSON.stringify(raw.data || raw);
        } catch (error) {
          if (error.name === 'TimeoutError') throw new Error('Local AI did not respond within two minutes. Click Ask Sensei to try again.');
          throw error;
        }
      } else {
        const res = await fetch(`${serverUrl}/api/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, word, romaji, sentence }),
          signal: AbortSignal.timeout(localAiTimeout)
        });
        const raw = await res.json().catch(() => ({}));
        if (!res.ok || raw.status === 'error') throw new Error(raw.message || `Local server chat returned ${res.status}`);
        const reply = raw.reply || raw.content;
        if (typeof reply !== 'string' || !reply.trim()) throw new Error('Local server returned an empty chat reply.');
        return reply;
      }
    }

    throw new Error(`Unsupported AI provider: ${provider}`);
  }

  // ── Sensei AI Song Identification ──
  function parseSongMetadataJson(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const cleaned = raw.replace(/```json|```/gi, '').trim();
    const extractFields = (obj) => {
      const data = obj?.data && typeof obj.data === 'object' ? obj.data : obj;
      if (data && typeof data === 'object' && (data.trackName || data.artistName)) {
        return {
          trackName: String(data.trackName || '').trim(),
          artistName: String(data.artistName || '').trim(),
          animeName: String(data.animeName || '').trim()
        };
      }
      return null;
    };
    try {
      const parsed = extractFields(JSON.parse(cleaned));
      if (parsed) return parsed;
    } catch { /* try regex extraction */ }
    const match = cleaned.match(/\\{[\\s\\S]*\\}/);
    if (match) {
      try {
        const parsed = extractFields(JSON.parse(match[0]));
        if (parsed) return parsed;
      } catch { /* ignore */ }
    }
    return null;
  }

  async function identifySongWithSensei(title, channel, options = {}) {
    if (!title || typeof title !== 'string') return null;
    return new Promise((resolve) => {
      if (!chrome.storage?.local) {
        resolve(null);
        return;
      }
      chrome.storage.local.get([
        'linguaplay_ai_provider',
        'linguaplay_gemini_key',
        'linguaplay_deepseek_key',
        'linguaplay_openrouter_key',
        'linguaplay_openrouter_model',
        'linguaplay_opencode_url',
        'linguaplay_opencode_key',
        'linguaplay_opencode_model',
        'linguaplay_server_url'
      ], async (cfg) => {
        try {
          const primaryProvider = getSenseiProvider(cfg);
          const hasKey = cfg.linguaplay_gemini_key || cfg.linguaplay_deepseek_key || cfg.linguaplay_openrouter_key || cfg.linguaplay_opencode_key || cfg.linguaplay_opencode_url || primaryProvider === 'antigravity' || primaryProvider === 'opencode';
          if (!hasKey) {
            resolve({ error: 'Please set up an AI API key (Gemini, DeepSeek, etc.) in LinguaPlay settings to use Sensei AI.' });
            return;
          }

          const prompt = `You are Sensei, an expert in Japanese music, anime soundtracks, and J-pop.
Given this YouTube music video title and channel:
Title: "${title.replace(/"/g, '\\"')}"
Channel: "${(channel || '').replace(/"/g, '\\"')}"

Extract the song metadata:
1. "trackName": The real Japanese song title (strip "OP", "ED", "Theme", "MV", "Full", parenthetical translations, etc.).
2. "artistName": The actual performing music artist/singer (NOT the anime series name, anime studio, or YouTube reposter). If the song is an anime theme and the singer is not named in the title, use your knowledge of the official soundtrack release to provide the real artist name.
3. "animeName": The anime series name if applicable, or empty string.

Respond in JSON only:
{"trackName": "...", "artistName": "...", "animeName": "..."}`;

          const candidateProviders = [primaryProvider];
          if (cfg.linguaplay_gemini_key && !candidateProviders.includes('gemini')) candidateProviders.push('gemini');
          if (cfg.linguaplay_deepseek_key && !candidateProviders.includes('deepseek')) candidateProviders.push('deepseek');
          if (cfg.linguaplay_openrouter_key && !candidateProviders.includes('openrouter')) candidateProviders.push('openrouter');
          if ((cfg.linguaplay_opencode_key || cfg.linguaplay_opencode_url) && !candidateProviders.includes('opencode')) candidateProviders.push('opencode');
          if (!candidateProviders.includes('antigravity')) candidateProviders.push('antigravity');

          let lastError = null;
          for (const prov of candidateProviders) {
            try {
              if (prov === 'antigravity' && options?.ensureServer && chrome.runtime?.sendMessage) {
                await new Promise(r => {
                  try {
                    chrome.runtime.sendMessage({ action: 'ENSURE_LOCAL_SERVER' }, () => {
                      void chrome.runtime?.lastError;
                      r();
                    });
                  } catch {
                    r();
                  }
                });
              }

              const raw = await callSenseiLlmApi({
                messages: [{ role: 'user', content: prompt }],
                isJson: true,
                config: { ...cfg, linguaplay_ai_provider: prov },
                word: title,
                romaji: '',
                sentence: title,
                prompt
              });

              let parsed = parseSongMetadataJson(raw);
              if (!parsed && prov === 'antigravity') {
                const chatRaw = await callSenseiLlmApi({
                  messages: [{ role: 'user', content: prompt }],
                  isJson: false,
                  config: { ...cfg, linguaplay_ai_provider: 'antigravity' },
                  word: title,
                  romaji: '',
                  sentence: title
                });
                parsed = parseSongMetadataJson(chatRaw);
              }

              if (parsed && (parsed.trackName || parsed.artistName)) {
                resolve(parsed);
                return;
              }
            } catch (err) {
              lastError = err;
              console.warn(`[LinguaPlay] identifySongWithSensei (${prov}) error:`, err);
            }
          }

          if (lastError) {
            resolve({ error: lastError.message });
            return;
          }
          resolve(null);
        } catch (e) {
          console.warn('[LinguaPlay] identifySongWithSensei error:', e);
          resolve({ error: e.message });
        }
      });
    });
  }

  // ── Fetch Synced Lyrics from LRCLIB & Kugou (with Heuristic + Sensei AI Fallback) ──
  async function fetchLrclibLyrics(title, channel, duration) {
    try {
      const meta = cleanSongTitle(title, channel);
      const queryApi = (t, a, q) => new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'FETCH_LRCLIB_LYRICS',
          trackName: t,
          artistName: a,
          query: q,
          duration: duration || 0
        }, res => {
          if (chrome.runtime?.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(res);
          }
        });
      });

      // 1. Try heuristic extraction first (0ms)
      let response = null;
      if (meta.trackName || meta.query) {
        response = await queryApi(meta.trackName, meta.artistName, meta.query);
      }

      if (response && response.success && response.syncedLyrics) {
        const cues = parseLRC(response.syncedLyrics);
        if (cues && cues.length > 0) {
          return {
            cues,
            trackName: response.trackName || meta.trackName,
            artistName: response.artistName || meta.artistName,
            provider: response.provider || 'lrclib',
            syncedLyrics: response.syncedLyrics
          };
        }
      }

      // 2. Auto-fallback to Sensei AI if heuristic search found nothing
      const aiMeta = await identifySongWithSensei(title, channel);
      if (aiMeta && !aiMeta.error && (aiMeta.trackName || aiMeta.artistName)) {
        const aiQuery = [aiMeta.artistName, aiMeta.trackName].filter(Boolean).join(' ');
        response = await queryApi(aiMeta.trackName, aiMeta.artistName, aiQuery);
        if (response && response.success && response.syncedLyrics) {
          const cues = parseLRC(response.syncedLyrics);
          if (cues && cues.length > 0) {
            return {
              cues,
              trackName: response.trackName || aiMeta.trackName,
              artistName: response.artistName || aiMeta.artistName,
              provider: response.provider || 'lrclib',
              isAi: true,
              syncedLyrics: response.syncedLyrics
            };
          }
        }
      }
    } catch (e) {
      console.warn('[LinguaPlay] LRCLIB lyrics fetch failed:', e);
    }
    return null;
  }

  function getYouTubeVideoMetadata() {
    let title = '';
    let channel = '';

    const watchFlexy = document.querySelector('ytd-watch-flexy');
    const flexyVideoId = watchFlexy?.getAttribute?.('video-id');
    const isWatchDomCurrent = !flexyVideoId || !currentVideoId || flexyVideoId === currentVideoId;

    if (isWatchDomCurrent) {
      const titleEl = document.querySelector('ytd-watch-metadata h1 yt-formatted-string') ||
                      document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
                      document.querySelector('h1.title yt-formatted-string') ||
                      document.querySelector('#title h1 yt-formatted-string') ||
                      document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string') ||
                      document.querySelector('h1.ytd-video-primary-info-renderer');
      if (titleEl && titleEl.textContent && titleEl.textContent.trim()) {
        title = titleEl.textContent.trim();
      }
    }

    if (!title && document.title) {
      const docT = document.title.replace(/^\\(\\d+\\)\\s*/, '').replace(/\\s*-\\s*YouTube$/i, '').trim();
      if (docT && !/^YouTube$/i.test(docT)) {
        title = docT;
      }
    }

    if (!title && isWatchDomCurrent) {
      const metaTitle = document.querySelector('meta[name="title"]') || document.querySelector('meta[property="og:title"]');
      if (metaTitle && metaTitle.content && metaTitle.content.trim()) {
        title = metaTitle.content.trim();
      }
    }

    if (isWatchDomCurrent) {
      const channelEl = document.querySelector('ytd-watch-metadata #upload-info #channel-name a') ||
                        document.querySelector('ytd-watch-metadata ytd-channel-name a') ||
                        document.querySelector('#upload-info #channel-name a') ||
                        document.querySelector('ytd-channel-name a') ||
                        document.querySelector('#owner-name a');
      if (channelEl && channelEl.textContent && channelEl.textContent.trim()) {
        channel = channelEl.textContent.trim();
      }
    }

    return { title, channel };
  }

  // ── Render Tokens into Subtitle Overlay ──
  function renderSentenceTokens(sentenceText) {
    const renderVersion = ++subtitleRenderVersion;
    const videoId = currentVideoId;
    renderedSentence = sentenceText || '';
    const container = document.getElementById('linguaplay-yt-tokens');
    const overlay = document.getElementById('linguaplay-yt-tokens-overlay');
    const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
    if (!container) return;

    if (!sentenceText || !sentenceText.trim() || !hasJapaneseCharacters(sentenceText)) {
      container.innerHTML = '';
      if (overlay) overlay.classList.remove('active');
      if (player) player.classList.remove('linguaplay-has-japanese');
      return;
    }

    if (overlay) overlay.classList.add('active');
    if (player) player.classList.add('linguaplay-has-japanese');

    const tokens = tokenize(sentenceText);
    if (japaneseParser && !japaneseParser.cached(sentenceText)) {
      japaneseParser.request(sentenceText).then(parsed => {
        if (parsed && renderVersion === subtitleRenderVersion && videoId === currentVideoId && renderedSentence === sentenceText) {
          renderSentenceTokens(sentenceText);
        }
      });
    }
    container.innerHTML = '';

    let offset = 0;
    tokens.forEach(tk => {
      if (!tk.surface.trim()) return;
      const start = Number.isInteger(tk.start) ? tk.start : sentenceText.indexOf(tk.surface, offset);
      const token = { ...tk, start, end: Number.isInteger(tk.end) ? tk.end : start + tk.surface.length };
      offset = token.end;
      const span = document.createElement('span');
      span.className = 'linguaplay-yt-token';
      span.dataset.word = tk.surface;
      span.dataset.romaji = tk.romaji;
      span.dataset.baseform = tk.baseForm;

      let reading = tk.furigana || tk.reading;
      let hiddenClass = '';
      if (readingMode === 'romaji') {
        reading = tk.romaji || tk.furigana;
      } else if (readingMode === 'hidden') {
        hiddenClass = 'hidden-reading';
      }

      const readingSpan = document.createElement('span');
      readingSpan.className = `linguaplay-token-reading ${hiddenClass}`;
      readingSpan.textContent = reading || '\\u00a0';
      const surfaceSpan = document.createElement('span');
      surfaceSpan.className = 'linguaplay-jp-text';
      surfaceSpan.textContent = tk.surface;
      span.appendChild(readingSpan);
      span.appendChild(surfaceSpan);

      span.addEventListener('click', (e) => {
        e.stopPropagation();
        handleTokenClick(token, sentenceText);
      });

      container.appendChild(span);
    });
  }

  // ── High-Speed Instant Sentence Translation Cache & Fetcher (Client-Side) ──
  const sentenceTranslationCache = new Map();

  async function fetchSentenceTranslation(sentence) {
    if (!sentence || !sentence.trim()) return '';
    const clean = sentence.trim();
    if (sentenceTranslationCache.has(clean)) {
      return sentenceTranslationCache.get(clean);
    }
    try {
      const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=en&dt=t&q=${encodeURIComponent(clean)}`, {
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const data = await res.json();
        let translation = '';
        if (data && data[0] && Array.isArray(data[0])) {
          translation = data[0].map(segment => segment[0]).filter(Boolean).join('');
        }
        if (translation) {
          sentenceTranslationCache.set(clean, translation);
          return translation;
        }
      }
    } catch (e) {
      console.warn('[LinguaPlay] Sentence translation fetch error:', e);
    }
    return '';
  }

  // ── Switch Drawer Navigation Tab (Breakdown vs Sensei Chatbot) ──
  function switchDrawerTab(tab) {
    const tabBreakdownBtn = document.getElementById('lp-tab-breakdown-btn');
    const tabChatBtn = document.getElementById('lp-tab-chat-btn');
    const viewBreakdown = document.getElementById('lp-view-breakdown');
    const viewChat = document.getElementById('lp-view-chat');

    if (tab === 'chat') {
      if (viewBreakdown) viewBreakdown.style.display = 'none';
      if (viewChat) viewChat.style.display = 'block';
      if (tabChatBtn) tabChatBtn.classList.add('active');
      if (tabBreakdownBtn) tabBreakdownBtn.classList.remove('active');

      const sentJpEl = document.getElementById('lp-sentence-jp');
      const sentRomajiEl = document.getElementById('lp-sentence-romaji');
      const sentEnEl = document.getElementById('lp-sentence-en');
      const sentSpeedEl = document.getElementById('lp-sentence-speed');
      const chatContextEl = document.getElementById('lp-chat-context-sentence');
      const chatRomajiEl = document.getElementById('lp-chat-sentence-romaji');
      const chatEnEl = document.getElementById('lp-chat-sentence-en');
      const chatBadgeEl = document.getElementById('lp-sensei-provider-badge');

      if (chatContextEl) {
        if (sentJpEl && sentJpEl.innerHTML) {
          chatContextEl.innerHTML = sentJpEl.innerHTML;
        } else {
          chatContextEl.textContent = drawerContextSentence || activeLiveSentence || '';
        }
      }
      if (chatRomajiEl && sentRomajiEl) {
        chatRomajiEl.innerHTML = sentRomajiEl.innerHTML;
        chatRomajiEl.style.display = sentRomajiEl.style.display;
      }
      if (chatEnEl && sentEnEl) {
        chatEnEl.innerHTML = sentEnEl.innerHTML;
      }
      if (chatBadgeEl && (!chatBadgeEl.textContent || chatBadgeEl.textContent === 'Instant')) {
        chatBadgeEl.textContent = sentSpeedEl ? sentSpeedEl.textContent : 'Instant';
      }

      const chatInputEl = document.getElementById('lp-chat-input');
      if (chatInputEl) {
        setTimeout(() => chatInputEl.focus(), 50);
      }
    } else {
      if (viewBreakdown) viewBreakdown.style.display = 'block';
      if (viewChat) viewChat.style.display = 'none';
      if (tabBreakdownBtn) tabBreakdownBtn.classList.add('active');
      if (tabChatBtn) tabChatBtn.classList.remove('active');
    }
  }

  // Use the outer sidebar: Mix/playlist panels may precede #secondary-inner.
  function ensureDrawerPlacement() {
    const drawer = playerUI?.drawer || document.getElementById('linguaplay-yt-drawer');
    if (!drawer) return;
    const sidebar = ['#secondary', '#secondary-inner', '#related']
      .map(selector => document.querySelector(selector))
      .find(element => element && element.offsetParent !== null) || null;
    if (sidebar) {
      drawer.classList.remove('floating-fallback');
      if (drawer.parentElement !== sidebar || sidebar.firstChild !== drawer) sidebar.insertBefore(drawer, sidebar.firstChild);
    } else {
      drawer.classList.add('floating-fallback');
      if (drawer.parentElement !== document.body) document.body.appendChild(drawer);
    }
    if (drawerSidebar !== sidebar) {
      if (drawerPlacementObserver) drawerPlacementObserver.disconnect();
      drawerSidebar = sidebar;
      if (sidebar) {
        drawerPlacementObserver = new MutationObserver(ensureDrawerPlacement);
        // Watch direct sidebar children only; translation/chat updates should
        // not trigger repositioning or an observer loop.
        drawerPlacementObserver.observe(sidebar, { childList: true });
      }
    }
  }

  // ── Handle Word Click (Non-Interrupting & Side-Panel Integration) ──
  function updateSenseiChatControls() {
    const busy = activeSenseiChatRequest?.contextVersion === drawerContextVersion;
    const sendButton = document.getElementById('lp-chat-send-btn');
    if (sendButton) sendButton.disabled = busy;
    document.querySelectorAll('.lp-chat-chip').forEach(button => { button.disabled = busy; });
    document.getElementById('lp-chat-messages')?.setAttribute('aria-busy', String(busy));
  }

  function handleTokenClick(token, sentenceContext) {
    const drawer = playerUI?.drawer || document.getElementById('linguaplay-yt-drawer');
    if (!drawer) return;
    ensureDrawerPlacement();

    const wordEl = document.getElementById('lp-active-word');
    const romajiEl = document.getElementById('lp-active-romaji');
    const posEl = document.getElementById('lp-active-pos');
    const defEl = document.getElementById('lp-active-def');
    const aiResults = document.getElementById('lp-ai-results');
    const aiLoading = document.getElementById('lp-ai-loading');
    const aiAnkiBtn = document.getElementById('lp-ai-anki-btn');
    const chatBox = document.getElementById('lp-sensei-chat-box');
    const chatMessages = document.getElementById('lp-chat-messages');
    const chatInput = document.getElementById('lp-chat-input');

    const sentenceWrap = document.getElementById('lp-sentence-wrapper');
    const sentJpEl = document.getElementById('lp-sentence-jp');
    const sentRomajiEl = document.getElementById('lp-sentence-romaji');
    const sentEnEl = document.getElementById('lp-sentence-en');
    const sentSpeedEl = document.getElementById('lp-sentence-speed');

    const chatSentenceWrap = document.getElementById('lp-chat-sentence-wrapper');
    const chatContextEl = document.getElementById('lp-chat-context-sentence');
    const chatRomajiEl = document.getElementById('lp-chat-sentence-romaji');
    const chatEnEl = document.getElementById('lp-chat-sentence-en');
    const chatBadgeEl = document.getElementById('lp-sensei-provider-badge');

    const readingData = token.furigana && token.romaji
      ? { furigana: token.furigana, romaji: token.romaji } : getWordReading(token.surface);
    const displayReading = readingData.romaji && readingData.furigana !== readingData.romaji
      ? `${readingData.furigana} (${readingData.romaji})`
      : readingData.furigana;

    wordEl.textContent = token.surface;
    romajiEl.textContent = displayReading;
    if (token.baseForm && token.baseForm !== token.surface) {
      posEl.textContent = `(Base: ${token.baseForm})`;
      posEl.style.display = 'inline';
    } else {
      posEl.textContent = '';
      posEl.style.display = 'none';
    }
    drawerContextVersion++;
    drawerActiveWord = token.surface || '';
    drawerContextSentence = (sentenceContext || token.surface || '').trim();
    const contextVersion = drawerContextVersion;
    const leadingWhitespace = (sentenceContext || '').length - (sentenceContext || '').trimStart().length;
    const selectedStart = Number.isInteger(token.start) ? token.start - leadingWhitespace : null;
    let definitionBase = null;
    function updateDefinition(selected) {
      const base = selected.baseForm || selected.surface;
      if (definitionBase === base) return;
      definitionBase = base;
      const local = JDICT[base] || JDICT[selected.surface];
      if (local) { defEl.innerHTML = local; return; }
      defEl.innerHTML = '<span style="opacity:0.6;">Looking up definition…</span>';
      fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=en&dt=t&q=${encodeURIComponent(base)}`)
        .then(r => r.json()).then(d => {
          if (drawerContextVersion !== contextVersion || definitionBase !== base) return;
          defEl.textContent = d?.[0]?.map(s => s[0]).filter(Boolean).join('') || 'No definition found';
        }).catch(() => {
          if (drawerContextVersion === contextVersion && definitionBase === base) defEl.textContent = 'Click Ask Antigravity AI below for deep analysis.';
        });
    }

    if (japaneseParser) {
      const contextSentence = drawerContextSentence;
      refreshDrawerParsing = () => japaneseParser.request(contextSentence).then(parsed => {
        if (!parsed || contextVersion !== drawerContextVersion || contextSentence !== drawerContextSentence) return;
        let selected = parsed.find(item => item.surface === token.surface && (selectedStart === null || item.start === selectedStart));
        if (!selected) {
          const morpheme = parsed.flatMap(item => Array.isArray(item.morphemes) ? item.morphemes : [])
            .find(item => item.surface === token.surface && (selectedStart === null || item.start === selectedStart));
          if (morpheme) selected = japaneseParser.readingToken(morpheme);
        }
        if (selected) {
          romajiEl.textContent = `${selected.furigana} (${selected.romaji})`;
          posEl.textContent = selected.baseForm !== token.surface ? `(Base: ${selected.baseForm})` : '';
          posEl.style.display = selected.baseForm !== token.surface ? 'inline' : 'none';
          updateDefinition(selected);
        }
        const html = japaneseParser.romaji(contextSentence, token.surface);
        if (html != null) {
          if (sentRomajiEl) sentRomajiEl.innerHTML = html;
          if (chatRomajiEl) chatRomajiEl.innerHTML = html;
        }
      });
      refreshDrawerParsing();
    }

    // Instant Sentence Context & Romaji Rendering
    if (sentenceWrap && sentJpEl && sentEnEl) {
      const activeText = drawerContextSentence;
      if (activeText) {
        sentenceWrap.style.display = 'block';
        if (chatSentenceWrap) chatSentenceWrap.style.display = 'block';

        if (token.surface && activeText.includes(token.surface)) {
          const parts = activeText.split(token.surface);
          const highlightedJp = parts.join(`<span style="color:#a78bfa; font-weight:bold; background:rgba(167,139,250,0.2); padding:1px 4px; border-radius:4px;">${token.surface}</span>`);
          sentJpEl.innerHTML = highlightedJp;
          if (chatContextEl) chatContextEl.innerHTML = highlightedJp;
        } else {
          sentJpEl.textContent = activeText;
          if (chatContextEl) chatContextEl.textContent = activeText;
        }

        if (sentRomajiEl) {
          const romajiHtml = generateSentenceRomaji(activeText, token.surface);
          sentRomajiEl.innerHTML = romajiHtml;
          sentRomajiEl.style.display = romajiHtml ? 'block' : 'none';
          if (chatRomajiEl) {
            chatRomajiEl.innerHTML = romajiHtml;
            chatRomajiEl.style.display = romajiHtml ? 'block' : 'none';
          }
        }

        if (sentenceTranslationCache.has(activeText)) {
          const trans = sentenceTranslationCache.get(activeText);
          sentEnEl.textContent = trans;
          if (chatEnEl) chatEnEl.textContent = trans;
          if (sentSpeedEl) sentSpeedEl.textContent = '0ms (Cached)';
          if (chatBadgeEl && (!chatBadgeEl.textContent || chatBadgeEl.textContent === 'Instant')) chatBadgeEl.textContent = '0ms (Cached)';
        } else {
          sentEnEl.innerHTML = '<span style="opacity:0.6; font-size:12px;">⚡ Translating sentence...</span>';
          if (chatEnEl) chatEnEl.innerHTML = '<span style="opacity:0.6; font-size:12px;">⚡ Translating sentence...</span>';
          if (sentSpeedEl) sentSpeedEl.textContent = 'Translating...';
          const targetSentence = activeText;
          fetchSentenceTranslation(targetSentence).then(trans => {
            if (drawerContextSentence.trim() === targetSentence) {
              if (trans) {
                sentEnEl.textContent = trans;
                if (chatEnEl) chatEnEl.textContent = trans;
                if (sentSpeedEl) sentSpeedEl.textContent = 'Instant';
                if (chatBadgeEl && (!chatBadgeEl.textContent || chatBadgeEl.textContent === 'Instant')) chatBadgeEl.textContent = 'Instant';
              } else {
                sentEnEl.textContent = 'Sentence translation unavailable';
                if (chatEnEl) chatEnEl.textContent = 'Sentence translation unavailable';
                if (sentSpeedEl) sentSpeedEl.textContent = '';
              }
            }
          });
        }
      } else {
        sentenceWrap.style.display = 'none';
        if (chatSentenceWrap) chatSentenceWrap.style.display = 'none';
      }
    }

    aiResults.innerHTML = '';
    aiResults.style.display = 'none';
    aiLoading.style.display = 'none';
    aiAnkiBtn.style.display = 'none';
    if (chatBox) chatBox.style.display = 'none';
    if (chatMessages) chatMessages.innerHTML = '';
    if (chatInput) chatInput.value = '';
    senseiChatHistory = [];
    activeSenseiChatRequest = null;
    updateSenseiChatControls();
    lastAiData = null;

    if (typeof switchDrawerTab === 'function') {
      switchDrawerTab('breakdown');
    }

    updateDefinition(token);

    drawer.classList.remove('hidden');
    drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── Render Full Structured Pedagogical AI Breakdown (Horizontal Gloss) ──
  function renderPedagogicalBreakdown(aiJson, providerTitle) {
    const data = aiJson.data || aiJson;
    const wordByWord = data.word_by_word || data.sentence_breakdown || [];

    // Helper to resolve clean Romaji for each horizontal gloss card
    function getCardRomaji(w) {
      if (w.romaji && typeof w.romaji === 'string' && w.romaji.trim()) {
        return w.romaji.trim();
      }
      if (w.word === 'は' || (w.reading === 'は' && (w.role || '').toLowerCase().includes('topic'))) {
        return 'wa';
      }
      if (w.word === 'へ' || (w.reading === 'へ' && (w.role || '').toLowerCase().includes('direction'))) {
        return 'e';
      }
      if (w.word === 'を' || w.reading === 'を') {
        return 'o';
      }
      const raw = w.reading || w.word || '';
      if (typeof window !== 'undefined' && window.wanakana && window.wanakana.toRomaji) {
        return window.wanakana.toRomaji(raw);
      }
      return raw;
    }

    let html = `
      <div class="linguaplay-card-wrapper">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:10px; color:#a78bfa; font-weight:bold; text-transform:uppercase; letter-spacing:0.05em;">📖 Horizontal Word-by-Word Gloss</span>
          <span style="font-size:9.5px; color:#6ee7b7; font-weight:600;">${providerTitle}</span>
        </div>

        ${wordByWord.length > 0 ? `
          <div class="linguaplay-gloss-container">
            ${wordByWord.map(w => {
              const r = getCardRomaji(w);
              return `
                <div class="linguaplay-gloss-card ${w.is_target ? 'is-target' : ''}" title="${w.word} (${r}) — ${w.meaning || ''} ${w.role ? '[' + w.role + ']' : ''}">
                  <span class="linguaplay-gloss-reading" style="font-family:monospace; font-size:11px; color:#fda4af;">${r || '&nbsp;'}</span>
                  <span class="linguaplay-gloss-jp">${w.word}</span>
                  <span class="linguaplay-gloss-en">${w.meaning || ''}</span>
                </div>
              `;
            }).join('')}
          </div>
          <div style="margin-top:10px; display:flex; justify-content:flex-end;">
            <button id="lp-goto-chat-btn" style="background:rgba(124,58,237,0.22); border:1px solid rgba(167,139,250,0.4); color:#c4b5fd; font-size:11px; font-weight:600; padding:5px 12px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:5px; transition:all 0.2s;">
              <span>💬 Ask Sensei in Chat</span> <span>→</span>
            </button>
          </div>
        ` : `
          <div style="font-size:12px; color:#94a3b8; font-style:italic;">No word-by-word gloss available for this sentence.</div>
        `}
      </div>
    `;

    return html;
  }

  // ── Hook Live YouTube Closed Captions (DOM & textTracks) ──
  function setupLiveCaptionHooking() {
    if (liveCaptionObserver) liveCaptionObserver.disconnect();
    const observer = new MutationObserver(() => {
      const captionContainer = document.querySelector('.ytp-caption-window-container') || document.querySelector('.caption-window');
      if (captionContainer) {
        const segs = captionContainer.querySelectorAll('.ytp-caption-segment');
        if (segs.length > 0) {
          const text = Array.from(segs).map(s => s.textContent || '').join(' ').trim();
          if (text && text !== activeLiveSentence && subtitleTimeline.length === 0) {
            if (hasJapaneseCharacters(text)) {
              activeLiveSentence = text;
              renderSentenceTokens(text);
            } else {
              activeLiveSentence = '';
              renderSentenceTokens('');
            }
          }
        } else if (activeLiveSentence && subtitleTimeline.length === 0) {
          activeLiveSentence = '';
          renderSentenceTokens('');
        }
      }
    });

    const target = document.querySelector('#movie_player') || document.body;
    observer.observe(target, { childList: true, subtree: true, characterData: true });
    liveCaptionObserver = observer;

    if (activeVideoEl && activeVideoEl.textTracks) {
      for (let i = 0; i < activeVideoEl.textTracks.length; i++) {
        const track = activeVideoEl.textTracks[i];
        track.oncuechange = () => {
          if (subtitleTimeline.length === 0) {
            if (track.activeCues && track.activeCues.length > 0) {
              const cueText = track.activeCues[0].text;
              if (cueText && hasJapaneseCharacters(cueText)) {
                activeLiveSentence = cueText;
                renderSentenceTokens(cueText);
              } else {
                activeLiveSentence = '';
                renderSentenceTokens('');
              }
            } else if (activeLiveSentence) {
              activeLiveSentence = '';
              renderSentenceTokens('');
            }
          }
        };
      }
    }
  }

  function updateSubtitleVisibility() {
    // Keep rendering and requests running; only suppress their presentation.
    // This page-session flag survives YouTube navigation without changing
    // the drawer's own open/closed state or the selected reading mode.
    document.documentElement.classList.toggle('linguaplay-subtitles-hidden', areSubtitlesHidden);
    const button = playerUI?.visibilityToggle;
    if (!button) return;
    const label = areSubtitlesHidden ? 'Show subtitles and translation' : 'Hide subtitles and translation';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(areSubtitlesHidden));
  }

  function updateWidgetState() {
    updateSubtitleVisibility();
    const widget = playerUI?.widget;
    if (!widget) return;
    if (isPanelCollapsed) {
      widget.classList.add('collapsed');
    } else {
      widget.classList.remove('collapsed');
    }
    playerUI.settingsToggle.setAttribute('aria-expanded', String(!isPanelCollapsed));
  }

  function setPanelCollapsed(collapsed) {
    isPanelCollapsed = collapsed;
    chrome.storage.local.set({ linguaplay_panel_collapsed: collapsed });
    updateWidgetState();
  }

  function ensurePlayerControls() {
    if (!playerUI) return;
    ensureDrawerPlacement();
    const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player') || document.querySelector('video')?.parentElement;
    if (!player) {
      playerUI.controls.remove();
      playerUI.widget.hidden = true;
      return;
    }
    const { controls, widget, overlay } = playerUI;
    if (overlay.parentElement !== player) player.appendChild(overlay);
    if (widget.parentElement !== player) player.appendChild(widget);
    if (playerUI.player !== player) {
      playerUI.player = player;
      setupLiveCaptionHooking();
    }
    const rightControls = player.querySelector('.ytp-right-controls');
    widget.hidden = !rightControls;
    if (!rightControls) {
      controls.remove();
      return;
    }
    const cc = rightControls.querySelector('.ytp-subtitles-button');
    const anchor = cc?.parentElement === rightControls ? cc : Array.from(rightControls.children).find(child => child !== controls) || null;
    if (controls.parentElement !== rightControls || controls.nextElementSibling !== anchor) {
      rightControls.insertBefore(controls, anchor);
    }
    const nativeButton = Array.from(rightControls.querySelectorAll('.ytp-button')).find(button => !controls.contains(button) && button.getBoundingClientRect().width > 0);
    if (nativeButton) controls.style.setProperty('--linguaplay-control-width', `${nativeButton.getBoundingClientRect().width}px`);
    const playerBounds = player.getBoundingClientRect();
    const barBounds = (player.querySelector('.ytp-chrome-bottom') || rightControls).getBoundingClientRect();
    widget.style.bottom = `${Math.max(52, playerBounds.bottom - barBounds.top + 8)}px`;
    widget.style.right = `${Math.max(12, playerBounds.right - barBounds.right)}px`;
  }

  // ── Inject LinguaPlay Interface on YouTube ──
  function injectUI() {
    if (playerUI) {
      ensurePlayerControls();
      return;
    }

    const moviePlayer = document.querySelector('#movie_player') || document.querySelector('.html5-video-player') || document.querySelector('video')?.parentElement;
    if (!moviePlayer) return;

    // 1. Hidden file input for manual .srt/.vtt/.lrc upload on YouTube
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.srt,.vtt,.lrc';
    fileInput.id = 'linguaplay-manual-sub-input';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const content = evt.target.result;
        const cues = parseSubtitleFile(content, file.name);
        if (cues.length > 0) {
          subtitleTimeline = cues;
          const statusBadge = document.getElementById('linguaplay-sub-status');
          if (statusBadge) statusBadge.textContent = `Subs (${cues.length})`;
          updateLyricsModalStatus();
          ensureYouTubeCCEnabled();
          alert(`Loaded ${cues.length} subtitle cues from ${file.name}!`);
        }
      };
      reader.readAsText(file);
    });

    // 2. Subtitle Tokens Area (Centered Bottom of Video)
    const overlay = document.createElement('div');
    overlay.id = 'linguaplay-yt-tokens-overlay';
    overlay.innerHTML = `<div id="linguaplay-yt-tokens"></div>`;
    moviePlayer.appendChild(overlay);

    // 3. Settings panel above the native player control bar.
    const widget = document.createElement('div');
    widget.id = 'linguaplay-yt-widget';
    if (isPanelCollapsed) widget.classList.add('collapsed');

    widget.innerHTML = `
      <div id="linguaplay-yt-bar" role="group" aria-label="LinguaPlay settings">
        <span style="font-size: 11px; font-weight: bold; color: #a78bfa; margin-right: 2px; display:flex; align-items:center; gap:3px;">
          <span>言</span> <span>LinguaPlay</span>
        </span>
        <button class="linguaplay-bar-btn ${readingMode === 'furigana' ? 'active' : ''}" data-mode="furigana">Furigana</button>
        <button class="linguaplay-bar-btn ${readingMode === 'romaji' ? 'active' : ''}" data-mode="romaji">Romaji</button>
        <button class="linguaplay-bar-btn ${readingMode === 'hidden' ? 'active' : ''}" data-mode="hidden">Hidden</button>
        <span style="width: 1px; height: 12px; background: rgba(255,255,255,0.2); margin: 0 1px;"></span>
        <button class="linguaplay-bar-btn" id="linguaplay-offset-sub" title="Advance -0.1s">-0.1s</button>
        <span id="linguaplay-offset-display" style="font-size: 10px; font-family: monospace; color: #cbd5e1; padding: 0 1px;">0.0s</span>
        <button class="linguaplay-bar-btn" id="linguaplay-offset-add" title="Delay +0.1s">+0.1s</button>
        <button class="linguaplay-bar-btn" id="linguaplay-repeat-btn" title="Repeat Cue (Shortcut: R)">🔁</button>
        <button class="linguaplay-bar-btn" id="linguaplay-upload-sub-btn" title="Upload Japanese .srt/.vtt/.lrc subtitle file">📁</button>
        <button class="linguaplay-bar-btn" id="linguaplay-fetch-lyrics-btn" title="Lyrics Manager (Search Synced Lyrics & Audio Timing)" style="background:rgba(124,58,237,0.35); border-color:#a78bfa; color:#fff; font-weight:600;">🎵 Lyrics</button>
        <button class="linguaplay-bar-btn" id="linguaplay-open-app-btn" title="Open in Full LinguaPlay Player Tab" style="background: rgba(124,58,237,0.4); border-color:#a78bfa; color:#fff;">🚀</button>
        <button class="linguaplay-bar-btn" id="linguaplay-open-settings-btn" title="Open Extension Settings" style="background: rgba(124,58,237,0.25); border-color:rgba(167,139,250,0.5); color:#fff;">⚙️</button>
        <button class="linguaplay-bar-btn linguaplay-collapse-btn" id="linguaplay-collapse-btn" title="Collapse Bar">✕</button>
      </div>
    `;
    moviePlayer.appendChild(widget);

    // Buttons inherit YouTube's native control-bar visibility. Retain their
    // references so they can be reattached if YouTube replaces that bar.
    const controls = document.createElement('span');
    controls.id = 'linguaplay-yt-controls';
    controls.innerHTML = `
      <button type="button" class="ytp-button" id="linguaplay-visibility-toggle" title="Hide subtitles and translation" aria-label="Hide subtitles and translation" aria-pressed="false">
        <svg class="linguaplay-eye-open" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>
        </svg>
        <svg class="linguaplay-eye-off" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <path d="m3 3 18 18M10.6 5.1A12 12 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3 4M6.5 6.5A18 18 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.5-1.5M10 10a3 3 0 0 0 4 4"/>
        </svg>
      </button>
      <span id="linguaplay-sub-status" class="linguaplay-sub-status-badge" title="Click to open Lyrics Manager" role="button" tabindex="0"></span>
      <button type="button" class="ytp-button" id="linguaplay-toggle-trigger" title="LinguaPlay settings" aria-label="LinguaPlay settings" aria-controls="linguaplay-yt-bar" aria-expanded="false">
        <span aria-hidden="true">言</span>
      </button>
    `;
    const visibilityToggle = controls.querySelector('#linguaplay-visibility-toggle');
    const subStatusBadge = controls.querySelector('#linguaplay-sub-status');
    const settingsToggle = controls.querySelector('#linguaplay-toggle-trigger');
    playerUI = { player: moviePlayer, controls, widget, overlay, visibilityToggle, subStatusBadge, settingsToggle };

    // 4. Translation Panel (Defaults to Native Sidebar or Body)
    const drawer = document.createElement('div');
    drawer.id = 'linguaplay-yt-drawer';
    drawer.className = 'hidden';
    drawer.innerHTML = `
      <div class="linguaplay-drawer-header">
        <div style="flex:1; min-width:0; padding-right:12px;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:2px;">
            <span id="lp-active-romaji" style="font-size: 13px; color: #fda4af; font-family: monospace; font-weight: 500;"></span>
            <span id="lp-active-pos" style="font-size: 11px; color: #94a3b8;"></span>
          </div>
          <div style="display:flex; align-items:baseline; flex-wrap:wrap; gap:8px;">
            <h3 id="lp-active-word" style="font-size: 26px; font-weight: bold; color: white; margin: 0; line-height: 1.2;"></h3>
            <span id="lp-def-separator" style="color: #a78bfa; font-size: 16px; font-weight: 600;">—</span>
            <span id="lp-active-def" style="font-size: 14px; color: #e2e8f0; line-height: 1.4; font-weight: 500;"></span>
          </div>
        </div>
        <div style="display:flex; gap:6px; align-items:center; flex-shrink:0;">
          <button id="lp-drawer-settings-btn" title="Open Extension Settings" style="background:rgba(255,255,255,0.08); border:none; color:#cbd5e1; font-size:12px; cursor:pointer; padding:5px 8px; border-radius:6px; transition:0.2s;">⚙️ Settings</button>
          <button id="lp-dismiss-btn" style="background:rgba(255,255,255,0.08); border:none; color:#cbd5e1; font-size:12px; cursor:pointer; padding:5px 10px; border-radius:6px; transition:0.2s;">✕ Close</button>
        </div>
      </div>

      <!-- Navigation Tabs: Breakdown vs Sensei Chatbot -->
      <div class="linguaplay-drawer-tabs">
        <button id="lp-tab-breakdown-btn" class="linguaplay-tab-btn active">
          <span>📖</span> <span>Breakdown & Gloss</span>
        </button>
        <button id="lp-tab-chat-btn" class="linguaplay-tab-btn">
          <span>🧑‍🏫</span> <span>Sensei Chat</span>
        </button>
      </div>

      <!-- Tab 1: Breakdown & Sentence View -->
      <div id="lp-view-breakdown">
        <div id="lp-sentence-wrapper" class="linguaplay-card-wrapper" style="display:none; margin-bottom:10px; background:rgba(30,27,75,0.45); border:1px solid rgba(139,92,246,0.3); border-radius:10px; padding:10px 12px;">
          <div style="font-size:10px; font-weight:bold; color:#a78bfa; text-transform:uppercase; margin-bottom:4px; letter-spacing:0.04em; display:flex; justify-content:space-between; align-items:center;">
            <span>💬 Context Sentence</span>
            <span id="lp-sentence-speed" style="font-size:9.5px; color:#34d399; font-weight:600; text-transform:none;"></span>
          </div>
          <div id="lp-sentence-jp" style="font-size:14px; color:#f8fafc; font-weight:500; line-height:1.5; margin-bottom:2px; font-family:'Noto Sans JP',sans-serif;"></div>
          <div id="lp-sentence-romaji" style="font-size:12px; color:#fda4af; font-family:monospace; line-height:1.4; margin-bottom:4px;"></div>
          <div id="lp-sentence-en" style="font-size:13px; color:#cbd5e1; line-height:1.45; font-style:italic;"></div>
        </div>

        <button id="lp-quick-anki-btn" class="linguaplay-btn linguaplay-btn-secondary">
          🗃️ Quick Add to Anki
        </button>

        <button id="lp-ai-btn" class="linguaplay-btn linguaplay-btn-primary">
          ✨ Ask Sensei (AI Grammar Tutor)
        </button>

        <div id="lp-ai-section">
          <div id="lp-ai-loading" style="display:none; font-size: 12px; color: #a78bfa; text-align: center; padding: 10px 0;">
            <span style="display:inline-block; animation:spin 1s linear infinite;">⚡</span> Sensei is analyzing…
          </div>
          <div id="lp-ai-results" style="margin-top: 10px; display: none;"></div>
          <button id="lp-ai-anki-btn" class="linguaplay-btn linguaplay-btn-secondary" style="display:none; margin-top: 8px;">
            🗂️ Save Enriched AI Card to Anki
          </button>
        </div>
      </div>

      <!-- Tab 2: Dedicated Chatbot View -->
      <div id="lp-view-chat" style="display:none;">
        <div id="lp-chat-sentence-wrapper" class="linguaplay-card-wrapper" style="margin-bottom:10px; background:rgba(30,27,75,0.45); border:1px solid rgba(139,92,246,0.3); border-radius:10px; padding:10px 12px;">
          <div style="font-size:10px; font-weight:bold; color:#a78bfa; text-transform:uppercase; margin-bottom:4px; letter-spacing:0.04em; display:flex; justify-content:space-between; align-items:center;">
            <span>💬 Context Sentence</span>
            <span id="lp-sensei-provider-badge" style="font-size:9.5px; color:#34d399; font-weight:600; text-transform:none;"></span>
          </div>
          <div id="lp-chat-context-sentence" style="font-size:14px; color:#f8fafc; font-weight:500; line-height:1.5; margin-bottom:2px; font-family:'Noto Sans JP',sans-serif;"></div>
          <div id="lp-chat-sentence-romaji" style="font-size:12px; color:#fda4af; font-family:monospace; line-height:1.4; margin-bottom:4px;"></div>
          <div id="lp-chat-sentence-en" style="font-size:13px; color:#cbd5e1; line-height:1.45; font-style:italic;"></div>
        </div>

        <div class="lp-chat-chips-row" style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:10px;">
          <button class="lp-chat-chip" data-prompt="Why is this particle used here?">Why this particle?</button>
          <button class="lp-chat-chip" data-prompt="Break down the grammar step-by-step.">Grammar breakdown</button>
          <button class="lp-chat-chip" data-prompt="Give me 2 more natural example sentences with this word.">2 More examples</button>
          <button class="lp-chat-chip" data-prompt="Explain the nuance and politeness level.">Nuance & Politeness</button>
        </div>

        <div id="lp-chat-messages" style="max-height:280px; overflow-y:auto; display:flex; flex-direction:column; gap:8px; margin-bottom:10px; padding-right:4px;"></div>

        <div style="display:flex; gap:6px;">
          <input type="text" id="lp-chat-input" placeholder="Ask Sensei anything about this sentence..." style="flex:1; background:rgba(15,23,42,0.85); border:1px solid rgba(167,139,250,0.3); border-radius:8px; padding:7px 10px; color:#f8fafc; font-size:12px; outline:none;" />
          <button id="lp-chat-send-btn" class="linguaplay-btn linguaplay-btn-primary" style="padding:7px 12px; font-size:12px; width:auto; margin:0; cursor:pointer;">Send</button>
        </div>
      </div>
    `;

    playerUI.drawer = drawer;
    ensureDrawerPlacement();

    // 5. Retractable Widget Toggle Listeners
    visibilityToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      areSubtitlesHidden = !areSubtitlesHidden;
      if (!areSubtitlesHidden) onTimeUpdate();
      updateSubtitleVisibility();
    });
    settingsToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      ensurePlayerControls();
      setPanelCollapsed(!isPanelCollapsed);
    });

    document.getElementById('linguaplay-collapse-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      setPanelCollapsed(true);
      settingsToggle.focus();
    });

    // Stop player shortcuts without preventing native button activation or Tab.
    [controls, widget].forEach(surface => {
      ['click', 'keydown', 'keyup', 'pointerdown', 'pointerup', 'mousedown', 'mouseup'].forEach(eventName => {
        surface.addEventListener(eventName, (e) => e.stopPropagation());
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !isPanelCollapsed) {
        e.preventDefault();
        e.stopPropagation();
        setPanelCollapsed(true);
        settingsToggle.focus();
      }
    }, true);
    document.addEventListener('click', (e) => {
      if (!isPanelCollapsed && !widget.contains(e.target) && !controls.contains(e.target)) setPanelCollapsed(true);
    });

    // 6. Bar Event Listeners
    widget.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        widget.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        readingMode = btn.dataset.mode;
        chrome.storage.local.set({ linguaplay_reading_mode: readingMode });
        if (currentSubIndex >= 0 && subtitleTimeline[currentSubIndex]) {
          renderSentenceTokens(subtitleTimeline[currentSubIndex].text);
        } else if (activeLiveSentence) {
          renderSentenceTokens(activeLiveSentence);
        }
      });
    });

    document.getElementById('linguaplay-offset-sub').addEventListener('click', () => {
      timingOffset = Math.round((timingOffset - 0.1) * 10) / 10;
      updateOffsetDisplay();
    });

    document.getElementById('linguaplay-offset-add').addEventListener('click', () => {
      timingOffset = Math.round((timingOffset + 0.1) * 10) / 10;
      updateOffsetDisplay();
    });

    document.getElementById('linguaplay-repeat-btn').addEventListener('click', () => {
      if (currentSubIndex >= 0 && subtitleTimeline[currentSubIndex] && activeVideoEl) {
        activeVideoEl.currentTime = subtitleTimeline[currentSubIndex].start;
        activeVideoEl.play();
      }
    });

    document.getElementById('linguaplay-upload-sub-btn').addEventListener('click', () => {
      fileInput.click();
    });

    // 4. Lyrics Manager Modal Setup
    let lyricsModal = document.getElementById('linguaplay-lyrics-modal');
    if (!lyricsModal) {
      lyricsModal = document.createElement('div');
      lyricsModal.id = 'linguaplay-lyrics-modal';
      lyricsModal.className = 'hidden';
      lyricsModal.innerHTML = `
        <div style="background:#0f172a; border:1px solid #334155; border-radius:16px; width:92%; max-width:540px; max-height:85vh; overflow-y:auto; padding:20px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.8); font-family:system-ui,-apple-system,sans-serif; color:#f8fafc; z-index:1000000;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid #1e293b; padding-bottom:12px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:22px;">🎵</span>
              <h3 style="margin:0; font-size:17px; font-weight:700; color:#fff;">LinguaPlay Lyrics Manager</h3>
            </div>
            <button id="lp-lyrics-modal-close" style="background:rgba(255,255,255,0.08); border:none; color:#cbd5e1; font-size:16px; width:28px; height:28px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center;">✕</button>
          </div>

          <div id="lp-lyrics-modal-status" style="margin-bottom:14px; padding:10px 14px; background:rgba(30,27,75,0.5); border:1px solid rgba(139,92,246,0.3); border-radius:10px; font-size:12px; color:#c7d2fe; display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span>Active Subtitles: <strong id="lp-modal-active-count">0 cues</strong></span>
              <span id="lp-modal-cache-badge" style="font-size:10px; padding:2px 6px; border-radius:4px; display:none;"></span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span id="lp-modal-active-type" style="color:#34d399; font-weight:600;">None</span>
              <button id="lp-clear-cache-btn" style="display:none; background:rgba(239,68,68,0.2); border:1px solid rgba(239,68,68,0.4); color:#fca5a5; border-radius:6px; padding:2px 8px; font-size:10.5px; cursor:pointer;" title="Clear cached lyrics for this video">Clear Cache</button>
            </div>
          </div>

          <!-- Search Synced Lyrics (LRCLIB & Kugou) -->
          <div style="margin-bottom:14px; background:#1e293b; padding:14px; border-radius:12px; border:1px solid #334155;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <label style="font-size:12px; font-weight:600; color:#a78bfa;">
                🔍 Search Synced Lyrics
              </label>
              <span style="font-size:10px; color:#38bdf8; background:rgba(56,189,248,0.15); border:1px solid rgba(56,189,248,0.3); padding:1px 6px; border-radius:4px;">LRCLIB + Kugou Music</span>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
              <div>
                <span style="font-size:10px; color:#94a3b8; display:block; margin-bottom:2px;">Track Name:</span>
                <input type="text" id="lp-search-track-input" placeholder="Song title" style="width:100%; box-sizing:border-box; background:#0f172a; border:1px solid #475569; border-radius:8px; padding:7px 10px; color:#fff; font-size:12px; outline:none;">
              </div>
              <div>
                <span style="font-size:10px; color:#94a3b8; display:block; margin-bottom:2px;">Artist:</span>
                <input type="text" id="lp-search-artist-input" placeholder="Artist name" style="width:100%; box-sizing:border-box; background:#0f172a; border:1px solid #475569; border-radius:8px; padding:7px 10px; color:#fff; font-size:12px; outline:none;">
              </div>
            </div>
            <div style="display:flex; gap:8px;">
              <button id="lp-search-submit-btn" style="flex:1; background:#7c3aed; color:#fff; border:none; border-radius:8px; padding:8px; font-size:12px; font-weight:600; cursor:pointer;">Search & Sync</button>
              <button id="lp-ai-identify-btn" style="background:linear-gradient(135deg,#7c3aed,#ec4899); color:#fff; border:none; border-radius:8px; padding:8px 12px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:4px; white-space:nowrap;" title="Use Sensei AI to extract clean Song Title and Artist from video">✨ AI Identify</button>
            </div>
            <div id="lp-search-results-list" style="margin-top:10px; max-height:140px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;"></div>
          </div>

          <!-- Audio Timing & Auto-Sync -->
          <div style="background:#1e293b; padding:14px; border-radius:12px; border:1px solid #334155;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <label style="font-size:12px; font-weight:600; color:#f59e0b; display:flex; align-items:center; gap:6px;">
                <span>⏱️ Audio Timing & Auto-Sync</span>
              </label>
              <div style="font-size:12px; color:#cbd5e1;">
                Offset: <strong id="lp-modal-offset-val" style="color:#f59e0b; font-family:monospace; font-size:13px;">+0.0s</strong>
              </div>
            </div>

            <!-- 1-Click Sync Anchor -->
            <div style="background:#0f172a; border:1px solid #3b82f6; border-radius:8px; padding:10px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
              <div style="font-size:11px; color:#94a3b8; line-height:1.4;">
                <span style="color:#60a5fa; font-weight:600;">🎯 1-Click Anchor:</span> When Line 1 starts singing, click:
              </div>
              <button id="lp-sync-playhead-btn" style="background:#2563eb; color:#fff; border:none; padding:7px 12px; border-radius:6px; font-size:11.5px; font-weight:600; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:4px;">
                <span>🎯 Sync Line 1 to Playhead</span>
              </button>
            </div>

            <!-- Manual Numeric Input & Fine-Tuning Macros -->
            <div style="display:flex; gap:6px; align-items:center; margin-bottom:8px;">
              <span style="font-size:11px; color:#94a3b8;">Set Offset:</span>
              <input type="number" id="lp-offset-manual-input" step="0.1" value="0.0" style="width:75px; background:#0f172a; border:1px solid #475569; border-radius:6px; padding:5px 8px; color:#fff; font-size:11.5px; font-family:monospace; outline:none;">
              <button id="lp-offset-manual-set-btn" style="background:#475569; color:#fff; border:none; padding:5px 10px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer;">Set</button>
              <div style="flex:1;"></div>
              <span id="lp-offset-save-status" style="font-size:10px; color:#34d399;"></span>
            </div>

            <!-- Macro adjustment buttons -->
            <div style="display:flex; flex-wrap:wrap; gap:4px; justify-content:center;">
              <button class="lp-offset-adj-btn" data-delta="-5.0" style="background:#334155; color:#cbd5e1; border:none; padding:4px 7px; border-radius:6px; font-size:10.5px; cursor:pointer;">-5s</button>
              <button class="lp-offset-adj-btn" data-delta="-1.0" style="background:#334155; color:#cbd5e1; border:none; padding:4px 7px; border-radius:6px; font-size:10.5px; cursor:pointer;">-1s</button>
              <button class="lp-offset-adj-btn" data-delta="-0.5" style="background:#334155; color:#cbd5e1; border:none; padding:4px 7px; border-radius:6px; font-size:10.5px; cursor:pointer;">-0.5s</button>
              <button class="lp-offset-adj-btn" data-delta="-0.1" style="background:#334155; color:#cbd5e1; border:none; padding:4px 7px; border-radius:6px; font-size:10.5px; cursor:pointer;">-0.1s</button>
              <button class="lp-offset-adj-btn" data-delta="0" style="background:#475569; color:#fff; border:none; padding:4px 9px; border-radius:6px; font-size:10.5px; font-weight:600; cursor:pointer;">Reset (0s)</button>
              <button class="lp-offset-adj-btn" data-delta="0.1" style="background:#334155; color:#cbd5e1; border:none; padding:4px 7px; border-radius:6px; font-size:10.5px; cursor:pointer;">+0.1s</button>
              <button class="lp-offset-adj-btn" data-delta="0.5" style="background:#334155; color:#cbd5e1; border:none; padding:4px 7px; border-radius:6px; font-size:10.5px; cursor:pointer;">+0.5s</button>
              <button class="lp-offset-adj-btn" data-delta="1.0" style="background:#334155; color:#cbd5e1; border:none; padding:4px 7px; border-radius:6px; font-size:10.5px; cursor:pointer;">+1s</button>
              <button class="lp-offset-adj-btn" data-delta="5.0" style="background:#334155; color:#cbd5e1; border:none; padding:4px 7px; border-radius:6px; font-size:10.5px; cursor:pointer;">+5s</button>
            </div>
            <div style="font-size:10px; color:#64748b; text-align:center; margin-top:6px;">
              💡 Hotkeys: <kbd style="background:#0f172a; padding:1px 4px; border-radius:3px;">[</kbd> / <kbd style="background:#0f172a; padding:1px 4px; border-radius:3px;">]</kbd> for ±0.1s | <kbd style="background:#0f172a; padding:1px 4px; border-radius:3px;">Shift+[</kbd> / <kbd style="background:#0f172a; padding:1px 4px; border-radius:3px;">Shift+]</kbd> for ±1.0s
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(lyricsModal);

      document.getElementById('lp-lyrics-modal-close')?.addEventListener('click', () => {
        lyricsModal.classList.add('hidden');
      });
      lyricsModal.addEventListener('click', (e) => {
        if (e.target === lyricsModal) lyricsModal.classList.add('hidden');
      });

      document.getElementById('lp-search-submit-btn')?.addEventListener('click', () => {
        return runModalLyricsSearch('');
      });

      // 1-Click AI Identification via Sensei LLM
      document.getElementById('lp-ai-identify-btn')?.addEventListener('click', () => {
        return runModalAiIdentifyAndSearch();
      });

      // Clear cached lyrics for current video
      document.getElementById('lp-clear-cache-btn')?.addEventListener('click', () => {
        if (!currentVideoId || !chrome.storage?.local) return;
        chrome.storage.local.remove([`lp_lyrics_cache_${currentVideoId}`], () => {
          subtitleTimeline = [];
          currentSubIndex = -1;
          const statusBadge = document.getElementById('linguaplay-sub-status');
          if (statusBadge) statusBadge.textContent = '🎵 No lyrics (Click)';
          updateLyricsModalStatus();
          const listContainer = document.getElementById('lp-search-results-list');
          if (listContainer) listContainer.innerHTML = '<div style="font-size:11px; color:#94a3b8;">Cleared cached lyrics for this video.</div>';
        });
      });

      function setTimingOffset(newOffset) {
        timingOffset = Math.round(newOffset * 10) / 10;
        updateOffsetDisplay();
        const modalOffset = document.getElementById('lp-modal-offset-val');
        if (modalOffset) modalOffset.textContent = `${timingOffset >= 0 ? '+' : ''}${timingOffset.toFixed(1)}s`;
        const manualInp = document.getElementById('lp-offset-manual-input');
        if (manualInp && document.activeElement !== manualInp) manualInp.value = timingOffset.toFixed(1);

        if (currentVideoId && chrome.storage?.local) {
          chrome.storage.local.set({ [`lp_offset_${currentVideoId}`]: timingOffset }, () => {
            const status = document.getElementById('lp-offset-save-status');
            if (status) {
              status.textContent = '✓ Saved';
              setTimeout(() => { if (status) status.textContent = ''; }, 2000);
            }
          });
        }
      }

      document.getElementById('lp-sync-playhead-btn')?.addEventListener('click', () => {
        if (!activeVideoEl || subtitleTimeline.length === 0) {
          alert('Please load subtitles or lyrics first before anchoring!');
          return;
        }
        const playhead = activeVideoEl.currentTime;
        const firstCueStart = subtitleTimeline[0].start;
        const newOffset = playhead - firstCueStart;
        setTimingOffset(newOffset);
        alert(`Anchored Line 1 to video playhead (${playhead.toFixed(2)}s)!\nTiming offset set to ${timingOffset >= 0 ? '+' : ''}${timingOffset.toFixed(1)}s`);
      });

      document.getElementById('lp-offset-manual-set-btn')?.addEventListener('click', () => {
        const val = parseFloat(document.getElementById('lp-offset-manual-input')?.value || '0');
        if (!isNaN(val)) setTimingOffset(val);
      });

      document.querySelectorAll('.lp-offset-adj-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const delta = parseFloat(btn.dataset.delta);
          if (delta === 0) setTimingOffset(0.0);
          else setTimingOffset(timingOffset + delta);
        });
      });
    }

    let isModalAiIdentifying = false;

    async function runModalLyricsSearch(prefixBannerHtml = '') {
      const track = document.getElementById('lp-search-track-input')?.value?.trim() || '';
      const artist = document.getElementById('lp-search-artist-input')?.value?.trim() || '';
      const listContainer = document.getElementById('lp-search-results-list');
      if (!track && !artist) {
        if (listContainer) {
          listContainer.innerHTML = `${prefixBannerHtml}<div style="font-size:11px; color:#ef4444;">Please enter a Track Name or Artist to search.</div>`;
        }
        return false;
      }
      if (listContainer) {
        listContainer.innerHTML = `${prefixBannerHtml}<div style="font-size:11px; color:#a78bfa;">Searching LRCLIB & Kugou Music...</div>`;
      }

      const searchVid = currentVideoId;
      const query = [artist, track].filter(Boolean).join(' ');
      const response = await new Promise(resolve => {
        if (!chrome.runtime?.sendMessage) {
          resolve({ success: false, error: 'Extension runtime unavailable' });
          return;
        }
        chrome.runtime.sendMessage({
          action: 'FETCH_LRCLIB_LYRICS',
          trackName: track,
          artistName: artist,
          query: query,
          duration: activeVideoEl?.duration || 0
        }, res => {
          if (chrome.runtime?.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(res);
          }
        });
      });

      if (searchVid && currentVideoId && searchVid !== currentVideoId) return false;

      if (response && response.success && response.syncedLyrics) {
        const cues = parseLRC(response.syncedLyrics);
        if (cues && cues.length > 0) {
          subtitleTimeline = cues;
          currentSubIndex = -1;
          const provName = response.provider === 'kugou' ? 'Kugou Music' : 'LRCLIB';
          const provTag = response.provider === 'kugou' ? ' [Kugou]' : (prefixBannerHtml ? ' [AI]' : '');
          const statusBadge = playerUI?.subStatusBadge || document.getElementById('linguaplay-sub-status');
          if (statusBadge) statusBadge.textContent = `🎵 ${response.trackName || track || 'Lyrics'}${provTag} (${cues.length})`;
          if (listContainer) {
            listContainer.innerHTML = `
              ${prefixBannerHtml}
              <div style="background:rgba(52,211,153,0.15); border:1px solid #34d399; padding:8px 10px; border-radius:8px; font-size:11px; color:#34d399;">
                ✓ Found on ${provName}: <strong>${response.trackName || track}</strong> ${response.artistName ? 'by ' + response.artistName : ''} (${cues.length} cues)
              </div>
            `;
          }

          // Persist to local cache so user never has to re-search this video
          if (currentVideoId && chrome.storage?.local) {
            chrome.storage.local.set({
              [`lp_lyrics_cache_${currentVideoId}`]: {
                trackName: response.trackName || track,
                artistName: response.artistName || artist,
                provider: response.provider || 'lrclib',
                isAi: Boolean(prefixBannerHtml),
                syncedLyrics: response.syncedLyrics,
                cachedAt: Date.now()
              }
            }, () => {
              updateLyricsModalStatus();
            });
          } else {
            updateLyricsModalStatus();
          }

          ensureYouTubeCCEnabled();
          onTimeUpdate();
          return true;
        }
      }
      if (subtitleTimeline.length === 0) {
        const statusBadge = playerUI?.subStatusBadge || document.getElementById('linguaplay-sub-status');
        if (statusBadge) statusBadge.textContent = '🎵 No lyrics (Click)';
      }
      if (listContainer) {
        listContainer.innerHTML = `${prefixBannerHtml}<div style="font-size:11px; color:#ef4444;">No synced lyrics found on LRCLIB or Kugou Music for this search query.</div>`;
      }
      return false;
    }

    async function runModalAiIdentifyAndSearch() {
      if (isModalAiIdentifying) return;
      const listContainer = document.getElementById('lp-search-results-list');
      const aiBtn = document.getElementById('lp-ai-identify-btn');
      const trackInp = document.getElementById('lp-search-track-input');
      const artistInp = document.getElementById('lp-search-artist-input');
      const statusBadge = playerUI?.subStatusBadge || document.getElementById('linguaplay-sub-status');
      const meta = getYouTubeVideoMetadata();
      const rawTitle = meta.title || trackInp?.value?.trim() || '';
      const rawChannel = meta.channel || artistInp?.value?.trim() || '';

      if (!rawTitle) {
        if (listContainer) listContainer.innerHTML = '<div style="font-size:11px; color:#ef4444;">Could not read video title from YouTube page.</div>';
        return;
      }

      isModalAiIdentifying = true;
      if (statusBadge && subtitleTimeline.length === 0) {
        statusBadge.textContent = '✨ AI Identifying...';
      }
      if (aiBtn) {
        aiBtn.disabled = true;
        aiBtn.textContent = '⏳ Identifying...';
      }
      if (listContainer) {
        listContainer.innerHTML = '<div style="font-size:11px; color:#ec4899; display:flex; align-items:center; gap:6px;"><span>✨</span> Sensei AI is analyzing video title and identifying artist...</div>';
      }

      const identifyVid = currentVideoId;
      let ai = null;
      try {
        ai = await identifySongWithSensei(rawTitle, rawChannel, { ensureServer: true });
      } finally {
        isModalAiIdentifying = false;
        if (aiBtn) {
          aiBtn.disabled = false;
          aiBtn.textContent = '✨ AI Identify';
        }
      }

      if (identifyVid && currentVideoId && identifyVid !== currentVideoId) return;

      if (!ai || ai.error || (!ai.trackName && !ai.artistName)) {
        const errMsg = ai?.error
          ? `⚠️ Sensei AI Notice: ${ai.error}`
          : 'Sensei AI could not identify song. Please check extension settings.';
        const errBanner = `<div style="font-size:11px; color:#ef4444; margin-bottom:4px;">${errMsg}</div>`;
        if (trackInp?.value?.trim() || artistInp?.value?.trim()) {
          await runModalLyricsSearch(errBanner);
        } else {
          if (subtitleTimeline.length === 0 && statusBadge) {
            statusBadge.textContent = '🎵 No lyrics (Click)';
          }
          if (listContainer) {
            listContainer.innerHTML = errBanner;
          }
        }
        return;
      }

      if (trackInp && ai.trackName) trackInp.value = ai.trackName;
      if (artistInp && ai.artistName) artistInp.value = ai.artistName;

      const identifiedBanner = `
        <div style="font-size:11px; color:#c084fc; margin-bottom:4px;">
          ✨ Identified: <strong>${ai.trackName || trackInp?.value || ''}</strong>${ai.artistName ? ' by <strong>' + ai.artistName + '</strong>' : ''} ${ai.animeName ? '(' + ai.animeName + ')' : ''}
        </div>
      `;
      if (listContainer) {
        listContainer.innerHTML = identifiedBanner;
      }

      // Trigger search automatically with AI identified metadata
      await runModalLyricsSearch(identifiedBanner);
    }

    async function openLyricsModal(options = {}) {
      const modal = document.getElementById('linguaplay-lyrics-modal');
      if (!modal) return;
      modal.classList.remove('hidden');

      const autoAiSearch = options === true || Boolean(options && options.autoAiSearch) || subtitleTimeline.length === 0;
      const meta = getYouTubeVideoMetadata();
      const cleaned = cleanSongTitle(meta.title, meta.channel);
      const trackInp = document.getElementById('lp-search-track-input');
      const artistInp = document.getElementById('lp-search-artist-input');

      if (trackInp) trackInp.value = cleaned.trackName || '';
      if (artistInp) artistInp.value = cleaned.artistName || '';

      if (currentVideoId && chrome.storage?.local && !autoAiSearch) {
        chrome.storage.local.get([`lp_lyrics_cache_${currentVideoId}`], (res) => {
          const cached = res[`lp_lyrics_cache_${currentVideoId}`];
          if (cached && (cached.trackName || cached.artistName)) {
            if (trackInp) trackInp.value = cached.trackName || '';
            if (artistInp) artistInp.value = cached.artistName || '';
          }
          updateLyricsModalStatus();
        });
      } else {
        updateLyricsModalStatus();
      }

      if (autoAiSearch) {
        await runModalAiIdentifyAndSearch();
      }
    }

    const fetchLyricsBtn = document.getElementById('linguaplay-fetch-lyrics-btn');
    if (fetchLyricsBtn) {
      fetchLyricsBtn.addEventListener('click', () => openLyricsModal({ autoAiSearch: subtitleTimeline.length === 0 }));
    }
    if (subStatusBadge) {
      subStatusBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        return openLyricsModal({ autoAiSearch: true });
      });
      subStatusBadge.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          return openLyricsModal({ autoAiSearch: true });
        }
      });
    }

    function openExtensionSettings() {
      console.log('[LinguaPlay] Opening extension settings...');
      try {
        chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS_PAGE' }, (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.success) {
            console.warn('[LinguaPlay] Background open options returned error, falling back to window.open:', chrome.runtime.lastError);
            try {
              window.open(chrome.runtime.getURL('options.html'), '_blank');
            } catch (fallbackErr) {
              console.error('[LinguaPlay] Direct window.open fallback failed:', fallbackErr);
            }
          }
        });
      } catch (err) {
        console.warn('[LinguaPlay] Failed to send OPEN_OPTIONS_PAGE message, falling back to window.open:', err);
        try {
          window.open(chrome.runtime.getURL('options.html'), '_blank');
        } catch (fallbackErr) {
          console.error('[LinguaPlay] Direct window.open fallback failed:', fallbackErr);
        }
      }
    }

    const barSettingsBtn = document.getElementById('linguaplay-open-settings-btn');
    if (barSettingsBtn) {
      barSettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openExtensionSettings();
      });
    }

    document.getElementById('linguaplay-open-app-btn').addEventListener('click', () => {
      const urlParams = new URLSearchParams(window.location.search);
      const vid = urlParams.get('v') || currentVideoId;
      if (vid) {
        window.open(chrome.runtime.getURL(`player.html?v=${vid}`), '_blank');
      } else {
        window.open(chrome.runtime.getURL('player.html'), '_blank');
      }
    });

    // 7. Drawer Event Listeners
    const drawerSettingsBtn = document.getElementById('lp-drawer-settings-btn');
    if (drawerSettingsBtn) {
      drawerSettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openExtensionSettings();
      });
    }

    document.getElementById('lp-dismiss-btn').addEventListener('click', () => {
      drawer.classList.add('hidden');
    });

    // Tab Navigation Listeners
    const tabBreakdownBtn = document.getElementById('lp-tab-breakdown-btn');
    const tabChatBtn = document.getElementById('lp-tab-chat-btn');
    if (tabBreakdownBtn) {
      tabBreakdownBtn.addEventListener('click', () => switchDrawerTab('breakdown'));
    }
    if (tabChatBtn) {
      tabChatBtn.addEventListener('click', () => switchDrawerTab('chat'));
    }

    // Delegated click for 'Ask Sensei in Chat →' button from breakdown card
    drawer.addEventListener('click', (e) => {
      if (e.target && e.target.closest('#lp-goto-chat-btn')) {
        switchDrawerTab('chat');
      }
    });

    document.getElementById('lp-quick-anki-btn').addEventListener('click', async () => {
      const word = document.getElementById('lp-active-word').textContent;
      const romaji = document.getElementById('lp-active-romaji').textContent;
      const def = document.getElementById('lp-active-def').innerHTML;
      const sentence = drawerContextSentence || document.getElementById('lp-sentence-jp')?.textContent || activeLiveSentence || '';
      const sentEn = document.getElementById('lp-sentence-en')?.textContent || '';
      const cleanSentEn = (sentEn && !sentEn.includes('Translating') && !sentEn.includes('unavailable')) ? sentEn : '';

      chrome.storage.local.get(['linguaplay_cards'], (res) => {
        const cards = res.linguaplay_cards || [];
        cards.push({
          word,
          reading: word,
          romaji,
          meaning: def,
          sentence,
          sentence_en: cleanSentEn,
          date: new Date().toISOString()
        });
        chrome.storage.local.set({ linguaplay_cards: cards });
      });

      let backHtml = `<div><strong>Meaning:</strong> ${def}</div>`;
      if (sentence) {
        const boldSentence = word && sentence.includes(word) ? sentence.split(word).join(`<b>${word}</b>`) : sentence;
        backHtml += `<br><div><strong>Sentence:</strong> ${boldSentence}</div>`;
        if (cleanSentEn) {
          backHtml += `<div style="color:#94a3b8; font-size:0.9em; margin-top:3px; font-style:italic;">${cleanSentEn}</div>`;
        }
      }

      fetch('http://127.0.0.1:8765', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addNote',
          version: 6,
          params: {
            note: {
              deckName: 'LinguaPlay',
              modelName: 'Basic',
              fields: {
                Front: `${word} <span style="font-size:0.8em;color:#94a3b8;">${romaji}</span>`,
                Back: backHtml
              },
              tags: ['linguaplay', 'youtube']
            }
          }
        })
      }).catch(() => {});

      const btn = document.getElementById('lp-quick-anki-btn');
      btn.textContent = '✓ Saved to Anki Collection!';
      setTimeout(() => { btn.textContent = '🗃️ Quick Add to Anki'; }, 2000);
    });

    const SENSEI_SYSTEM_PROMPT = `You are "Sensei", an empathetic, expert Japanese language and grammar teacher assisting a student immersing in Japanese media.
Explain grammatical nuances, particle usage, verb conjugations, and sentence connections clearly and encouragingly.
Always provide Hiragana readings and Romaji for any Japanese words you introduce.
Keep answers structured, concise, and focused on this sentence context.`;

    function buildSenseiAnalysisPrompt(word, romaji, sentence) {
      return `You are Sensei, an expert Japanese language and grammar teacher.
Focus strictly on HOW THE TARGET WORD FITS INTO THIS SPECIFIC CONTEXT SENTENCE.
Do NOT give generic dictionary essays or unrelated examples.

Context Sentence: "${sentence}"
Target Word: "${word}" (Reading: ${romaji})

Respond with ONLY valid JSON:
{
  "contextual_meaning": "Precise meaning of '${word}' specifically in this sentence",
  "reading": "${romaji}",
  "romaji": "${romaji}",
  "jlpt_level": "N5|N4|N3|N2|N1|Vocab",
  "pos": "Part of speech in this sentence",
  "sentence_fit": {
    "phrase_connection": "How '${word}' connects to surrounding words in this line (e.g. 書架の → 隙間に → 住まう)",
    "role_in_sentence": "Direct syntactic function in this sentence (e.g. Locative noun marked by に (ni), specifying where the subject dwells)",
    "context_nuance": "Specific contextual nuance of '${word}' in this line (1-2 concise sentences)"
  },
  "conjugation": {
    "is_conjugated": false,
    "form": "Inflection form name or null",
    "base_form": "${word}",
    "explanation": "Why this specific inflection/form is used in this clause"
  },
  "sentence_translation": {
    "jp": "${sentence}",
    "en": "Natural English translation of this entire context sentence"
  },
  "word_by_word": [
    {
      "word": "word/particle",
      "reading": "reading",
      "romaji": "romaji",
      "meaning": "English meaning",
      "role": "grammar role",
      "is_target": false
    }
  ]
}`;
    }

    function formatSenseiMarkdown(rawText) {
      if (!rawText) return '';

      let text = rawText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      function formatInline(str) {
        return str
          .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
          .replace(/\\*(.*?)\\*/g, '<em>$1</em>')
          .replace(/`([^`]+)`/g, '<code class="lp-chat-inline-code">$1</code>');
      }

      function isTableDelimiter(rowStr) {
        let clean = rowStr.trim();
        if (clean.startsWith('|')) clean = clean.substring(1);
        if (clean.endsWith('|')) clean = clean.substring(0, clean.length - 1);
        const parts = clean.split('|');
        if (parts.length === 0) return false;
        return parts.every(p => {
          const t = p.trim();
          return t.length >= 2 && /^:?-+:?$/.test(t);
        });
      }

      function splitTableRow(rowStr) {
        let clean = rowStr.trim();
        if (clean.startsWith('|')) clean = clean.substring(1);
        if (clean.endsWith('|')) clean = clean.substring(0, clean.length - 1);
        return clean.split('|').map(c => c.trim());
      }

      const lines = text.split('\\n');
      const output = [];
      let i = 0;

      while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.includes('|') && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
          const headerCells = splitTableRow(trimmed);
          const alignDefs = splitTableRow(lines[i + 1]).map(c => {
            if (c.startsWith(':') && c.endsWith(':')) return 'center';
            if (c.endsWith(':')) return 'right';
            return 'left';
          });

          i += 2; // Skip header and delimiter

          const rows = [];
          while (i < lines.length && lines[i].trim().includes('|') && !isTableDelimiter(lines[i])) {
            rows.push(splitTableRow(lines[i]));
            i++;
          }

          let tableHtml = '<div class="lp-chat-table-wrapper"><table class="lp-chat-table"><thead><tr>';
          headerCells.forEach((h, colIdx) => {
            const align = alignDefs[colIdx] || 'left';
            tableHtml += `<th style="text-align:${align};">${formatInline(h)}</th>`;
          });
          tableHtml += '</tr></thead><tbody>';

          rows.forEach(row => {
            tableHtml += '<tr>';
            headerCells.forEach((_, colIdx) => {
              const cell = row[colIdx] || '';
              const align = alignDefs[colIdx] || 'left';
              tableHtml += `<td style="text-align:${align};">${formatInline(cell)}</td>`;
            });
            tableHtml += '</tr>';
          });
          tableHtml += '</tbody></table></div>';

          output.push(tableHtml);
          continue;
        }

        if (/^[-*][ \\t]+/.test(trimmed)) {
          output.push(`<div class="lp-chat-bullet">• ${formatInline(trimmed.replace(/^[-*][ \\t]+/, ''))}</div>`);
          i++;
          continue;
        }

        output.push(formatInline(line));
        i++;
      }

      return output.join('<br>').replace(/(<\\/div>)<br>/g, '$1').replace(/<br>(<div)/g, '$1');
    }

    function captureChatScroll() {
      const container = document.getElementById('lp-chat-messages');
      if (!container || !container.clientHeight) return null;
      return {
        top: container.scrollTop,
        following: container.scrollHeight - container.clientHeight - container.scrollTop <= 32
      };
    }

    function appendChatMessage(role, text, scroll = captureChatScroll()) {
      const container = document.getElementById('lp-chat-messages');
      if (!container) return null;
      const msgEl = document.createElement('div');
      msgEl.className = role === 'user' ? 'lp-chat-msg-user' : 'lp-chat-msg-sensei';
      if (role === 'user') {
        msgEl.textContent = text;
      } else {
        msgEl.innerHTML = formatSenseiMarkdown(text);
      }
      container.appendChild(msgEl);
      if (scroll?.following) {
        // Long answers should start at their first line, not their last line.
        if (role === 'sensei' && msgEl.getBoundingClientRect().height > container.clientHeight) {
          container.scrollTop += msgEl.getBoundingClientRect().top - container.getBoundingClientRect().top - (container.clientTop || 0);
        } else {
          container.scrollTop = container.scrollHeight;
        }
      } else if (scroll) {
        container.scrollTop = scroll.top;
      }
      return msgEl;
    }

    function sendSenseiQuestion(questionText) {
      if (!questionText || !questionText.trim() || activeSenseiChatRequest?.contextVersion === drawerContextVersion) return false;
      const word = document.getElementById('lp-active-word')?.textContent || '';
      const romaji = document.getElementById('lp-active-romaji')?.textContent || '';
      const sentence = drawerContextSentence || document.getElementById('lp-chat-context-sentence')?.textContent || document.getElementById('lp-sentence-jp')?.textContent || activeLiveSentence || '';

      const contextVersion = drawerContextVersion;
      const history = senseiChatHistory;
      const request = { contextVersion };
      activeSenseiChatRequest = request;
      updateSenseiChatControls();
      appendChatMessage('user', questionText);
      const userMessage = { role: 'user', content: questionText };
      history.push(userMessage);

      const loadingEl = appendChatMessage('sensei', '⚡ Sensei is thinking…');

      chrome.storage.local.get([
        'linguaplay_ai_provider',
        'linguaplay_gemini_key',
        'linguaplay_deepseek_key',
        'linguaplay_openrouter_key',
        'linguaplay_openrouter_model',
        'linguaplay_opencode_url',
        'linguaplay_opencode_key',
        'linguaplay_opencode_model',
        'linguaplay_server_url'
      ], async (cfg) => {
        try {
          if (contextVersion !== drawerContextVersion) return;
          const messages = [
            {
              role: 'system',
              content: `${SENSEI_SYSTEM_PROMPT}\\n\\nContext Sentence: "${sentence}"\\nTarget Word: "${word}" (${romaji})`
            },
            ...history
          ];

          const reply = await callSenseiLlmApi({
            messages,
            isJson: false,
            config: cfg,
            word,
            romaji,
            sentence
          });

          if (contextVersion !== drawerContextVersion) return;
          history.push({ role: 'assistant', content: reply });
          const scroll = captureChatScroll();
          if (loadingEl) loadingEl.remove();
          appendChatMessage('sensei', reply, scroll);
        } catch (err) {
          if (contextVersion !== drawerContextVersion) return;
          const index = history.indexOf(userMessage);
          if (index !== -1) history.splice(index, 1);
          const scroll = captureChatScroll();
          if (loadingEl) loadingEl.remove();
          appendChatMessage('sensei', `⚠️ Sensei error: ${err.message}`, scroll);
        } finally {
          // An old response must not unlock a new word's pending request.
          if (activeSenseiChatRequest === request) {
            activeSenseiChatRequest = null;
            updateSenseiChatControls();
          }
        }
      });
      return true;
    }

    // Attach Chatbot Chip and Send Listeners
    document.querySelectorAll('.lp-chat-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.getAttribute('data-prompt');
        if (prompt) sendSenseiQuestion(prompt);
      });
    });

    const chatInputEl = document.getElementById('lp-chat-input');
    const chatSendBtn = document.getElementById('lp-chat-send-btn');
    if (chatSendBtn && chatInputEl) {
      chatSendBtn.addEventListener('click', () => {
        const val = chatInputEl.value.trim();
        if (val) {
          if (sendSenseiQuestion(val)) chatInputEl.value = '';
        }
      });
      chatInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
          const val = chatInputEl.value.trim();
          if (val) {
            if (sendSenseiQuestion(val)) chatInputEl.value = '';
          }
        }
      });
    }

    document.getElementById('lp-ai-btn').addEventListener('click', async () => {
      const word = document.getElementById('lp-active-word').textContent;
      const romaji = document.getElementById('lp-active-romaji').textContent;
      const sentence = drawerContextSentence || document.getElementById('lp-sentence-jp')?.textContent || activeLiveSentence || '';
      const loading = document.getElementById('lp-ai-loading');
      const results = document.getElementById('lp-ai-results');
      const ankiBtn = document.getElementById('lp-ai-anki-btn');
      const chatBox = document.getElementById('lp-sensei-chat-box');
      const badgeEl = document.getElementById('lp-sensei-provider-badge');

      loading.style.display = 'block';
      results.style.display = 'none';
      ankiBtn.style.display = 'none';
      if (chatBox) chatBox.style.display = 'none';

      chrome.storage.local.get([
        'linguaplay_ai_provider',
        'linguaplay_gemini_key',
        'linguaplay_deepseek_key',
        'linguaplay_openrouter_key',
        'linguaplay_openrouter_model',
        'linguaplay_opencode_url',
        'linguaplay_opencode_key',
        'linguaplay_opencode_model',
        'linguaplay_server_url'
      ], async (cfg) => {
        const provider = getSenseiProvider(cfg);
        const prompt = buildSenseiAnalysisPrompt(word, romaji, sentence);
        const messages = [{ role: 'user', content: prompt }];

        const providerTitleMap = {
          gemini: '✨ GEMINI FLASH SENSEI BREAKDOWN',
          deepseek: '⚡ DEEPSEEK SENSEI BREAKDOWN',
          openrouter: `🌐 OPENROUTER (${cfg.linguaplay_openrouter_model || 'deepseek'}) BREAKDOWN`,
          opencode: `💻 OPENCODE (${cfg.linguaplay_opencode_model || 'custom'}) BREAKDOWN`,
          antigravity: '🤖 ANTIGRAVITY CLI BREAKDOWN'
        };

        try {
          const rawText = await callSenseiLlmApi({
            messages,
            isJson: true,
            config: cfg,
            word,
            romaji,
            sentence
          });

          const json = JSON.parse(rawText.replace(/```json|```/g, '').trim());
          lastAiData = json;

          loading.style.display = 'none';
          results.style.display = 'block';
          ankiBtn.style.display = 'block';
          if (chatBox) chatBox.style.display = 'block';
          if (badgeEl) badgeEl.textContent = provider.toUpperCase();

          results.innerHTML = renderPedagogicalBreakdown(json, providerTitleMap[provider] || '✨ SENSEI AI BREAKDOWN');
        } catch (err) {
          // If local server failed and user has configured another key, try fallback
          if (provider === 'antigravity' && cfg.linguaplay_gemini_key) {
            try {
              const fallbackCfg = { ...cfg, linguaplay_ai_provider: 'gemini' };
              const rawText = await callSenseiLlmApi({
                messages,
                isJson: true,
                config: fallbackCfg,
                word,
                romaji,
                sentence
              });
              const json = JSON.parse(rawText.replace(/```json|```/g, '').trim());
              lastAiData = json;
              loading.style.display = 'none';
              results.style.display = 'block';
              ankiBtn.style.display = 'block';
              if (chatBox) chatBox.style.display = 'block';
              if (badgeEl) badgeEl.textContent = 'GEMINI (FALLBACK)';
              results.innerHTML = renderPedagogicalBreakdown(json, '✨ GEMINI FLASH SENSEI BREAKDOWN');
              return;
            } catch (fallbackErr) {
              console.warn('[LinguaPlay] Fallback also failed:', fallbackErr);
            }
          }

          loading.style.display = 'none';
          results.style.display = 'block';
          results.innerHTML = `
            <div style="background: rgba(124, 58, 237, 0.14); border: 1px solid rgba(139, 92, 246, 0.35); border-radius: 8px; padding: 12px; font-size: 12px; color: #e2e8f0; line-height: 1.5;">
              <div style="font-weight: 600; color: #f87171; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
                <span>⚠️</span> AI Analysis Notice: ${err.message}
              </div>
              <p style="margin: 0 0 8px; color: #cbd5e1; font-size: 11.5px;">
                ${provider === 'antigravity' ? 'Click Ask Sensei to retry, or open extension settings to select another provider.' : 'Quick-save your API key directly below, or open full extension settings:'}
              </p>
              <div style="display: ${provider === 'antigravity' ? 'none' : 'flex'}; gap: 6px; margin-bottom: 8px; align-items: center;">
                <select id="lp-inline-provider" style="background: #1e1b4b; color: #e2e8f0; border: 1px solid rgba(139,92,246,0.5); border-radius: 6px; padding: 4px 6px; font-size: 11px;">
                  <option value="deepseek" selected>DeepSeek</option>
                  <option value="gemini">Gemini</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="opencode">OpenCode</option>
                </select>
                <input id="lp-inline-api-key" type="password" placeholder="Paste API Key (sk-...)" style="flex: 1; background: #0f172a; color: #f8fafc; border: 1px solid rgba(139,92,246,0.4); border-radius: 6px; padding: 4px 8px; font-size: 11px;">
                <button id="lp-inline-save-key-btn" style="background: #10b981; border: none; color: white; font-size: 11px; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-weight: 600;">Save</button>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span id="lp-inline-key-status" style="font-size: 11px; color: #34d399;"></span>
                <button id="lp-go-options-btn" style="background:#7c3aed; border:none; color:white; font-size:11px; padding:4px 10px; border-radius:6px; cursor:pointer; font-weight:600;">⚙️ Open Extension Settings</button>
              </div>
            </div>
          `;

          const inlineSaveBtn = document.getElementById('lp-inline-save-key-btn');
          const inlineProvider = document.getElementById('lp-inline-provider');
          const inlineKeyInput = document.getElementById('lp-inline-api-key');
          const inlineStatus = document.getElementById('lp-inline-key-status');

          if (inlineSaveBtn && inlineKeyInput && inlineProvider) {
            inlineSaveBtn.addEventListener('click', (e) => {
              e.preventDefault();
              const prov = inlineProvider.value;
              const rawKey = inlineKeyInput.value.trim();
              if (!rawKey) {
                inlineStatus.textContent = 'Please paste a key!';
                inlineStatus.style.color = '#f87171';
                return;
              }
              const saveObj = { linguaplay_ai_provider: prov };
              if (prov === 'deepseek') saveObj.linguaplay_deepseek_key = rawKey;
              else if (prov === 'gemini') saveObj.linguaplay_gemini_key = rawKey;
              else if (prov === 'openrouter') saveObj.linguaplay_openrouter_key = rawKey;
              else if (prov === 'opencode') saveObj.linguaplay_opencode_key = rawKey;

              chrome.storage.local.set(saveObj, () => {
                inlineStatus.textContent = '✓ Saved! Click Ask Sensei again.';
                inlineStatus.style.color = '#34d399';
              });
            });
          }

          const optBtn = document.getElementById('lp-go-options-btn');
          if (optBtn) {
            optBtn.addEventListener('click', (e) => {
              e.preventDefault();
              openExtensionSettings();
            });
          }
        }
      });
    });

    document.getElementById('lp-ai-anki-btn').addEventListener('click', () => {
      if (!lastAiData) return;
      const word = document.getElementById('lp-active-word').textContent;
      const sentence = drawerContextSentence || document.getElementById('lp-sentence-jp')?.textContent || activeLiveSentence || '';
      const target = lastAiData.target_word || {};
      const meaning = target.meaning || lastAiData.contextual_meaning || lastAiData.meaning || '';
      const sentenceFit = lastAiData.sentence_fit || {};
      const grammar = sentenceFit.role_in_sentence || lastAiData.grammar_role ? ` [Role: ${sentenceFit.role_in_sentence || lastAiData.grammar_role}]` : '';

      chrome.storage.local.get(['linguaplay_cards'], (res) => {
        const cards = res.linguaplay_cards || [];
        cards.push({
          word,
          reading: target.reading || word,
          meaning: `${meaning}${grammar}`,
          sentence,
          date: new Date().toISOString()
        });
        chrome.storage.local.set({ linguaplay_cards: cards });
      });

      const btn = document.getElementById('lp-ai-anki-btn');
      btn.textContent = '✓ AI Card Saved to Storage!';
      setTimeout(() => { btn.textContent = '🗂️ Save Enriched AI Card to Anki'; }, 2000);
    });

    updateWidgetState();
    ensurePlayerControls();
    setupLiveCaptionHooking();
  }

  function updateLyricsModalStatus() {
    const countEl = document.getElementById('lp-modal-active-count');
    const typeEl = document.getElementById('lp-modal-active-type');
    if (countEl) countEl.textContent = `${subtitleTimeline.length} cues`;
    if (typeEl) {
      typeEl.textContent = subtitleTimeline.length > 0
        ? ((playerUI?.subStatusBadge || document.getElementById('linguaplay-sub-status'))?.textContent || 'Active')
        : 'None';
    }
    const offsetEl = document.getElementById('lp-modal-offset-val');
    if (offsetEl) offsetEl.textContent = `${timingOffset >= 0 ? '+' : ''}${timingOffset.toFixed(1)}s`;
    const manualInp = document.getElementById('lp-offset-manual-input');
    if (manualInp && document.activeElement !== manualInp) manualInp.value = timingOffset.toFixed(1);

    if (currentVideoId && chrome.storage?.local) {
      chrome.storage.local.get([`lp_lyrics_cache_${currentVideoId}`], (res) => {
        const cached = res[`lp_lyrics_cache_${currentVideoId}`];
        const cacheBadge = document.getElementById('lp-modal-cache-badge');
        const clearBtn = document.getElementById('lp-clear-cache-btn');
        if (cached && cached.syncedLyrics && subtitleTimeline.length > 0) {
          if (cacheBadge) {
            cacheBadge.style.display = 'inline-block';
            cacheBadge.style.background = 'rgba(52,211,153,0.18)';
            cacheBadge.style.color = '#34d399';
            cacheBadge.style.border = '1px solid rgba(52,211,153,0.4)';
            cacheBadge.textContent = '💾 Saved in Cache';
          }
          if (clearBtn) clearBtn.style.display = 'inline-block';
        } else {
          if (cacheBadge) cacheBadge.style.display = 'none';
          if (clearBtn) clearBtn.style.display = 'none';
        }
      });
    }
  }

  function updateOffsetDisplay() {
    const disp = document.getElementById('linguaplay-offset-display');
    if (disp) {
      const sign = timingOffset > 0 ? '+' : '';
      disp.textContent = `${sign}${timingOffset.toFixed(1)}s`;
    }
  }

  function onTimeUpdate() {
    if (!activeVideoEl || subtitleTimeline.length === 0) return;
    const ct = activeVideoEl.currentTime - timingOffset;

    let matchIdx = -1;
    for (let i = 0; i < subtitleTimeline.length; i++) {
      if (ct >= subtitleTimeline[i].start && ct <= subtitleTimeline[i].end) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx !== currentSubIndex) {
      currentSubIndex = matchIdx;
      if (matchIdx >= 0) {
        const text = subtitleTimeline[matchIdx].text;
        activeLiveSentence = text;
        renderSentenceTokens(text);
      } else {
        renderSentenceTokens('');
      }
    }
  }

  function ensureYouTubeCCEnabled() {
    const ccBtn = document.querySelector('.ytp-subtitles-button');
    if (ccBtn && ccBtn.getAttribute('aria-pressed') === 'false') {
      ccBtn.click();
    }
  }

  function startServerOnPlayback() {
    if (!activeVideoEl || activeVideoEl.paused || activeVideoEl.ended || !new URLSearchParams(window.location.search).get('v')) return;
    if (!chrome.runtime?.sendMessage) return;
    try {
      chrome.runtime.sendMessage({ action: 'ENSURE_LOCAL_SERVER' }, response => {
        const error = chrome.runtime.lastError;
        if (error || (response && !response.success)) console.warn('[LinguaPlay] Server auto-start:', error?.message || response.error);
        if (!error && response?.success) {
          japaneseParser?.retry();
          if (renderedSentence) renderSentenceTokens(renderedSentence);
          refreshDrawerParsing();
        }
      });
    } catch (error) { console.warn('[LinguaPlay] Server auto-start:', error.message); }
  }

  async function checkAndInitVideo() {
    const urlParams = new URLSearchParams(window.location.search);
    const vid = urlParams.get('v');
    if (!vid) return;

    // Also retry on the same video: native controls can arrive late or be rebuilt.
    injectUI();
    const v = document.querySelector('video');
    if (v && v !== activeVideoEl) {
      if (activeVideoEl) {
        activeVideoEl.removeEventListener('timeupdate', onTimeUpdate);
        activeVideoEl.removeEventListener('playing', startServerOnPlayback);
      }
      activeVideoEl = v;
      activeVideoEl.addEventListener('timeupdate', onTimeUpdate);
      activeVideoEl.addEventListener('playing', startServerOnPlayback);
      setupLiveCaptionHooking();
      startServerOnPlayback();
    }

    if (vid !== currentVideoId) {
      currentVideoId = vid;
      lyricsFetchAttemptedVid = null;
      isFetchingLyrics = false;
      japaneseParser?.reset();
      subtitleRenderVersion++;
      renderedSentence = '';
      currentSubIndex = -1;
      subtitleTimeline = [];
      activeLiveSentence = '';
      drawerContextSentence = '';
      drawerActiveWord = '';
      drawerContextVersion++;
      refreshDrawerParsing = () => {};
      senseiChatHistory = [];
      activeSenseiChatRequest = null;
      const trackInp = document.getElementById('lp-search-track-input');
      const artistInp = document.getElementById('lp-search-artist-input');
      const listContainer = document.getElementById('lp-search-results-list');
      const statusBadge = playerUI?.subStatusBadge || document.getElementById('linguaplay-sub-status');
      if (trackInp) trackInp.value = '';
      if (artistInp) artistInp.value = '';
      if (listContainer) listContainer.innerHTML = '';
      if (statusBadge) statusBadge.textContent = '';
      updateSenseiChatControls();
      updateLyricsModalStatus();

      // Load stored offset and cached lyrics for this video
      if (chrome.storage?.local) {
        chrome.storage.local.get([`lp_offset_${vid}`, `lp_lyrics_cache_${vid}`], (res) => {
          if (vid !== currentVideoId) return;
          if (typeof res[`lp_offset_${vid}`] === 'number') {
            timingOffset = res[`lp_offset_${vid}`];
          } else {
            timingOffset = 0.0;
          }
          updateOffsetDisplay();

          const cached = res[`lp_lyrics_cache_${vid}`];
          if (cached && cached.syncedLyrics && subtitleTimeline.length === 0) {
            const cues = parseLRC(cached.syncedLyrics);
            if (cues && cues.length > 0) {
              subtitleTimeline = cues;
              lyricsFetchAttemptedVid = vid;
              const badge = playerUI?.subStatusBadge || document.getElementById('linguaplay-sub-status');
              if (badge) {
                const provTag = cached.provider === 'kugou' ? ' [Kugou]' : (cached.isAi ? ' [AI]' : '');
                badge.textContent = `🎵 ${cached.trackName || 'Lyrics'}${provTag} (${cues.length})`;
              }
              ensureYouTubeCCEnabled();
            }
          }
          updateLyricsModalStatus();
        });
      } else {
        timingOffset = 0.0;
        updateOffsetDisplay();
        updateLyricsModalStatus();
      }

      inspectAndSwitchPlayerTracks();

      let cues = await fetchYouTubeCaptions(vid);
      if (vid !== currentVideoId) return;
      if (cues && cues.length > 0) {
        subtitleTimeline = cues;
        lyricsFetchAttemptedVid = vid;
        const badge = playerUI?.subStatusBadge || document.getElementById('linguaplay-sub-status');
        if (badge) {
          badge.textContent = `Auto Sub (${cues.length})`;
        }
        ensureYouTubeCCEnabled();
        updateLyricsModalStatus();
        return;
      }
    }

    // If native subtitles are absent and we haven't fetched lyrics for this video yet:
    if (currentVideoId && subtitleTimeline.length === 0 && lyricsFetchAttemptedVid !== currentVideoId && !isFetchingLyrics) {
      const meta = getYouTubeVideoMetadata();
      // Ensure YouTube SPA DOM has actually rendered the video title and is not a generic placeholder
      if (meta && meta.title && !/^youtube$/i.test(meta.title)) {
        const fetchVid = currentVideoId;
        isFetchingLyrics = true;
        const statusBadge = playerUI?.subStatusBadge || document.getElementById('linguaplay-sub-status');
        if (statusBadge) statusBadge.textContent = '🎵 Searching lyrics...';

        try {
          const duration = activeVideoEl?.duration || 0;
          const lyricsInfo = await fetchLrclibLyrics(meta.title, meta.channel, duration);
          if (fetchVid !== currentVideoId) return;
          if (lyricsInfo && lyricsInfo.cues && lyricsInfo.cues.length > 0) {
            subtitleTimeline = lyricsInfo.cues;
            if (statusBadge) {
              const provTag = lyricsInfo.provider === 'kugou' ? ' [Kugou]' : (lyricsInfo.isAi ? ' [AI]' : '');
              statusBadge.textContent = `🎵 ${lyricsInfo.trackName || 'Lyrics'}${provTag} (${lyricsInfo.cues.length})`;
            }

            // Cache to local storage so future views load instantly
            if (fetchVid && chrome.storage?.local && lyricsInfo.syncedLyrics) {
              chrome.storage.local.set({
                [`lp_lyrics_cache_${fetchVid}`]: {
                  trackName: lyricsInfo.trackName,
                  artistName: lyricsInfo.artistName,
                  provider: lyricsInfo.provider || 'lrclib',
                  syncedLyrics: lyricsInfo.syncedLyrics,
                  isAi: !!lyricsInfo.isAi,
                  cachedAt: Date.now()
                }
              });
            }
          } else {
            if (statusBadge) {
              statusBadge.textContent = '🎵 No lyrics (Click)';
            }
          }
        } catch (e) {
          console.warn('[LinguaPlay] Auto lyrics fetch failed:', e);
          if (fetchVid === currentVideoId && statusBadge) statusBadge.textContent = '🎵 No lyrics (Click)';
        } finally {
          if (fetchVid === currentVideoId) {
            lyricsFetchAttemptedVid = fetchVid;
            isFetchingLyrics = false;
            updateLyricsModalStatus();
          }
        }
      }
    }
  }

  function showOffsetHUD() {
    let hud = document.getElementById('lp-offset-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'lp-offset-hud';
      hud.style.cssText = 'position:fixed; top:70px; left:50%; transform:translateX(-50%); background:rgba(15,23,42,0.92); color:#f59e0b; border:1px solid #f59e0b; padding:8px 16px; border-radius:20px; font-size:13px; font-weight:700; z-index:9999999; pointer-events:none; transition:opacity 0.3s; font-family:monospace; box-shadow:0 4px 12px rgba(0,0,0,0.5);';
      document.body.appendChild(hud);
    }
    hud.textContent = `⏱️ Subtitle Offset: ${timingOffset >= 0 ? '+' : ''}${timingOffset.toFixed(1)}s`;
    hud.style.opacity = '1';
    clearTimeout(hud._timer);
    hud._timer = setTimeout(() => { hud.style.opacity = '0'; }, 1500);
  }

  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName) || e.target?.isContentEditable) return;
    if (e.key === '[' || e.key === ']') {
      const step = e.shiftKey ? 1.0 : 0.1;
      const delta = e.key === ']' ? step : -step;
      timingOffset = Math.round((timingOffset + delta) * 10) / 10;
      updateOffsetDisplay();
      const modalOffset = document.getElementById('lp-modal-offset-val');
      if (modalOffset) modalOffset.textContent = `${timingOffset >= 0 ? '+' : ''}${timingOffset.toFixed(1)}s`;
      const manualInp = document.getElementById('lp-offset-manual-input');
      if (manualInp && document.activeElement !== manualInp) manualInp.value = timingOffset.toFixed(1);
      if (currentVideoId && chrome.storage?.local) {
        chrome.storage.local.set({ [`lp_offset_${currentVideoId}`]: timingOffset });
      }
      showOffsetHUD();
    }
  });

  setInterval(checkAndInitVideo, 1000);
  window.addEventListener('yt-navigate-finish', checkAndInitVideo);
  window.addEventListener('popstate', checkAndInitVideo);
  window.addEventListener('resize', ensurePlayerControls);
  document.addEventListener('fullscreenchange', ensurePlayerControls);

})();
"""

with open(out_file, 'w', encoding='utf-8') as f:
    f.write(content_code)

print(f'Successfully built {out_file}!')
