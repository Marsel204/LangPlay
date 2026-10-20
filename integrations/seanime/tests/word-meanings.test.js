import test from 'node:test';
import assert from 'node:assert/strict';
import { createLearningController } from '../src/learning-controller.js';
import { createServices } from '../src/services.js';
import { sentenceParts } from '../src/sentence-reading.js';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
const tokens = [
  {surface:'猫',start:0,end:1,romaji:'neko',baseForm:'猫'},
  {surface:'が',start:1,end:2,romaji:'ga',baseForm:'が'},
  {surface:'いる',start:2,end:4,romaji:'iru',baseForm:'居る'},
  {surface:'。',start:4,end:5,pos:'補助記号'},
];
async function fixture(services) {
  let playback = {clientId:'a',playbackId:'b',videoIdentity:'c',positionMs:1500,paused:false};
  const controller = createLearningController({host:{snapshot:()=>playback,pause:()=>{},resume:()=>{}},services});
  await controller.loadSubtitle({sourceId:'test.srt',format:'srt',content:'1\n00:00:01,000 --> 00:00:04,000\n猫がいる。\n'});
  return {controller,select:()=>controller.select({cueId:controller.view().activeCues[0].id,start:0,end:1}),switchEpisode:async()=>{playback={...playback,videoIdentity:'new'};await controller.refresh();}};
}
test('word lookup starts alongside parsing; sentence readings do not await word meanings',async()=>{
  const parsed=deferred(), meanings=deferred(), calls=[];
  const {controller,select}=await fixture({parse:()=>parsed.promise,lookup:args=>{calls.push(args);return meanings.promise;}});
  const work=select();await flush();
  assert.equal(calls[0]?.surface,'猫','dictionary work must start before parsing finishes');
  parsed.resolve(tokens);await flush();
  assert.equal(controller.view().sentenceRomaji,'neko ga iru。');
  assert.equal(controller.view().sentenceTokens[0].meaningBusy,true);
  assert.ok(calls.some(word=>word.baseForm==='居る'),'conjugated tokens use dictionary forms');
  assert.equal(calls.some(word=>word.surface==='。'),false);
  meanings.resolve({meaning:'definition'});await work;await flush();
  assert.equal(controller.view().sentenceTokens.filter(t=>t.meaning==='definition').length,3);
  assert.equal(controller.view().sentenceTokens[0].meaningBusy,false);
});
test('cached tokens start all meanings while parsing is pending; late results cannot cross episodes',async()=>{
  const parsed=deferred(), meanings=deferred(), calls=[];
  const {controller,select,switchEpisode}=await fixture({cached:()=>tokens,parse:()=>parsed.promise,lookup:args=>{calls.push(args);return meanings.promise;}});
  const work=select();await flush();
  assert.ok(calls.some(word=>word.surface==='いる'));
  assert.equal(controller.view().sentenceTokens.length,4);
  await switchEpisode();parsed.resolve(tokens);meanings.resolve({meaning:'old'});await work;await flush();
  assert.deepEqual(controller.view().sentenceTokens,[]);
  assert.equal(controller.view().meaning,'');
});
test('dictionary queue handles more than four unknown words without dropping or duplicating lookups',async()=>{
  const gate=deferred();let active=0,max=0;const calls=[];
  const services=createServices({fetch:async(url,options)=>{calls.push(JSON.parse(options.body).word);active++;max=Math.max(max,active);await gate.promise;active--;return {ok:true,json:()=>({status:'success',meaning:'meaning'})};}});
  const words=Array.from({length:12},(_,i)=>`未登録語${i}`);
  const work=words.map(surface=>services.lookup({surface}));
  const duplicate=services.lookup({surface:words[7]});await flush();
  assert.equal(calls.length,4);gate.resolve();
  const results=await Promise.all([...work,duplicate]);
  assert.equal(results.every(result=>result.meaning==='meaning'),true);
  assert.equal(calls.length,12);assert.equal(max,4);
  await services.lookup({surface:words[7]});assert.equal(calls.length,12);
});
test('sentence annotation preserves punctuation, short glosses and honest unavailable states',()=>{
  const parts=sentenceParts('猫がいる。',tokens.map((t,i)=>({...t,meaning:i===0?'cat; feline':'',meaningBusy:i===1})));
  assert.equal(parts[0].gloss,'cat');assert.equal(parts[0].meaning,'cat; feline');
  assert.equal(parts[1].gloss,'Loading…');assert.equal(parts[2].gloss,'No definition');
  assert.equal(parts[3].gloss,'');assert.equal(parts.map(p=>p.surface).join(''),'猫がいる。');
});
