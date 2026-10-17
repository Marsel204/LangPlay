'use strict';
const $ = id => document.getElementById(id);
const player = document.querySelector('.player');
const state = { playing:true, learning:true, panel:null, cue:2, word:'来ない', reading:'furigana', offset:0, offline:false, selected:0, generation:0, saved:false };
let returnFocus = null;
let returnFocusLabel = null;
let toastTimer;
const words = {
  '彼':{reading:'かれ',romaji:'kare',definition:'he; him',lemma:'彼',type:'pronoun'},
  'は':{reading:'わ',romaji:'wa',definition:'marks the topic of a sentence',lemma:'は',type:'particle'},
  'まだ':{reading:'まだ',romaji:'mada',definition:'still; yet',lemma:'まだ',type:'adverb'},
  '来ない':{reading:'こない',romaji:'konai',definition:"hasn't come; isn't coming",lemma:'来る',type:'verb'},
  '明日':{reading:'あした',romaji:'ashita',definition:'tomorrow',lemma:'明日',type:'noun'},
  'また':{reading:'また',romaji:'mata',definition:'again; once more',lemma:'また',type:'adverb'},
  'ここ':{reading:'ここ',romaji:'koko',definition:'here; this place',lemma:'ここ',type:'pronoun'},
  'で':{reading:'で',romaji:'de',definition:'marks where an action happens',lemma:'で',type:'particle'},
  '会おう':{reading:'あおう',romaji:'aou',definition:"let's meet",lemma:'会う',type:'verb'},
  'もう':{reading:'もう',romaji:'mou',definition:'already; any more',lemma:'もう',type:'adverb'},
  '少し':{reading:'すこし',romaji:'sukoshi',definition:'a little; a little longer',lemma:'少し',type:'adverb'},
  '待とう':{reading:'まとう',romaji:'matou',definition:"let's wait",lemma:'待つ',type:'verb'},
  'そろそろ':{reading:'そろそろ',romaji:'sorosoro',definition:'soon; about time',lemma:'そろそろ',type:'adverb'},
  '行こう':{reading:'いこう',romaji:'ikou',definition:"let's go",lemma:'行く',type:'verb'},
  'この':{reading:'この',romaji:'kono',definition:'this',lemma:'この',type:'determiner'},
  '場所':{reading:'ばしょ',romaji:'basho',definition:'place; location',lemma:'場所',type:'noun'},
  'を':{reading:'を',romaji:'o',definition:'marks the object of an action',lemma:'を',type:'particle'},
  '覚えている':{reading:'おぼえている',romaji:'oboete iru',definition:'remember; have in memory',lemma:'覚える',type:'verb'}
};
const cues = [
 {time:438,tokens:['この','場所','を','覚えている'],end:'。',translation:'I remember this place.'},
 {time:450,tokens:['明日','、','また','ここ','で','会おう'],end:'。',translation:"Let's meet here again tomorrow."},
 {time:462,tokens:['彼','は','まだ','来ない'],end:'。',translation:"He hasn't come yet."},
 {time:477,tokens:['もう','少し','待とう'],end:'。',translation:"Let's wait a little longer."},
 {time:489,tokens:['そろそろ','行こう'],end:'。',translation:"It's about time we went."}
];
const filenames = ['The Way Home - 03.ja.ass','Kaerimichi.S01E03.WEB.ja.srt','帰り道 第03話 日本語字幕.ass'];
const sentence = () => cues[state.cue].tokens.join('') + cues[state.cue].end;
const formatTime = t => `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
function notify(message) {
  clearTimeout(toastTimer); $('toast').textContent=message; $('toast').hidden=false;
  toastTimer=setTimeout(()=>$('toast').hidden=true,3200);
}
function renderSubtitle() {
  const container=$('subtitle-line'); container.replaceChildren();
  container.classList.toggle('reading-plain',state.reading==='plain');
  for(const token of cues[state.cue].tokens) {
    if(!words[token]) { container.append(document.createTextNode(token)); continue; }
    const button=document.createElement('button'); button.type='button'; button.className='word';
    button.setAttribute('aria-label',`${token} — look up word`);
    const ruby=document.createElement('ruby'); ruby.append(document.createTextNode(token));
    const rt=document.createElement('rt'); rt.textContent=state.reading==='romaji'?words[token].romaji:words[token].reading;
    ruby.append(rt); button.append(ruby);
    button.classList.toggle('selected',state.panel==='lookup'&&state.word===token);
    if(!state.learning) { button.disabled=true; button.removeAttribute('aria-label'); }
    button.addEventListener('click',()=>selectWord(token,button)); container.append(button);
  }
  container.append(document.createTextNode(cues[state.cue].end));
}
function renderPlayback() {
  $('play-toggle').setAttribute('aria-label',state.playing?'Pause preview':'Resume watching');
  $('play-toggle').querySelector('use').setAttribute('href',state.playing?'#i-pause':'#i-play');
  $('playback-state').hidden=state.playing;
  $('playback-state').textContent=state.panel==='lookup'?'Paused for lookup':'Paused';
  $('subtitle-hint').hidden=!!state.panel||!state.learning;
}
function renderTimeline() {
  $('current-time').textContent=formatTime(Number($('timeline').value));
  const percent=Number($('timeline').value)/14.4;
  $('timeline').style.setProperty('--position',`${percent}%`);
}
function showPanel(name,trigger=null) {
  if(trigger) { returnFocus=trigger;returnFocusLabel=trigger.classList.contains('word')?trigger.getAttribute('aria-label'):null; }
  state.playing=false; state.panel=name; state.generation++;
  $('drawer').hidden=false; player.classList.add('has-panel');
  for(const panel of document.querySelectorAll('.panel-content')) panel.hidden=panel.id!==`${name}-panel`;
  $('drawer-title').textContent={lookup:'Word lookup',subtitles:'Japanese subtitles',transcript:'Transcript',settings:'Subtitle appearance'}[name];
  if(name==='transcript')renderTranscript();
  renderPlayback(); renderSubtitle(); $('drawer-title').focus({preventScroll:true});
}
function closePanel({restoreFocus=true}={}) {
  state.panel=null; state.generation++;
  $('drawer').hidden=true; player.classList.remove('has-panel'); renderPlayback();renderSubtitle();
  if(restoreFocus) {
    const replacement=returnFocusLabel?Array.from(document.querySelectorAll('.word')).find(button=>button.getAttribute('aria-label')===returnFocusLabel):null;
    const visibleOriginal=returnFocus?.isConnected&&returnFocus.getClientRects().length?returnFocus:null;
    const target=replacement||visibleOriginal||$('play-toggle'); target.focus({preventScroll:true});
  }
}
function resume() { closePanel({restoreFocus:false});state.playing=true;renderPlayback();$('play-toggle').focus({preventScroll:true}); }
function selectWord(word,trigger) {
  state.word=word;state.saved=false;
  const data=words[word];$('lookup-word').textContent=word;
  $('lookup-reading').replaceChildren(document.createTextNode(data.reading+' '));
  const romaji=document.createElement('span');romaji.textContent=data.romaji;$('lookup-reading').append(romaji);
  $('lookup-definition').textContent=data.definition;$('lookup-lemma').textContent=data.lemma;$('lookup-type').textContent=data.type;
  const captured=$('captured-sentence');captured.replaceChildren();
  for(const token of cues[state.cue].tokens) {
    const element=document.createElement(token===word?'mark':'span');element.textContent=token;captured.append(element);
  }
  captured.append(document.createTextNode(cues[state.cue].end));
  $('sentence-translation').textContent=cues[state.cue].translation;$('sentence-translation').hidden=true;
  $('show-translation').textContent='Show sentence meaning';$('show-translation').setAttribute('aria-expanded','false');
  $('explanation').hidden=true;$('explain').textContent='Explain this line';$('explain').disabled=false;
  $('sample-answer').hidden=true;$('question').value='';
  $('question').placeholder=word==='来ない'?'Why does 来る become 来ない?':'Ask about this word or sentence';
  $('save-card').disabled=false;$('save-card').querySelector('span').textContent='Save to Anki';
  $('card-status').textContent='Word + sentence + episode context';
  document.querySelectorAll('.selected-time').forEach(node=>node.textContent=formatTime(cues[state.cue].time));
  showPanel('lookup',trigger);
}
function renderTranscript() {
  $('transcript-list').replaceChildren();
  cues.forEach((cue,index)=>{
    const button=document.createElement('button');button.type='button';button.className='transcript-cue';button.setAttribute('aria-current',String(index===state.cue));
    const time=document.createElement('time');time.textContent=formatTime(cue.time);
    const text=document.createElement('span');text.lang='ja';text.textContent=cue.tokens.join('')+cue.end;
    button.append(time,text);button.addEventListener('click',()=>{state.cue=index;$('timeline').value=cue.time;renderTimeline();selectWord(cue.tokens.find(t=>words[t]),button);});
    $('transcript-list').append(button);
  });
}
document.querySelectorAll('[data-open]').forEach(button=>button.addEventListener('click',()=>showPanel(button.dataset.open,button)));
document.querySelectorAll('[data-resume]').forEach(button=>button.addEventListener('click',resume));
$('close-drawer').addEventListener('click',()=>closePanel());
$('play-toggle').addEventListener('click',()=>{if(!state.playing)resume();else{state.playing=false;renderPlayback();}});
$('learning-switch').addEventListener('click',()=>{
  state.learning=!state.learning;$('learning-switch').setAttribute('aria-pressed',String(state.learning));
  $('learning-switch').lastChild.textContent=state.learning?'Learning on':'Learning off';
  if(!state.learning&&state.panel==='lookup')closePanel();renderSubtitle();renderPlayback();
});
$('show-translation').addEventListener('click',()=>{
  const show=$('sentence-translation').hidden;$('sentence-translation').hidden=!show;
  $('show-translation').textContent=show?'Hide sentence meaning':'Show sentence meaning';$('show-translation').setAttribute('aria-expanded',String(show));
});
$('explain').addEventListener('click',()=>{
  const generation=state.generation;const word=state.word;
  $('explanation').hidden=false;
  if(state.offline) { $('explanation').textContent='AI is unavailable in this simulated state. Your subtitle and dictionary result remain usable. Turn off the simulation in appearance settings to retry.';return; }
  $('explain').disabled=true;$('explain').textContent='Loading sample explanation…';$('explanation').textContent='Showing a fixture response. No request is sent.';
  setTimeout(()=>{
    if(generation!==state.generation)return;
    $('explain').disabled=false;$('explain').textContent='Explain again';$('explanation').replaceChildren();
    const title=document.createElement('strong');title.textContent=word==='来ない'?'来る → 来ない':'Reading the sentence';
    const body=document.createElement('p');body.textContent=word==='来ない'?"来る (to come) is irregular. Its plain negative form is 来ない (こない). Here, まだ + a negative verb means ‘not yet’: he hasn't come yet.":`The selected ${words[word].type} is “${word}”. Read it with the whole sentence: “${cues[state.cue].translation}” This is authored sample content, not live AI output.`;
    const label=document.createElement('p');label.className='response-label';label.textContent='Sample explanation';$('explanation').append(title,body,label);
  },600);
});
$('question-form').addEventListener('submit',event=>{
  event.preventDefault();if(!$('question').value.trim())return;
  $('sample-answer').hidden=false;
  $('sample-answer').textContent=state.offline?'AI is unavailable in this simulated state. The question stays here for retry.':"Sample tutor response: 来る is irregular, so its negative uses the reading こ, giving 来ない. This fixture demonstrates where a contextual reply appears; it is not generated from your question.";
});
$('save-card').addEventListener('click',()=>{
  if(state.saved)return;const generation=state.generation;$('save-card').disabled=true;$('card-status').textContent='Simulating a card save…';
  setTimeout(()=>{if(generation!==state.generation)return;state.saved=true;$('save-card').querySelector('span').textContent='Saved · demo';$('card-status').textContent='Demo only — no card was sent to Anki.';},450);
});
document.querySelectorAll('[name="candidate"]').forEach(input=>input.addEventListener('change',()=>state.selected=Number(input.value)));
$('apply-subtitle').addEventListener('click',()=>{
  $('current-subtitle').textContent=filenames[state.selected];$('current-subtitle-meta').textContent=`Jimaku sample · ${state.selected===1?'SRT':'ASS'}`;closePanel();notify('Sample subtitle selected. Playback stays paused.');
});
$('subtitle-file').addEventListener('change',()=>{
  const file=$('subtitle-file').files[0];if(!file)return;
  if(!/\.(ass|ssa|srt|vtt)$/i.test(file.name)){notify('Choose an ASS, SSA, SRT, or VTT subtitle.');return;}
  $('current-subtitle').textContent=file.name;$('current-subtitle-meta').textContent='Local filename preview only';notify('Filename preview only — fixture cues remain in use.');
});
$('refresh-results').addEventListener('click',()=>{
  const generation=state.generation;$('refresh-results').disabled=true;$('subtitle-results-status').textContent='Loading sample matches…';
  setTimeout(()=>{if(generation!==state.generation){$('refresh-results').disabled=false;return;}$('candidate-list').hidden=false;$('apply-subtitle').disabled=false;$('subtitle-results-status').textContent='3 sample files. No live search or download.';$('refresh-results').disabled=false;},500);
});
function renderOffset(){ $('offset').value=`${state.offset>0?'+':''}${state.offset.toFixed(1)} s`; }
document.querySelectorAll('[data-offset]').forEach(button=>button.addEventListener('click',()=>{state.offset=Math.round((state.offset+Number(button.dataset.offset))*10)/10;renderOffset();}));
$('reset-offset').addEventListener('click',()=>{state.offset=0;renderOffset();});
document.querySelectorAll('[data-reading]').forEach(button=>button.addEventListener('click',()=>{state.reading=button.dataset.reading;document.querySelectorAll('[data-reading]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderSubtitle();}));
$('subtitle-size').addEventListener('input',()=>{document.documentElement.style.setProperty('--subtitle-size',`${$('subtitle-size').value}px`);$('size-value').value=`${$('subtitle-size').value} px`;});
$('subtitle-backing').addEventListener('change',()=>$('subtitle-line').classList.toggle('no-backing',!$('subtitle-backing').checked));
document.querySelectorAll('[data-accent]').forEach(button=>button.addEventListener('click',()=>{
  document.documentElement.style.setProperty('--accent',button.dataset.accent==='host'?'#c4b5fd':'#eac38a');
  document.documentElement.style.setProperty('--accent-ink',button.dataset.accent==='host'?'#211b35':'#20180f');
  document.querySelectorAll('[data-accent]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
}));
$('toggle-offline').addEventListener('click',()=>{state.offline=!state.offline;$('toggle-offline').setAttribute('aria-pressed',String(state.offline));$('toggle-offline').textContent=state.offline?'Restore sample AI response':'Simulate AI unavailable';notify(state.offline?'AI unavailable simulation enabled. Dictionary lookup still works.':'Sample AI response restored.');});
$('no-results').addEventListener('click',()=>{showPanel('subtitles',$('no-results'));$('candidate-list').hidden=true;$('apply-subtitle').disabled=true;$('subtitle-results-status').textContent='No sample matches. Import a local subtitle or refresh to restore the fixtures.';});
function changeCue(delta) { state.cue=Math.max(0,Math.min(cues.length-1,state.cue+delta));$('timeline').value=cues[state.cue].time;if(state.panel)closePanel();renderSubtitle();renderTimeline();notify('Sample subtitle changed. Video playback is simulated.'); }
$('previous-cue').addEventListener('click',()=>changeCue(-1));$('next-cue').addEventListener('click',()=>changeCue(1));
$('repeat-cue').addEventListener('click',()=>{ $('timeline').value=cues[state.cue].time;renderTimeline();notify('Repeat cue preview. The image is a sample still.'); });
$('timeline').addEventListener('input',()=>{const time=Number($('timeline').value);state.cue=cues.reduce((index,cue,i)=>time>=cue.time?i:index,0);if(state.panel)closePanel({restoreFocus:false});renderTimeline();renderSubtitle();});
$('fullscreen').addEventListener('click',async()=>{
  try { if(document.fullscreenElement)await document.exitFullscreen();else await player.requestFullscreen(); }
  catch {notify('Fullscreen is unavailable in this preview window.');}
});
document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');});
document.addEventListener('keydown',event=>{
  const typing=event.target.closest('input,textarea,select,[contenteditable="true"]');
  if(event.key==='Escape'&&state.panel){event.preventDefault();closePanel();return;}
  if(typing)return;
  if(event.code==='Space'&&event.target.tagName!=='BUTTON'){event.preventDefault();if(state.playing){state.playing=false;renderPlayback();}else resume();}
  if(event.key.toLowerCase()==='r'&&!event.ctrlKey&&!event.metaKey){event.preventDefault();$('repeat-cue').click();}
});
renderSubtitle();renderPlayback();renderTimeline();
