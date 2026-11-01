const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function load(fetch) {
  const context = {URL, AbortSignal, AbortController, setTimeout, clearTimeout, TextDecoder, fetch, chrome: {permissions: {contains: async () => true}}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('extension/js/router.js', 'utf8'), context);
  return context.RouterAI;
}
test('9Router normalizes URL and preserves model, rejects secrets in URL', () => {
  const router = load();
  for (const url of ['', 'http://127.0.0.1:20128/', 'http://127.0.0.1:20128/v1/chat/completions/']) {
    assert.equal(router.config({url, model:' oc/exact '}).url, 'http://127.0.0.1:20128/v1');
    assert.equal(router.config({url, model:' oc/exact '}).model, 'oc/exact');
  }
  for (const url of ['file:///tmp', 'https://u:secret@host', 'http://host/?secret=x', 'http://host/#secret']) assert.throws(() => router.config({url, model:'x'}));
  assert.throws(() => router.config({model:''}), /model/i);
});
test('9Router completion is bounded, optional bearer and JSON mode', async () => {
  let call;
  const router = load(async (url, options) => {
    call = {url, options};
    return new Response(JSON.stringify({choices:[{finish_reason:'stop', message:{content:'{"ok":true}'}}]}));
  });
  assert.equal(await router.request({model:'combo', key:'fake-token'}, {messages:[{role:'user',content:'Hi'}], isJson:true}), '{"ok":true}');
  assert.equal(call.options.headers.Authorization, 'Bearer fake-token');
  assert.equal(call.options.redirect, 'error');
  assert.equal(JSON.parse(call.options.body).stream, false);
  await router.request({model:'combo'}, {messages:[{role:'user',content:'Hi'}]});
  assert.equal(call.options.headers.Authorization, undefined);
});
test('9Router sanitizes upstream and rejects empty/truncated/wrong responses', async () => {
  for (const body of [[], {}, {choices:[null]}, {choices:[{finish_reason:'length',message:{content:'secret'}}]}, {choices:[{finish_reason:'stop',message:{content:''}}]}]) {
    const router = load(async () => new Response(JSON.stringify(body)));
    await assert.rejects(router.request({model:'x'}, {messages:[{role:'user',content:'x'}]}), /9Router/);
  }
  const router = load(async () => {throw new Error('9Router fake-token');});
  await assert.rejects(router.request({model:'x'}, {messages:[{role:'user',content:'x'}]}), error => !error.message.includes('fake-token'));
});
test('9Router discovery, permission denial, response limit, HTTP hints and field types', async () => {
  const router = load(async () => new Response(JSON.stringify({data:[{id:'oc/model'},{id:'combo'}]})));
  assert.equal(JSON.stringify(await router.request({}, {models:true})), '["oc/model","combo"]');
  for (const values of [{model:42},{model:'x', key:{}},{model:'x', url:[]}]) assert.throws(() => router.config(values), /text/);
  const context = {URL, AbortSignal, AbortController, setTimeout, clearTimeout, TextDecoder, chrome:{permissions:{contains:async()=>false}}, fetch:()=>{throw new Error('must not fetch');}};
  vm.createContext(context); vm.runInContext(fs.readFileSync('extension/js/router.js','utf8'),context);
  await assert.rejects(context.RouterAI.request({model:'x'}, {messages:[{role:'user',content:'x'}]}), /Allow access/);
  for (const [status, hint] of [[401,/token rejected/],[403,/access denied/],[429,/rate limit/],[500,/configuration/]]) {
    const router = load(async () => new Response('fake-secret', {status}));
    await assert.rejects(router.request({model:'x'}, {messages:[{role:'user',content:'x'}]}), hint);
  }
  const oversized = load(async () => new Response('x'.repeat(2*1024*1024+1)));
  await assert.rejects(oversized.request({model:'x'}, {messages:[{role:'user',content:'x'}]}), /oversized/);
});
test('server player routes 9Router through credential-free companion and cancels stale results', async () => {
  let sent, resolveResponse;
  const source = fs.readFileSync('static/js/ai.js','utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  const sandbox = {AbortController, AbortSignal, console, localStorage:{getItem:()=>null,setItem:()=>{}}, fetch:async(url, options)=>{
    sent = {url, options};
    return await new Promise(resolve=>{resolveResponse=resolve;});
  }};
  vm.createContext(sandbox);
  vm.runInContext(source+'\nglobalThis.ai={setAIProvider,requestAIAnalysis};',sandbox);
  sandbox.ai.setAIProvider('9router');
  let result;
  const pending = sandbox.ai.requestAIAnalysis({word:'猫',onSuccess:data=>{result=data;},onError:error=>{throw new Error(error);}});
  assert.equal(sent.url, '/api/ai/analyze');
  assert.equal(JSON.parse(sent.options.body).provider, '9router');
  assert.equal(Object.hasOwn(JSON.parse(sent.options.body),'apiKey'), false);
  resolveResponse({ok:true,json:async()=>({status:'success',data:{meaning:'cat'}})});
  await pending;
  assert.equal(result.meaning,'cat');
  result = null;
  const stale = sandbox.ai.requestAIAnalysis({word:'猫',onSuccess:data=>{result=data;},onError:()=>{result='error';}});
  sandbox.ai.setAIProvider('gemini');
  resolveResponse({ok:true,json:async()=>({status:'success',data:{meaning:'stale'}})});
  await stale;
  assert.equal(result,null);
});
test('YouTube analysis, chat and song messages dispatch through worker without router credentials', async () => {
  const source = fs.readFileSync('extension/content.js','utf8');
  const start = source.indexOf('  function getSenseiProvider(');
  const end = source.indexOf('  // ── Sensei AI Song Identification', start);
  const calls=[];
  const sandbox={chrome:{runtime:{sendMessage:(request, callback)=>{calls.push(request);callback({success:true,content:'{"meaning":"cat"}'});}}}, fetch:()=>{throw new Error('Page must not fetch router');}};
  vm.createContext(sandbox);
  vm.runInContext(source.slice(start,end)+'\nglobalThis.call=callSenseiLlmApi;',sandbox);
  for (const isJson of [true,false]) {
    const result=await sandbox.call({messages:[{role:'user',content:'Explain 猫'}],isJson,config:{linguaplay_ai_provider:'9router'}});
    assert.equal(result,'{"meaning":"cat"}');
    assert.equal(calls.at(-1).action,'CALL_9ROUTER');
    assert.equal(Object.keys(calls.at(-1)).sort().join(','),'action,isJson,messages');
  }
  sandbox.chrome.runtime.sendMessage=(request,callback)=>callback({success:false,error:'9Router token rejected.'});
  await assert.rejects(sandbox.call({messages:[{role:'user',content:'x'}],isJson:true,config:{linguaplay_ai_provider:'9router',linguaplay_gemini_key:'fake-unused'}}),/9Router token rejected/);
});

test('9Router requires array choices and releases rejected HTTP streams', async () => {
  const malformed = load(async()=>new Response(JSON.stringify({choices:{0:{finish_reason:'stop',message:{content:'OK'}}}})));
  await assert.rejects(malformed.request({model:'x'}, {messages:[{role:'user',content:'x'}]}), /malformed/);
  let cancelled = false;
  const router = load(async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}), {status:401}));
  await assert.rejects(router.request({model:'x'}, {messages:[{role:'user',content:'x'}]}), /token rejected/);
  assert.equal(cancelled,true);
});

function deferred() {let resolve; const promise = new Promise(r=>resolve=r); return {promise,resolve};}
function optionsHarness() {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id,{value:'',textContent:'',disabled:false,children:[],style:{},classList:{add(){},remove(){}}, handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},replaceChildren(...items){this.children=items;}});
    return elements.get(id);
  }
  let ready;
  const calls=[];
  const sandbox={URL,AbortController,setTimeout,clearTimeout,document:{getElementById:element,addEventListener:(t,fn)=>ready=fn,createElement:()=>({})}, chrome:{permissions:{contains:async()=>true,request:async()=>true},storage:{local:{get:(keys,cb)=>cb({}),set(){}}}},RouterAI:{config:load().config,request:(values,options)=>{const d=deferred();calls.push({values,options,...d});return d.promise;}}};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync('extension/options.js','utf8'),sandbox);ready();
  element('9router-model').value='model';
  return {element,calls,sandbox,click:id=>element(id).handlers.click({currentTarget:element(id)}),edit:(id,value)=>{element(id).value=value; element(id).handlers.input?.();}};
}
const tick = () => new Promise(resolve=>setImmediate(resolve));
test('Options handlers invalidate edited and competing checks, including permission waits', async()=>{
  const h=optionsHarness();
  const first=h.click('test-9router-btn'); await tick();
  h.edit('9router-key','new-key'); h.calls[0].resolve('OK');await first;
  assert.doesNotMatch(h.element('9router-status-text').textContent,/returned a completion/);
  const models=h.click('load-9router-models-btn');await tick();
  const newer=h.click('test-9router-btn');await tick();
  h.calls[2].resolve('OK');await newer;h.calls[1].resolve(['obsolete']);await models;
  assert.match(h.element('9router-status-text').textContent,/returned a completion/);
  assert.equal(h.element('9router-models').children.length,0);
  const permission=deferred();h.sandbox.chrome.permissions.contains=()=>permission.promise;
  const waiting=h.click('test-9router-btn');
  h.edit('9router-url','http://localhost:20128/v1'); permission.resolve(true);await waiting;
  assert.equal(h.calls.length,3,'obsolete permission continuation must not start transport');
});

test('both production provider handlers restore explanation UI and preserve selection',()=>{
  for(const path of ['static/js/app.js','extension/js/app.js']) {
    const source=fs.readFileSync(path,'utf8');
    const start=source.indexOf("aiProviderSelect.addEventListener('change'");
    const end=source.indexOf('\n    });',start)+7;
    const node=hidden=>({classList:{hidden,add(){this.hidden=true;},remove(){this.hidden=false;}},innerHTML:'cached'});
    const selection={word:'猫',sentence:'猫がいる'};
    const box={aiProviderSelect:{addEventListener:(t,fn)=>box.handler=fn},setAIProvider(){},updateAIProviderUI(){},showToast(){},abortAIAnalysis(){},currentSelection:selection,currentLastAiData:{meaning:'old'}};
    for(const key of ['aiTriggerSection','aiResponseContainer','aiLoadingSkeleton','aiStreamPreview','aiCardsContainer','aiErrorDisplay'])box[key]=node(key==='aiTriggerSection');
    vm.createContext(box);
    const reset=source.match(/function resetAIExplanation\(\) \{[\s\S]*?\n\}/)?.[0]||'';
    vm.runInContext(reset+'\n'+source.slice(start,end),box);
    box.handler({target:{value:'9router',options:[{text:'9Router'}],selectedIndex:0}});
    assert.equal(box.aiLoadingSkeleton.classList.hidden,true,path);
    assert.equal(box.aiTriggerSection.classList.hidden,false,path);
    assert.equal(box.currentLastAiData,null);assert.equal(box.currentSelection,selection);
  }
});

test('extension player observes effective saved configuration, ignoring own delayed and irrelevant changes',async()=>{
  let listener;const callbacks=[];const notices=[];
  const stored={linguaplay_ai_provider:'antigravity',linguaplay_9router_model:'A'};
  const box={AbortController,AbortSignal,console,chrome:{storage:{local:{get:(keys,cb)=>cb({...stored}),set(){}},onChanged:{addListener:fn=>listener=fn}},runtime:{sendMessage:()=>new Promise(resolve=>callbacks.push(resolve))}}};
  const source=fs.readFileSync('extension/js/ai.js','utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  vm.createContext(box);vm.runInContext(source+'\nglobalThis.ai={setAIProvider,requestAIAnalysis,getAIProvider,onAISettingsChanged:typeof onAISettingsChanged === "function" ? onAISettingsChanged:null};',box);
  assert.equal(typeof listener,'function');
  box.ai.onAISettingsChanged(()=>notices.push(box.ai.getAIProvider()));
  box.ai.setAIProvider('9router');
  let result;
  const fresh=box.ai.requestAIAnalysis({word:'猫',onSuccess:d=>result=d,onError:e=>result=e});
  listener({linguaplay_ai_provider:{oldValue:'antigravity',newValue:'9router'}},'local');
  listener({unrelated:{newValue:42},linguaplay_9router_model:{oldValue:'A',newValue:'A'}},'local');
  callbacks.shift()({success:true,content:'{"meaning":"fresh"}'});await fresh;
  assert.equal(result.meaning,'fresh');assert.equal(notices.length,0);
  const stale=box.ai.requestAIAnalysis({word:'猫',onSuccess:d=>result=d,onError:e=>result=e});
  listener({linguaplay_9router_model:{oldValue:'A',newValue:'B'}},'local');
  callbacks.shift()({success:true,content:'{"meaning":"stale"}'});await stale;
  assert.equal(result.meaning,'fresh');assert.equal(notices.length,1);
  listener({linguaplay_ai_provider:{oldValue:'9router',newValue:'gemini'}},'local');
  assert.equal(box.ai.getAIProvider(),'gemini');assert.equal(notices.length,2);
  listener({linguaplay_9router_key:{oldValue:'',newValue:'other'},linguaplay_server_url:{newValue:'http://localhost:9999'}},'local');
  assert.equal(notices.length,2,'inactive transports must not clear current provider data');
});

test('router cancellation during deferred permission never starts fetch; rejected stream is cancelled',async()=>{
  const permission=deferred();let fetched=false;
  const box={URL,AbortController,setTimeout,clearTimeout,TextDecoder,chrome:{permissions:{contains:()=>permission.promise}},fetch:()=>{fetched=true;}};
  vm.createContext(box);vm.runInContext(fs.readFileSync('extension/js/router.js','utf8'),box);
  const controller=new AbortController();
  const pending=box.RouterAI.request({model:'A'},{messages:[{role:'user',content:'x'}],signal:controller.signal});
  controller.abort();permission.resolve(true);await assert.rejects(pending,/cancelled/);assert.equal(fetched,false);
  let released=false;
  const router=load(async()=>new Response(new ReadableStream({cancel(){released=true;}}),{status:500}));
  await assert.rejects(router.request({model:'A'},{messages:[{role:'user',content:'x'}]}),/configuration/);
  assert.equal(released,true);
});

test('Options ignores obsolete permission requests and clears discovered catalogs on edits',async()=>{
  const h=optionsHarness();
  const models=h.click('load-9router-models-btn');await tick();h.calls[0].resolve(['A']);await models;
  assert.equal(h.element('9router-models').children.length,1);
  h.edit('9router-key','changed');assert.equal(h.element('9router-models').children.length,0);
  const permission=deferred();h.sandbox.chrome.permissions.contains=async()=>false;
  h.sandbox.chrome.permissions.request=()=>permission.promise;
  const pending=h.click('test-9router-btn');await tick();
  h.edit('9router-model','B');permission.resolve(false);await pending;
  assert.equal(h.calls.length,1);assert.equal(h.element('9router-status-text').textContent,'');
  assert.equal(h.element('test-9router-btn').disabled,false);
});

test('Options preserves discovered models while typing and invalidates them when connection changes', async()=>{
  const h=optionsHarness();
  const pending=h.click('load-9router-models-btn'); await tick();
  h.calls[0].resolve(['oc/model-a','oc/model-b']); await pending;
  h.edit('9router-model','oc/');
  assert.equal(h.element('9router-models').children.length,2,'typing a model prefix must retain its suggestions');
  assert.equal(h.element('9router-status-text').textContent,'');
  h.edit('9router-url','http://localhost:20128/v1');
  assert.equal(h.element('9router-models').children.length,0,'a different router must discard the old catalog');
});

test('extension initial storage wait preserves a newer provider and request ordering',async()=>{
  let initial;const callbacks=[];
  const box={AbortController,AbortSignal,chrome:{storage:{local:{get:(keys,cb)=>initial=cb,set(){}},onChanged:{addListener(){}}},runtime:{sendMessage:()=>new Promise(resolve=>callbacks.push(resolve))}}};
  const source=fs.readFileSync('extension/js/ai.js','utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  vm.createContext(box);vm.runInContext(source+'\nglobalThis.ai={setAIProvider,requestAIAnalysis,getAIProvider};',box);
  box.ai.setAIProvider('9router');let result;
  const older=box.ai.requestAIAnalysis({word:'old',onSuccess:()=>{throw new Error('obsolete');}});
  const fresh=box.ai.requestAIAnalysis({word:'猫',onSuccess:d=>result=d,onError:e=>{throw new Error(e);}});
  assert.equal(callbacks.length,0);
  initial({linguaplay_ai_provider:'gemini',linguaplay_9router_key:'fake',linguaplay_9router_model:'A'});
  await tick();assert.equal(box.ai.getAIProvider(),'9router');assert.equal(callbacks.length,1);
  callbacks[0]({success:true,content:'{"meaning":"cat"}'});await Promise.all([older,fresh]);
  assert.equal(result.meaning,'cat');
});
