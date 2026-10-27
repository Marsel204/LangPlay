import test from 'node:test';
import assert from 'node:assert/strict';
import {createLearningController} from '../src/learning-controller.js';
import {createAutoSubtitles} from '../src/auto-subtitles.js';
const text='1\n00:00:01,000 --> 00:00:03,000\n日本語です。\n';
const subtitle=name=>({sourceId:name,format:'srt',content:text});
function deferred(){let resolve; const promise=new Promise(r=>resolve=r);return{promise,resolve};}
async function fixture(overrides={}){
  let module;try{module=await import('../src/auto-subtitles.js');}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND')assert.fail('Automatic episode subtitle loading is not implemented');throw e;}
  let state={clientId:'a',playbackId:'p2',videoIdentity:'e2',mediaId:189046,association:'189046:2',episode:'2',positionMs:1500,durationMs:30000,paused:false,title:'Generated test'};
  const calls=[],values={sources:{}};
  const host={snapshot:()=>({...state}),pause(){assert.fail('automatic loading must not pause');},resume(){assert.fail('automatic loading must not resume');}};
  const services={savedSubtitles:async body=>{calls.push(['saved',body]);throw Error('File missing');},
    discoverSubtitles:async body=>{calls.push(['discover',body]);return subtitle(`episode-${body.episode}.srt`);},...overrides};
  const controller=createLearningController({host,services});await controller.refresh();
  const loader=module.createAutoSubtitles({host,controller,services,storage:{read:(k,d)=>values[k]??d,write:(k,v)=>values[k]=v},onChange(){}});
  return {loader,controller,calls,values,setEpisode(n){state={...state,episode:String(n),association:`189046:${n}`,playbackId:`p${n}`,videoIdentity:`e${n}`};}};
}
test('episode start searches and loads matching Japanese without an import action',async()=>{
 const h=await fixture();await h.loader.update();assert.equal(h.controller.view().source.sourceId,'episode-2.srt');
 assert.deepEqual(h.calls,[['discover',{mediaId:189046,episode:2}]]);assert.equal(h.values.sources['189046:2'].sourceId,'episode-2.srt');
 await h.loader.update();assert.equal(h.calls.length,1);
});
test('a saved episode association reloads its file and delay before searching',async()=>{
 const h=await fixture({savedSubtitles:async()=>subtitle('saved.srt')});h.values.sources['189046:2']={sourceId:'saved.srt',offsetMs:200};
 await h.loader.update();assert.equal(h.controller.view().source.sourceId,'saved.srt');assert.equal(h.controller.view().source.offsetMs,200);assert.equal(h.calls.length,0);
});
test('provider cache associations go through discovery validation before reuse', async () => {
  let reads = 0;
  const h = await fixture({ savedSubtitles: async () => { reads++; return {
    sourceId: 'Jimaku.189046.E02.ja.srt', format: 'srt', content: '1\n00:00:01,000 --> invalid\n日本語\n',
  }; } });
  h.values.sources['189046:2'] = { sourceId: 'Jimaku.189046.E02.ja.srt', offsetMs: 200 };
  await h.loader.update();
  assert.equal(reads, 0);
  assert.equal(h.controller.view().source.sourceId, 'episode-2.srt');
  assert.equal(h.loader.status().state, 'ready');
});
test('missing associated files fall back to the matching episode search',async()=>{
 const h=await fixture();h.values.sources['189046:2']={sourceId:'removed.srt',offsetMs:0};await h.loader.update();assert.equal(h.controller.view().source.sourceId,'episode-2.srt');
});
test('late episode results cannot overwrite the next episode',async()=>{
 const pending=deferred();const h=await fixture({discoverSubtitles:body=>body.episode===2?pending.promise:Promise.resolve(subtitle('episode-3.srt'))});
 const old=h.loader.update();h.setEpisode(3);await h.controller.refresh();await h.loader.update();pending.resolve(subtitle('episode-2.srt'));await old;
 assert.equal(h.controller.view().source.sourceId,'episode-3.srt');assert.equal(h.values.sources['189046:2'],undefined);
});
test('a manual choice made during discovery wins over its late result',async()=>{
 const pending=deferred();const h=await fixture({discoverSubtitles:()=>pending.promise});const work=h.loader.update();
 await h.controller.loadSubtitle(subtitle('manual.srt'));pending.resolve(subtitle('auto.srt'));await work;assert.equal(h.controller.view().source.sourceId,'manual.srt');
});
test('one pending request is deduplicated and failures require a deliberate retry',async()=>{
 const pending=deferred();let calls=0;const h=await fixture({discoverSubtitles:()=>{calls++;return pending.promise;}});
 const work=h.loader.update();h.loader.update();assert.equal(calls,1);pending.resolve(null);await work;
 assert.equal(h.loader.status().state,'error');await h.loader.update();assert.equal(calls,1);
 await h.loader.retry();assert.equal(calls,2);
});
test('turning automatic loading off prevents network access and invalidates pending work',async()=>{
 const pending=deferred();const h=await fixture({discoverSubtitles:()=>pending.promise});await h.loader.update(false);assert.equal(h.calls.length,0);
 const work=h.loader.update(true);await h.loader.update(false);pending.resolve(subtitle('auto.srt'));await work;assert.equal(h.controller.view().source,null);
});

test('turning automation off during the final playback refresh cancels source installation', async () => {
  const state = { clientId: 'a', playbackId: 'p', videoIdentity: 'v', mediaId: 1, episode: '1',
    association: '1:1', positionMs: 1500, durationMs: 30000, paused: false };
  let gateNext = false, release;
  const host = { snapshot: () => gateNext
    ? (gateNext = false, new Promise(resolve => { release = () => resolve({ ...state }); })) : { ...state } };
  const controller = createLearningController({ host, services: {} }); await controller.refresh();
  const loader = createAutoSubtitles({ host, controller: { ...controller,
    loadSubtitle(...args) { gateNext = true; return controller.loadSubtitle(...args); },
  }, services: { discoverSubtitles: async () => subtitle('auto.srt') }, storage: { read: () => ({}), write() {} } });
  const work = loader.update();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof release, 'function');
  await loader.update(false); release(); await work;
  assert.equal(controller.view().source, null);
  assert.equal(loader.status().state, 'idle');
});
test('expected playback is rechecked inside source installation',async()=>{
 const h=await fixture();const expected={clientId:'a',playbackId:'p2',videoIdentity:'e2'};h.setEpisode(3);
 await assert.rejects(()=>h.controller.loadSubtitle(subtitle('wrong.srt'),{expectedPlayback:expected,expectedSource:null}),/changed/i);
 assert.equal(h.controller.view().source,null);
});

test('a legacy association with an explicit wrong episode filename is never loaded automatically',async()=>{
 let reads=0;const h=await fixture({savedSubtitles:async()=>{reads++;return subtitle('ReZero.S04E01.ja.srt');}});
 h.values.sources['189046:2']={sourceId:'ReZero.S04E01.ja.srt',offsetMs:1000};
 await h.loader.update();assert.equal(reads,0,'known episode-one file must not be reused for episode two');assert.equal(h.controller.view().source.sourceId,'episode-2.srt');assert.equal(h.controller.view().source.offsetMs,0);
});
