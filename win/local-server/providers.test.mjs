import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,rm,stat,readFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {Providers,deepseekBody,inferDeepseek} from './providers.mjs';import {instructions,PROMPT_VERSION,validateResult} from './inference.mjs';
// 临时目录放在项目内的 work/；测试首次运行时自动创建。
const work=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../work');
await mkdir(work,{recursive:true});
test('DeepSeek default non-thinking request returns only JSON score',()=>{
 const body=deepseekBody('字幕',{model:'deepseek-flash',thinking:'disabled'});assert.equal(body.model,'deepseek-flash');assert.equal(body.thinking.type,'disabled');assert.equal(body.max_tokens,128);assert.equal(body.response_format.type,'json_object');assert.equal(body.stream,false);assert.equal(body.messages[0].role,'system');
 for(const effort of ['low','high','max'])for(const model of ['deepseek-flash','deepseek-v4-pro']){const thinking=deepseekBody('字幕',{model,thinking:'enabled',thinkingEffort:effort});assert.equal(thinking.model,model);assert.equal(thinking.thinking.type,'enabled');assert.equal(thinking.reasoning_effort,effort);assert.equal('max_tokens' in thinking,false);}
});
test('score prompt uses direct yes/no judgment and has no explicit style checklist',()=>{
 assert.equal(PROMPT_VERSION,'zh-score-v4');assert.match(instructions,/二选一判断/);assert.match(instructions,/yes/);assert.match(instructions,/no/);assert.doesNotMatch(instructions,/模板化开场|机械转场|重复论述|空泛修辞/);
});
test('key stored privately; public status hides key; model changes isolate cache',async()=>{
 const dir=await mkdtemp(path.join(work,'provider-test-'));
 try{
  const p=new Providers(dir);await p.init();assert.equal(p.info().provider,'chatgpt');
  await p.save(new URLSearchParams({provider:'deepseek',model:'deepseek-flash',thinking:'disabled',thinkingEffort:'low',apiKey:'test-only-secret-1234'}));
  const initial=p.info();assert.equal(initial.connected,true);assert.equal(JSON.stringify(initial).includes('test-only-secret'),false);assert.equal(initial.effort,'none');assert.equal(initial.maxConcurrent,10);
  assert.equal((await stat(p.file)).mode&0o777,0o600);
  const restored=new Providers(dir);await restored.init();assert.equal(restored.info().cacheIdentity,initial.cacheIdentity);
  await p.save(new URLSearchParams({provider:'deepseek',model:'deepseek-v4-pro',thinking:'enabled',thinkingEffort:'max',apiKey:''}));assert.notEqual(p.info().cacheIdentity,initial.cacheIdentity);assert.equal(p.info().effort,'max');assert.equal(p.config.apiKey,'test-only-secret-1234');
  const maxIdentity=p.info().cacheIdentity;
  await p.save(new URLSearchParams({provider:'deepseek',model:'deepseek-v4-pro',thinking:'enabled',thinkingEffort:'low',apiKey:''}));assert.notEqual(p.info().cacheIdentity,maxIdentity);assert.equal(p.info().effort,'low');
  await assert.rejects(p.save(new URLSearchParams({provider:'deepseek',model:'deepseek-flash',thinking:'enabled',thinkingEffort:'ultra',apiKey:''})),/强度无效/);assert.equal(p.info().effort,'low');
  await p.save(new URLSearchParams({provider:'deepseek',model:'deepseek-flash',thinking:'enabled',thinkingEffort:'high',maxConcurrent:'100',apiKey:''}));assert.equal(p.info().maxConcurrent,100);
  await assert.rejects(p.save(new URLSearchParams({provider:'deepseek',maxConcurrent:'0',apiKey:''})),/并发任务数/);assert.equal(p.info().maxConcurrent,100);
  await p.save(new URLSearchParams({provider:'chatgpt',clearKey:'yes'}));assert.equal(p.config.apiKey,'');assert.equal(p.info().model,'gpt-6-luna');
  await assert.rejects(p.save(new URLSearchParams({provider:'deepseek'})),/API Key/);assert.equal(p.info().provider,'chatgpt');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('official endpoint and API key only in authorization header',async()=>{
 const config={model:'deepseek-flash',thinking:'disabled',apiKey:'test-key'};
 const raw=await inferDeepseek('字幕',config,async(url,request)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(request.headers.Authorization,'Bearer test-key');assert.equal(request.body.includes('test-key'),false);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"score":0.23}',reasoning_content:'do not expose reasoning'}}]})};});
 const result=validateResult(raw,{engine:config.model,effort:'none',provider:'deepseek'});assert.equal(result.score,.23);assert.equal(result.provider,'deepseek');assert.equal(result.engine,'deepseek-flash');
});
test('API errors never expose response body or credentials and never fall back',async()=>{
 for(const status of [401,402,429,500])await assert.rejects(inferDeepseek('字幕',{apiKey:'test-key'},async()=>({ok:false,status,json:async()=>({error:{message:'secret-body'}})})),e=>e.message.includes(String(status)) && !e.message.includes('secret-body') && !e.message.includes('test-key'));
});
test('truncated or empty DeepSeek response cannot become a score',async()=>{
 await assert.rejects(inferDeepseek('字幕',{apiKey:'test-key'},async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'{"score":0.8}'}}]})})),/未正常完成/);
 await assert.rejects(inferDeepseek('字幕',{apiKey:'test-key'},async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:''}}]})})),/未返回评分/);
});

test('ChatGPT model and effort persist independently of DeepSeek settings',async()=>{
 const dir=await mkdtemp(path.join(work,'chatgpt-options-test-'));
 try{
  const p=new Providers(dir);await p.init();await p.save(new URLSearchParams({provider:'chatgpt',chatgptModel:'gpt-6.1-sol',chatgptEffort:'low'}));
  assert.equal(p.info().model,'gpt-6.1-sol');assert.equal(p.info().effort,'low');
  const restored=new Providers(dir);await restored.init();assert.equal(restored.info().model,'gpt-6.1-sol');
  await assert.rejects(p.save(new URLSearchParams({provider:'chatgpt',chatgptEffort:'invalid'})),/推理强度无效/);
  assert.equal(p.info().effort,'low');
 }finally{await rm(dir,{recursive:true,force:true});}
});
