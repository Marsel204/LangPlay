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
  let lastAiData = null;
  let senseiChatHistory = [];
  let drawerContextSentence = '';
  let drawerActiveWord = '';
  let activeLiveSentence = '';
  let isPanelCollapsed = true;

  // ── Load Settings ──
  chrome.storage.local.get(['linguaplay_reading_mode', 'linguaplay_panel_collapsed'], (res) => {
    if (res.linguaplay_reading_mode) readingMode = res.linguaplay_reading_mode;
    if (typeof res.linguaplay_panel_collapsed === 'boolean') isPanelCollapsed = res.linguaplay_panel_collapsed;
    updateWidgetState();
  });

  // ── Tokenizer with Kanji Resolution ──
  function tokenize(sentence) {
    if (!sentence || !sentence.trim()) return [];
    
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

  // ── Render Tokens into Subtitle Overlay ──
  function renderSentenceTokens(sentenceText) {
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
    container.innerHTML = '';

    tokens.forEach(tk => {
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

      span.innerHTML = `
        <span class="linguaplay-token-reading ${hiddenClass}">${reading || '&nbsp;'}</span>
        <span class="linguaplay-jp-text">${tk.surface}</span>
      `;

      span.addEventListener('click', (e) => {
        e.stopPropagation();
        handleTokenClick(tk, sentenceText);
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

  // ── Handle Word Click (Non-Interrupting & Side-Panel Integration) ──
  function handleTokenClick(token, sentenceContext) {
    let drawer = document.getElementById('linguaplay-yt-drawer');
    if (!drawer) return;

    const secondary = document.querySelector('#secondary-inner') || document.querySelector('#secondary') || document.querySelector('#related');
    if (secondary && secondary.offsetParent !== null) {
      if (drawer.parentElement !== secondary) {
        secondary.insertBefore(drawer, secondary.firstChild);
      }
      drawer.classList.remove('floating-fallback');
    } else {
      if (drawer.parentElement !== document.body) {
        document.body.appendChild(drawer);
      }
      drawer.classList.add('floating-fallback');
    }

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

    const readingData = getWordReading(token.surface);
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
    drawerActiveWord = token.surface || '';
    drawerContextSentence = (sentenceContext || token.surface || '').trim();

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
    lastAiData = null;

    if (typeof switchDrawerTab === 'function') {
      switchDrawerTab('breakdown');
    }

    const local = JDICT[token.baseForm] || JDICT[token.surface];
    if (local) {
      defEl.innerHTML = local;
    } else {
      defEl.innerHTML = '<span style="opacity:0.6;">Looking up definition…</span>';
      fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=en&dt=t&q=${encodeURIComponent(token.baseForm)}`)
        .then(r => r.json())
        .then(d => {
          let trans = '';
          if (d && d[0] && Array.isArray(d[0])) {
            trans = d[0].map(s => s[0]).filter(Boolean).join('');
          }
          defEl.textContent = trans || 'No definition found';
        })
        .catch(() => {
          defEl.textContent = 'Click Ask Antigravity AI below for deep analysis.';
        });
    }

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

  function updateWidgetState() {
    const widget = document.getElementById('linguaplay-yt-widget');
    if (!widget) return;
    if (isPanelCollapsed) {
      widget.classList.add('collapsed');
    } else {
      widget.classList.remove('collapsed');
    }
  }

  // ── Inject LinguaPlay Interface on YouTube ──
  function injectUI() {
    if (document.getElementById('linguaplay-yt-widget')) return;

    const moviePlayer = document.querySelector('#movie_player') || document.querySelector('.html5-video-player') || document.querySelector('video')?.parentElement;
    if (!moviePlayer) return;

    // 1. Hidden file input for manual .srt/.vtt upload on YouTube
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.srt,.vtt';
    fileInput.id = 'linguaplay-manual-sub-input';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const content = evt.target.result;
        const cues = file.name.endsWith('.srt') ? parseSRT(content) : parseVTT(content);
        if (cues.length > 0) {
          subtitleTimeline = cues;
          const statusBadge = document.getElementById('linguaplay-sub-status');
          if (statusBadge) statusBadge.textContent = `Subs (${cues.length})`;
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

    // 3. Retractable LinguaPlay Floating Widget (Top-Right Corner)
    const widget = document.createElement('div');
    widget.id = 'linguaplay-yt-widget';
    if (isPanelCollapsed) widget.classList.add('collapsed');

    widget.innerHTML = `
      <div id="linguaplay-toggle-trigger" title="Open LinguaPlay Settings">
        <span>言</span>
      </div>
      <div id="linguaplay-yt-bar">
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
        <button class="linguaplay-bar-btn" id="linguaplay-upload-sub-btn" title="Upload Japanese .srt/.vtt subtitle file">📁</button>
        <button class="linguaplay-bar-btn" id="linguaplay-open-app-btn" title="Open in Full LinguaPlay Player Tab" style="background: rgba(124,58,237,0.4); border-color:#a78bfa; color:#fff;">🚀</button>
        <button class="linguaplay-bar-btn" id="linguaplay-open-settings-btn" title="Open Extension Settings" style="background: rgba(124,58,237,0.25); border-color:rgba(167,139,250,0.5); color:#fff;">⚙️</button>
        <span id="linguaplay-sub-status" style="font-size: 10px; color: #6ee7b7; margin-left: 2px;"></span>
        <button class="linguaplay-bar-btn linguaplay-collapse-btn" id="linguaplay-collapse-btn" title="Collapse Bar">✕</button>
      </div>
    `;
    moviePlayer.appendChild(widget);

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

    const secondary = document.querySelector('#secondary-inner') || document.querySelector('#secondary') || document.querySelector('#related');
    if (secondary) {
      secondary.insertBefore(drawer, secondary.firstChild);
    } else {
      document.body.appendChild(drawer);
    }

    // 5. Retractable Widget Toggle Listeners
    document.getElementById('linguaplay-toggle-trigger').addEventListener('click', (e) => {
      e.stopPropagation();
      isPanelCollapsed = false;
      chrome.storage.local.set({ linguaplay_panel_collapsed: false });
      updateWidgetState();
    });

    document.getElementById('linguaplay-collapse-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      isPanelCollapsed = true;
      chrome.storage.local.set({ linguaplay_panel_collapsed: true });
      updateWidgetState();
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

    async function callSenseiLlmApi({ messages, isJson, config, word, romaji, sentence }) {
      const provider = config.linguaplay_ai_provider || 'gemini';
      const geminiKey = (config.linguaplay_gemini_key || '').trim();
      const deepseekKey = (config.linguaplay_deepseek_key || '').trim();
      const openrouterKey = (config.linguaplay_openrouter_key || '').trim();
      const openrouterModel = (config.linguaplay_openrouter_model || 'deepseek/deepseek-chat').trim();
      const opencodeUrl = (config.linguaplay_opencode_url || 'http://127.0.0.1:11434/v1').trim();
      const opencodeKey = (config.linguaplay_opencode_key || '').trim();
      const opencodeModel = (config.linguaplay_opencode_model || 'deepseek-chat').trim();
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

      // 4. OpenCode / Custom OpenAI Endpoint
      if (provider === 'opencode') {
        const targetUrl = opencodeUrl.endsWith('/chat/completions') ? opencodeUrl : `${opencodeUrl.replace(/\\/$/, '')}/chat/completions`;
        const headers = { 'Content-Type': 'application/json' };
        if (opencodeKey) headers['Authorization'] = `Bearer ${opencodeKey}`;
        const body = {
          model: opencodeModel,
          messages: messages,
          response_format: isJson ? { type: 'json_object' } : undefined
        };
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(12000)
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || `Custom Endpoint returned status ${res.status}`);
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
      }

      // 5. Antigravity CLI Local Server
      if (provider === 'antigravity') {
        if (isJson) {
          const res = await fetch(`${serverUrl}/api/ai/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word, reading: romaji, sentence, provider: 'antigravity' }),
            signal: AbortSignal.timeout(4000)
          });
          if (!res.ok) throw new Error(`Local server returned ${res.status}`);
          const raw = await res.json();
          return JSON.stringify(raw.data || raw);
        } else {
          // Check chat
          const res = await fetch(`${serverUrl}/api/ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, word, sentence }),
            signal: AbortSignal.timeout(4000)
          });
          if (res.ok) {
            const raw = await res.json();
            return raw.reply || raw.content || '';
          }
          throw new Error('Local server chat unavailable. Please select Gemini or DeepSeek in settings.');
        }
      }

      throw new Error(`Unsupported AI provider: ${provider}`);
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

    function appendChatMessage(role, text) {
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
      container.scrollTop = container.scrollHeight;
      return msgEl;
    }

    async function sendSenseiQuestion(questionText) {
      if (!questionText || !questionText.trim()) return;
      const word = document.getElementById('lp-active-word')?.textContent || '';
      const romaji = document.getElementById('lp-active-romaji')?.textContent || '';
      const sentence = drawerContextSentence || document.getElementById('lp-chat-context-sentence')?.textContent || document.getElementById('lp-sentence-jp')?.textContent || activeLiveSentence || '';

      appendChatMessage('user', questionText);
      senseiChatHistory.push({ role: 'user', content: questionText });

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
          const messages = [
            {
              role: 'system',
              content: `${SENSEI_SYSTEM_PROMPT}\\n\\nContext Sentence: "${sentence}"\\nTarget Word: "${word}" (${romaji})`
            },
            ...senseiChatHistory
          ];

          const reply = await callSenseiLlmApi({
            messages,
            isJson: false,
            config: cfg,
            word,
            romaji,
            sentence
          });

          senseiChatHistory.push({ role: 'assistant', content: reply });
          if (loadingEl) loadingEl.remove();
          appendChatMessage('sensei', reply);
        } catch (err) {
          if (loadingEl) loadingEl.remove();
          appendChatMessage('sensei', `⚠️ Sensei error: ${err.message}`);
        }
      });
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
          sendSenseiQuestion(val);
          chatInputEl.value = '';
        }
      });
      chatInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = chatInputEl.value.trim();
          if (val) {
            sendSenseiQuestion(val);
            chatInputEl.value = '';
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
        const provider = cfg.linguaplay_ai_provider || (cfg.linguaplay_gemini_key ? 'gemini' : 'antigravity');
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
                Quick-save your API key directly below, or open full extension settings:
              </p>
              <div style="display: flex; gap: 6px; margin-bottom: 8px; align-items: center;">
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

    setupLiveCaptionHooking();
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

  async function checkAndInitVideo() {
    const urlParams = new URLSearchParams(window.location.search);
    const vid = urlParams.get('v');
    if (!vid) return;

    if (vid !== currentVideoId) {
      currentVideoId = vid;
      currentSubIndex = -1;
      subtitleTimeline = [];
      activeLiveSentence = '';
      drawerContextSentence = '';
      drawerActiveWord = '';

      injectUI();

      const v = document.querySelector('video');
      if (v && v !== activeVideoEl) {
        if (activeVideoEl) activeVideoEl.removeEventListener('timeupdate', onTimeUpdate);
        activeVideoEl = v;
        activeVideoEl.addEventListener('timeupdate', onTimeUpdate);
        setupLiveCaptionHooking();
      }

      inspectAndSwitchPlayerTracks();

      const cues = await fetchYouTubeCaptions(vid);
      if (cues && cues.length > 0) {
        subtitleTimeline = cues;
        const statusBadge = document.getElementById('linguaplay-sub-status');
        if (statusBadge) statusBadge.textContent = `Auto Sub (${cues.length})`;
        ensureYouTubeCCEnabled();
      } else {
        subtitleTimeline = [];
        const statusBadge = document.getElementById('linguaplay-sub-status');
        if (statusBadge) statusBadge.textContent = '';
        renderSentenceTokens('');
      }
    }
  }

  setInterval(checkAndInitVideo, 1000);
  window.addEventListener('yt-navigate-finish', checkAndInitVideo);
  window.addEventListener('popstate', checkAndInitVideo);

})();
"""

with open(out_file, 'w', encoding='utf-8') as f:
    f.write(content_code)

print(f'Successfully built {out_file}!')
