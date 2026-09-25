import json, re

with open('extension/js/kanji-dict.js', 'r', encoding='utf-8') as f:
    dict_content = f.read()

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


  // ── Offline JDICT Dictionary Subset (<10ms instant lookup) ──
  const JDICT = {
    '私': 'I; me', '俺': 'I; me (masculine)', '僕': 'I; me (humble, male)', '君': 'you (informal)', 'あなた': 'you', '彼': 'he; him; boyfriend', '彼女': 'she; her; girlfriend', '誰': 'who',
    'これ': 'this', 'それ': 'that', 'あれ': 'that (over there)', 'どれ': 'which one', 'ここ': 'here', 'そこ': 'there', 'あそこ': 'over there', 'どこ': 'where',
    '自己': 'self; oneself', '嫌悪': 'disgust; hate; abhorrence', '自己嫌悪': 'self-hatred; self-disgust',
    '綺麗': 'beautiful; pretty; lovely; clean', '世界': 'world; universe; society',
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

    const readingData = getWordReading(token.surface);
    const displayReading = readingData.romaji && readingData.furigana !== readingData.romaji
      ? `${readingData.furigana} (${readingData.romaji})`
      : readingData.furigana;

    wordEl.textContent = token.surface;
    romajiEl.textContent = displayReading;
    posEl.textContent = `Base form: ${token.baseForm}`;
    activeLiveSentence = sentenceContext || token.surface;

    aiResults.innerHTML = '';
    aiResults.style.display = 'none';
    aiLoading.style.display = 'none';
    aiAnkiBtn.style.display = 'none';
    lastAiData = null;

    const local = JDICT[token.baseForm] || JDICT[token.surface];
    if (local) {
      defEl.innerHTML = local;
    } else {
      defEl.innerHTML = '<span style="opacity:0.6;">Looking up definition…</span>';
      fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=en&dt=t&q=${encodeURIComponent(token.baseForm)}`)
        .then(r => r.json())
        .then(d => {
          defEl.textContent = d[0]?.[0]?.[0] || 'No definition found';
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
    const target = data.target_word || {};
    const meaning = data.contextual_meaning || target.meaning || data.meaning || 'No meaning provided';
    const jlpt = target.jlpt_level || data.jlpt_level || 'N/A';
    const pos = target.pos || data.pos || 'Word';
    const formality = target.formality ? ` • ${target.formality}` : '';
    
    const sentenceFit = data.sentence_fit || {};
    const phraseConn = sentenceFit.phrase_connection || '';
    const sentenceRole = sentenceFit.role_in_sentence || data.grammar_role || '';
    const nuance = sentenceFit.context_nuance || data.nuance || '';
    
    const conj = data.conjugation;
    const sentTrans = data.sentence_translation || {};
    const wordByWord = data.word_by_word || data.sentence_breakdown || [];

    let html = `
      <div class="linguaplay-card-wrapper">
        <div style="font-size:10.5px; font-weight:bold; color:#a78bfa; letter-spacing:0.04em;">${providerTitle}</div>
        
        <div style="margin-top:6px; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
          <span class="linguaplay-badge">${jlpt}</span>
          <span class="linguaplay-badge" style="background:rgba(59,130,246,0.2); color:#93c5fd; border-color:rgba(59,130,246,0.3);">${pos}${formality}</span>
          <span style="font-size:13.5px; color:white; font-weight:600; margin-left:2px;">${meaning}</span>
        </div>

        ${phraseConn ? `
          <div style="font-size:12px; color:#cbd5e1; margin-top:8px; line-height:1.45; background:rgba(0,0,0,0.3); padding:8px 10px; border-radius:8px; border:1px solid rgba(167,139,250,0.25);">
            <strong style="color:#a78bfa; font-size:10px; text-transform:uppercase; display:block; margin-bottom:4px; letter-spacing:0.05em;">🔗 Sentence Connection Flow</strong>
            <div style="color:#f1f5f9; font-weight:500;">${phraseConn}</div>
          </div>
        ` : ''}

        ${sentenceRole ? `
          <div style="font-size:12px; color:#cbd5e1; margin-top:8px; line-height:1.45; border-top:1px solid rgba(255,255,255,0.08); padding-top:6px;">
            <strong style="color:#a78bfa; font-size:10px; text-transform:uppercase; display:block; margin-bottom:2px; letter-spacing:0.05em;">🎯 Role in This Sentence</strong>
            ${sentenceRole}
          </div>
        ` : ''}

        ${conj && (conj.is_conjugated || conj.explanation || conj.form) ? `
          <div style="font-size:11.5px; color:#cbd5e1; margin-top:8px; line-height:1.4; background:rgba(0,0,0,0.3); padding:8px 10px; border-radius:8px; border:1px solid rgba(244,114,182,0.2);">
            <span style="color:#f472b6; font-weight:600; font-size:10px; text-transform:uppercase; display:block; margin-bottom:2px;">Conjugation in Context:</span>
            ${conj.form ? `<span class="linguaplay-badge" style="background:rgba(244,114,182,0.2); color:#f472b6; border-color:rgba(244,114,182,0.3); font-size:10px;">${conj.form}</span> ` : ''}
            ${conj.from_base ? `Base: <strong>${conj.from_base}</strong> (${conj.from_base_romaji || conj.from_base_reading || ''})<br>` : ''}
            <span style="color:#e2e8f0;">${conj.explanation || ''}</span>
          </div>
        ` : ''}

        ${nuance ? `
          <div style="font-size:11.5px; color:#fda4af; margin-top:6px; font-style:italic; line-height:1.4;">
            💡 <strong>Context Nuance:</strong> ${nuance}
          </div>
        ` : ''}

        ${sentTrans && (sentTrans.en || sentTrans.jp) ? `
          <div style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.08); padding-top:6px;">
            <span style="font-size:10px; color:#6ee7b7; font-weight:bold; text-transform:uppercase; letter-spacing:0.05em;">🧩 Full Sentence Translation</span>
            <div style="font-size:13px; color:#f1f5f9; margin-top:3px; line-height:1.45; font-style:italic;">"${sentTrans.en || ''}"</div>
          </div>
        ` : ''}

        ${wordByWord.length > 0 ? `
          <div style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.08); padding-top:6px;">
            <span style="font-size:10px; color:#a78bfa; font-weight:bold; text-transform:uppercase; letter-spacing:0.05em; display:block; margin-bottom:4px;">📖 Horizontal Word-by-Word Gloss</span>
            <div class="linguaplay-gloss-container">
              ${wordByWord.map(w => `
                <div class="linguaplay-gloss-card ${w.is_target ? 'is-target' : ''}" title="${w.word} (${w.reading || ''}) — ${w.meaning || ''} ${w.role ? '[' + w.role + ']' : ''}">
                  <span class="linguaplay-gloss-reading">${w.reading || w.romaji || '&nbsp;'}</span>
                  <span class="linguaplay-gloss-jp">${w.word}</span>
                  <span class="linguaplay-gloss-en">${w.meaning || ''}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
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
        <div>
          <span id="lp-active-romaji" style="font-size: 13px; color: #fda4af; font-family: monospace; font-weight: 500;"></span>
          <h3 id="lp-active-word" style="font-size: 26px; font-weight: bold; color: white; margin: 3px 0 1px;"></h3>
          <span id="lp-active-pos" style="font-size: 11px; color: #94a3b8;"></span>
        </div>
        <button id="lp-dismiss-btn" style="background:rgba(255,255,255,0.08); border:none; color:#cbd5e1; font-size:12px; cursor:pointer; padding:5px 10px; border-radius:6px; transition:0.2s;">✕ Close</button>
      </div>

      <div class="linguaplay-card-wrapper">
        <div style="font-size: 10px; font-weight: bold; color: #a78bfa; text-transform: uppercase; margin-bottom: 4px; letter-spacing:0.04em;">📚 Dictionary Definition</div>
        <div id="lp-active-def" style="font-size: 13.5px; color: #e2e8f0; line-height: 1.5;"></div>
      </div>

      <button id="lp-quick-anki-btn" class="linguaplay-btn linguaplay-btn-secondary">
        🗃️ Quick Add to Anki
      </button>

      <button id="lp-ai-btn" class="linguaplay-btn linguaplay-btn-primary">
        ✨ Ask Antigravity AI
      </button>

      <div id="lp-ai-section">
        <div id="lp-ai-loading" style="display:none; font-size: 12px; color: #a78bfa; text-align: center; padding: 10px 0;">
          <span style="display:inline-block; animation:spin 1s linear infinite;">⚡</span> Analyzing in context...
        </div>
        <div id="lp-ai-results" style="margin-top: 10px; display: none;"></div>
        <button id="lp-ai-anki-btn" class="linguaplay-btn linguaplay-btn-secondary" style="display:none; margin-top: 8px;">
          🗂️ Save Enriched AI Card to Anki
        </button>
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
    document.getElementById('lp-dismiss-btn').addEventListener('click', () => {
      drawer.classList.add('hidden');
    });

    document.getElementById('lp-quick-anki-btn').addEventListener('click', async () => {
      const word = document.getElementById('lp-active-word').textContent;
      const romaji = document.getElementById('lp-active-romaji').textContent;
      const def = document.getElementById('lp-active-def').innerHTML;
      const sentence = activeLiveSentence || '';

      chrome.storage.local.get(['linguaplay_cards'], (res) => {
        const cards = res.linguaplay_cards || [];
        cards.push({ word, reading: word, meaning: def, sentence, date: new Date().toISOString() });
        chrome.storage.local.set({ linguaplay_cards: cards });
      });

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
                Back: `<div><strong>Meaning:</strong> ${def}</div><br><div><strong>Sentence:</strong> ${sentence.replace(word, '<b>' + word + '</b>')}</div>`
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

    document.getElementById('lp-ai-btn').addEventListener('click', async () => {
      const word = document.getElementById('lp-active-word').textContent;
      const romaji = document.getElementById('lp-active-romaji').textContent;
      const sentence = activeLiveSentence || '';
      const loading = document.getElementById('lp-ai-loading');
      const results = document.getElementById('lp-ai-results');
      const ankiBtn = document.getElementById('lp-ai-anki-btn');

      loading.style.display = 'block';
      results.style.display = 'none';
      ankiBtn.style.display = 'none';

      chrome.storage.local.get(['linguaplay_gemini_key', 'linguaplay_ai_provider', 'linguaplay_server_url'], async (cfg) => {
        const provider = cfg.linguaplay_ai_provider || 'antigravity';
        const serverUrl = cfg.linguaplay_server_url || 'http://127.0.0.1:8000';
        const geminiKey = cfg.linguaplay_gemini_key || '';

        // 1. Antigravity CLI Provider
        if (provider === 'antigravity') {
          try {
            const res = await fetch(`${serverUrl}/api/ai/analyze`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                word,
                reading: romaji,
                sentence,
                provider: 'antigravity'
              }),
              signal: AbortSignal.timeout(25000)
            });

            if (!res.ok) throw new Error(`Server returned ${res.status}`);
            const raw = await res.json();
            const aiData = raw.data || raw;
            lastAiData = aiData;

            loading.style.display = 'none';
            results.style.display = 'block';
            ankiBtn.style.display = 'block';

            results.innerHTML = renderPedagogicalBreakdown(aiData, '🤖 ANTIGRAVITY CLI BREAKDOWN');
            return;
          } catch (err) {
            if (geminiKey) {
              console.warn('[LinguaPlay] Local server offline, trying Gemini fallback...', err);
            } else {
              loading.style.display = 'none';
              results.style.display = 'block';
              results.innerHTML = `
                <div style="font-size: 11px; color: #fca5a5; line-height: 1.45; padding: 4px 0;">
                  <strong>Antigravity CLI:</strong> Could not connect to local server at <code>${serverUrl}</code>.<br>
                  Run <code>python3 Server.py</code> or configure a free Gemini API key in extension options.
                </div>
              `;
              return;
            }
          }
        }

        // 2. Direct Gemini API Fallback
        if (geminiKey) {
          try {
            const prompt = `You are an expert Japanese immersion tutor.
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
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey.trim()}`;
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: 'application/json' }
              })
            });

            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            const json = JSON.parse(text.replace(/```json|```/g, '').trim());
            lastAiData = json;

            loading.style.display = 'none';
            results.style.display = 'block';
            ankiBtn.style.display = 'block';

            results.innerHTML = renderPedagogicalBreakdown(json, '✨ GEMINI AI BREAKDOWN');
          } catch (err) {
            loading.style.display = 'none';
            results.style.display = 'block';
            results.innerHTML = `<div style="font-size: 11px; color: #fca5a5;">AI analysis error: ${err.message}</div>`;
          }
        }
      });
    });

    document.getElementById('lp-ai-anki-btn').addEventListener('click', () => {
      if (!lastAiData) return;
      const word = document.getElementById('lp-active-word').textContent;
      const sentence = activeLiveSentence || '';
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

with open('extension/content.js', 'w', encoding='utf-8') as f:
    f.write(content_code)

print('Successfully restored extension/content.js to 2:45 AM state!')
