import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,stat,readFile} from 'node:fs/promises';import path from 'node:path';
import {UsageLedger,normalizeUsage,estimateCost,dayInShanghai} from './usage.mjs';
import {readResponseStream} from './inference.mjs';import {inferDeepseek} from './providers.mjs';
const work=path.resolve(import.meta.dirname,'../../work');
const make=async()=>{const dir=await mkdtemp(path.join(work,'usage-check-'));const ledger=new UsageLedger(dir);await ledger.init();return {dir,ledger};};
test('DeepSeek cache hits and reasoning are counted without double counting',()=>{
 const u=normalizeUsage({prompt_tokens:1000,completion_tokens:100,total_tokens:1100,prompt_cache_hit_tokens:500,completion_tokens_details:{reasoning_tokens:80}},'deepseek');assert.equal(u.total,1100);assert.equal(u.reasoning,80);assert.equal(u.miss,500);
 const cost=estimateCost('deepseek-flash',u);assert.ok(Math.abs(cost.min-.00091)<1e-10);assert.ok(Math.abs(cost.max-.00182)<1e-10);
 assert.equal(normalizeUsage({},'deepseek'),null);
});
test('missing cache detail uses conservative price bounds',()=>{
 const u=normalizeUsage({prompt_tokens:1000,completion_tokens:100},'deepseek');const c=estimateCost('deepseek-flash',u);assert.equal(u.hit,null);assert.ok(Math.abs(c.min-.00042)<1e-10);assert.ok(Math.abs(c.max-.0028)<1e-10);
});
test('Shanghai day switches at UTC16:00',()=>{
 assert.equal(dayInShanghai(Date.parse('2026-10-21T15:59:59Z')),'2026-10-21');assert.equal(dayInShanghai(Date.parse('2026-10-21T16:00:00Z')),'2026-10-22');
});
test('daily records survive restart, deduplicate and isolate API keys',async()=>{
 const {dir,ledger}=await make();try{
  const now=Date.now(),u={prompt_tokens:1000,completion_tokens:10,prompt_cache_hit_tokens:200};
  await Promise.all([ledger.record({provider:'deepseek',scope:'key-a',model:'deepseek-flash',usage:u,id:'response-secret',at:now}),ledger.record({provider:'deepseek',scope:'key-a',model:'deepseek-flash',usage:u,id:'response-secret',at:now})]);
  await ledger.record({provider:'deepseek',scope:'key-a',model:'deepseek-v4-pro',usage:u,id:'second',at:now,kind:'test',outcome:'failed'});
  await ledger.record({provider:'deepseek',scope:'key-b',model:'deepseek-flash',usage:u,id:'other',at:now});
  const reload=new UsageLedger(dir);await reload.init();const s=reload.summary('deepseek','key-a',now);assert.equal(s.today.requests,2);assert.equal(s.today.tests,1);assert.equal(s.today.totalTokens,2020);assert.equal(s.today.unknownRequests,0);
  assert.equal((await stat(ledger.file)).mode&0o777,0o600);assert.equal((await readFile(ledger.file,'utf8')).includes('response-secret'),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('missing usage is never guessed as zero cost and rejected requests are distinguished',async()=>{
 const {dir,ledger}=await make();try{
  await ledger.record({provider:'deepseek',scope:'a',model:'deepseek-flash',outcome:'unknown'});
  await ledger.record({provider:'deepseek',scope:'a',model:'deepseek-flash',outcome:'rejected'});
  const s=ledger.summary('deepseek','a');assert.equal(s.today.requests,2);assert.equal(s.today.unknownRequests,1);assert.equal(s.today.knownRequests,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('ChatGPT recent five hours are tokens only, never fabricated quota percentage',async()=>{
 const {dir,ledger}=await make();try{
  const now=Date.now();const u={input_tokens:100,output_tokens:20,total_tokens:120};
  await ledger.record({provider:'chatgpt',scope:'a',model:'gpt-6-luna',usage:u,at:now-6*3600000});
  await ledger.record({provider:'chatgpt',scope:'a',model:'gpt-6-luna',usage:u,at:now-3600000});
  const s=ledger.summary('chatgpt','a',now);assert.equal(s.recentFiveHours.totalTokens,120);assert.equal(s.planPercent,null);assert.equal(s.planPercentAvailable,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('DeepSeek metadata is delivered even if completion failed',async()=>{
 let captured;await assert.rejects(inferDeepseek('text',{apiKey:'fake',model:'deepseek-flash',thinking:'disabled'},async()=>({ok:true,json:async()=>({id:'test',usage:{prompt_tokens:100,completion_tokens:12},choices:[{finish_reason:'length',message:{content:''}}]})}),async e=>{captured=e;}));
 assert.equal(captured.usage.completion_tokens,12);assert.equal(captured.outcome,'failed');
});
test('ChatGPT stream captures server usage before rejecting incomplete response',async()=>{
 let captured;const body=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({type:'response.incomplete',response:{id:'a',usage:{input_tokens:100,output_tokens:20}}})+'\n\n'));c.close();}});
 await assert.rejects(readResponseStream(body,(usage,id)=>{captured={usage,id};}));assert.equal(captured.usage.input_tokens,100);assert.equal(captured.id,'a');
});
