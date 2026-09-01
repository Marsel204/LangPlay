/**
 * LinguaPlay Chrome Extension — Dictionary Module (dict.js)
 * Built-in offline vocabulary lookups + online Google Translate fallback.
 */

export const JDICT = {
  '私': 'I; me', '俺': 'I; me (masculine)', '僕': 'I; me (humble, male)', 'あなた': 'you', '彼': 'he; him; boyfriend', '彼女': 'she; her; girlfriend', '誰': 'who',
  'これ': 'this', 'それ': 'that', 'あれ': 'that (over there)', 'どれ': 'which one', 'ここ': 'here', 'そこ': 'there', 'あそこ': 'over there', 'どこ': 'where',
  'は': '(topic marker)', 'が': '(subject marker)', 'を': '(object marker)', 'に': 'to; at; in', 'で': 'at; by; with', 'へ': 'towards', 'も': 'also; too',
  'の': '(possessive; of)', 'と': 'and; with; quotation', 'か': '(question marker)', 'よ': '(emphasis)', 'ね': '(confirmation; right?)', 'より': 'than; from',
  'から': 'from; since; because', 'まで': 'until; even', 'だけ': 'only; just', 'しか': 'only; but (with negative)', 'けど': 'but; however',
  'する': 'to do', 'ある': 'to exist (inanimate); to have', 'いる': 'to exist (animate); to be', '行く': 'to go', '来る': 'to come', '見る': 'to see; to look; to watch',
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
  '見える': 'to be visible; can see', '聞こえる': 'to be audible; can hear', '決める': 'to decide', '選ぶ': 'to choose',
  '探す': 'to search; to look for', '見つける': 'to find; to discover', '試す': 'to try', '続ける': 'to continue',
  '歌う': 'to sing', '踊る': 'to dance', '泳ぐ': 'to swim', '飛ぶ': 'to fly; to jump', '打つ': 'to hit; to strike', '切る': 'to cut',
  '着る': 'to wear (upper body)', '脱ぐ': 'to take off (clothes)', '洗う': 'to wash', '料理する': 'to cook',
  '運転する': 'to drive', '電話する': 'to call (phone)', '結婚する': 'to marry', '離婚する': 'to divorce',
  '引っ越す': 'to move (residence)', '紹介する': 'to introduce', '説明する': 'to explain', '練習する': 'to practice',
  '準備する': 'to prepare', '心配する': 'to worry', '期待する': 'to expect; to look forward to',
  '人': 'person; people', '子': 'child', '男': 'man; male', '女': 'woman; female', '友達': 'friend', '先生': 'teacher; doctor', '学生': 'student',
  '今': 'now', '今日': 'today', '明日': 'tomorrow', '昨日': 'yesterday', '朝': 'morning', '昼': 'noon; daytime', '夜': 'night', '時間': 'time; hour',
  '家': 'house; home', '学校': 'school', '会社': 'company', '駅': 'train station', '病院': 'hospital', '店': 'shop; store',
  '水': 'water', '食べ物': 'food', '飲み物': 'drink; beverage', 'お金': 'money', '車': 'car', '電車': 'train', '飛行機': 'airplane',
  '日本': 'Japan', '日本語': 'Japanese (language)', '英語': 'English (language)', '言葉': 'word; language', '名前': 'name', '仕事': 'work; job',
  '天気': 'weather', '雨': 'rain', '雪': 'snow', '風': 'wind', '山': 'mountain', '海': 'sea; ocean', '川': 'river', '花': 'flower', '木': 'tree; wood',
  '犬': 'dog', '猫': 'cat', '魚': 'fish', '鳥': 'bird', '音楽': 'music', '映画': 'movie; film', '本': 'book', '写真': 'photograph', '色': 'color',
  '心': 'heart; mind', '気持ち': 'feeling', '愛': 'love', '夢': 'dream', '命': 'life; fate', '力': 'power; force', '光': 'light', '影': 'shadow',
  '世界': 'world', '歴史': 'history', '未来': 'future', '過去': 'past', '平和': 'peace', '戦争': 'war',
  '大きい': 'big; large', '小さい': 'small; little', '新しい': 'new', '古い': 'old', '良い': 'good', '悪い': 'bad',
  '高い': 'tall; high; expensive', '低い': 'low; short', '長い': 'long', '短い': 'short', '早い': 'early; fast', '遅い': 'slow; late',
  '強い': 'strong', '弱い': 'weak', '暖かい': 'warm', '暑い': 'hot (weather)', '寒い': 'cold (weather)', '冷たい': 'cold (to touch)',
  '美しい': 'beautiful', '可愛い': 'cute', '難しい': 'difficult', '易しい': 'easy', '楽しい': 'fun; enjoyable', '嬉しい': 'happy; glad',
  '悲しい': 'sad', '怖い': 'scary', '痛い': 'painful', 'すごい': 'amazing; incredible', 'やばい': 'dangerous; risky', 'おいしい': 'delicious',
  'うれしい': 'happy; glad', '寂しい': 'lonely', 'つまらない': 'boring', 'おもしろい': 'interesting; funny', '忙しい': 'busy',
  '元気': 'healthy; energetic', '有名': 'famous', '好き': 'liked; favorite', '嫌い': 'disliked', '上手': 'skilled; good at', '下手': 'unskilled; bad at',
  '素敵': 'wonderful; lovely', '大切': 'important; precious', '大丈夫': 'all right; OK', '簡単': 'easy; simple', '色々': 'various',
  '静か': 'quiet', '便利': 'convenient; handy', '不便': 'inconvenient', '危険': 'dangerous', '安全': 'safe',
  'とても': 'very; really', 'すごく': 'very; extremely', 'ちょっと': 'a little; slightly', '全然': 'not at all (with neg.)',
  'まだ': 'still; yet; not yet', 'もう': 'already; soon', 'いつも': 'always', '時々': 'sometimes', 'ずっと': 'the whole time; always',
  '初めて': 'for the first time', '一緒に': 'together', '一番': 'the most; number one', 'たくさん': 'many; a lot', '少し': 'a little; a few',
  '本当に': 'really; truly', '絶対': 'absolutely', '全部': 'all; everything', '大体': 'mostly; generally',
  'ありがとう': 'thank you', 'ごめん': 'sorry', 'おはよう': 'good morning', 'こんにちは': 'hello', 'さよなら': 'goodbye',
  'お願い': 'please (request)', 'だめ': 'no good; useless', '無理': 'impossible; unreasonable',
  '本当': 'truth; reality', '崩壊': 'collapse; destruction', '最後': 'last; final', '最初': 'first; beginning', '次': 'next', '前': 'before; front', '後': 'after; behind'
};

/**
 * Fetch online definition from Google Translate fallback API
 * @param {string} word
 * @returns {Promise<string|null>} Formatted translation HTML or null
 */
export async function fetchGoogleTranslation(word) {
  if (!word || !word.trim()) return null;
  const cleanWord = word.trim();
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=en&dt=t&dt=bd&q=${encodeURIComponent(cleanWord)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;

    const data = await res.json();
    let translation = data[0]?.[0]?.[0] || '';
    let dictDefs = [];

    if (data[1]) {
      data[1].forEach(pos => {
        if (pos[1] && pos[1].length > 0) {
          dictDefs.push(`${pos[0]}: ${pos[1].slice(0, 4).join(', ')}`);
        }
      });
    }

    let result = translation;
    if (dictDefs.length > 0) {
      result += ` — <span style="color: #94a3b8; font-style: italic; font-size: 11px;">(${dictDefs.join(' | ')})</span>`;
    }

    return result || null;
  } catch (err) {
    clearTimeout(timer);
    console.warn('[Dict] Google translate lookup fallback failed:', err);
    return null;
  }
}
