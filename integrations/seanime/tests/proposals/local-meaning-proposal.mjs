import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=process.env.LANGPLAY_SOURCE_ROOT || '/home/marsel/Projects/LangPlay';
const {createServices}=await import(pathToFileURL(`${root}/integrations/seanime/src/services.js`));

test('offline dictionary wins without companion or AI access',async()=>{
  const services=createServices({fetch:async()=>assert.fail('A known word must stay offline')});
  assert.match((await services.lookup({surface:'食べた',baseForm:'食べる'})).meaning,/to eat/);
});

test('the screenshot kanji dictionary form has the existing offline kana meaning',async()=>{
  const services=createServices({fetch:async()=>assert.fail('面白い has a known offline equivalent')});
  assert.match((await services.lookup({surface:'面白',baseForm:'面白い'})).meaning,/interesting|funny/);
});

test('missing words use only a bounded local dictionary request with the base form',async()=>{
  const calls=[];
  const services=createServices({fetch:async(url,options)=>{
    calls.push([url,JSON.parse(options.body),options.timeout]);
    return {ok:true,json:()=>({status:'success',meaning:'kingfisher; jade'})};
  }});
  const result=await services.lookup({surface:'翡翠',baseForm:'翡翠',sentence:'Private context is not needed'});
  assert.equal(result.meaning,'kingfisher; jade');
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'http://127.0.0.1:8765/api/dictionary');
  assert.deepEqual(calls[0][1],{word:'翡翠'});
  assert.ok(calls[0][2]>0 && calls[0][2]<=10);
});

test('concurrent and repeated missing-word lookups reuse successful results',async()=>{
  let calls=0;
  const services=createServices({fetch:async()=>{
    calls++;return {ok:true,json:()=>({status:'success',meaning:'kingfisher; jade'})};
  }});
  const word={surface:'翡翠',baseForm:'翡翠'};
  const [a,b]=await Promise.all([services.lookup(word),services.lookup(word)]);
  assert.equal(a.meaning,'kingfisher; jade');assert.deepEqual(a,b);
  assert.equal((await services.lookup(word)).meaning,a.meaning);
  assert.equal(calls,1);
});

test('a failed online fallback stays recoverable and is not cached as a successful definition',async()=>{
  let available=false,calls=0;
  const services=createServices({fetch:async()=>{
    calls++; if(!available)throw Error('offline');
    return {ok:true,json:()=>({status:'success',meaning:'kingfisher; jade'})};
  }});
  assert.equal((await services.lookup({surface:'翡翠',baseForm:'翡翠'})).meaning,'');
  available=true;
  assert.equal((await services.lookup({surface:'翡翠',baseForm:'翡翠'})).meaning,'kingfisher; jade');
  assert.equal(calls,2);
});

test('invalid or oversized lookup inputs never reach the companion',async()=>{
  const services=createServices({fetch:async()=>assert.fail('Invalid word must not make a request')});
  for(const word of ['', ' '.repeat(2), '翡'.repeat(257)]){
    assert.equal((await services.lookup({surface:word,baseForm:word})).meaning,'');
  }
});
