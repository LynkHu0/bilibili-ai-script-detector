import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,stat} from 'node:fs/promises';import path from 'node:path';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
import {OfficialUsage,validateSnapshot} from './official-usage.mjs';
const source={sourceUrl:'https://platform.deepseek.com/usage',apiKeyLabel:'Stop the Slop',periodLabel:'近 7 天',currency:'CNY',cost:.15,requests:48,tokens:83688};
test('official displayed snapshot preserves range and is never rewritten as today',()=>{const s=validateSnapshot(source);assert.equal(s.periodLabel,'近 7 天');assert.equal(s.cost,.15);assert.equal(s.requests,48);assert.equal(s.tokens,83688);assert.equal(s.precision,'dashboard-display');for(const bad of [{apiKeyLabel:'全部API Key'},{tokens:-1},{sourceUrl:'https://evil.example'},{currency:'XXX'}])assert.throws(()=>validateSnapshot({...source,...bad}));});
test('browser extraction normalizes visible values without accessing credentials',async()=>{const ctx={};vm.createContext(ctx);vm.runInContext(await readFile(new URL('../extension/billing/extract.js',import.meta.url),'utf8'),ctx);const s=ctx.DeepSeekUsageExtract.fromValues({cost:'¥0.15\nCNY',requests:'48',tokens:'83,688',apiKeyLabel:'API Key\nStop the Slop',periodLabel:'时间维度\n近 7 天'});assert.equal(s.cost,.15);assert.equal(s.tokens,83688);assert.equal(s.apiKeyLabel,'Stop the Slop');assert.equal(s.periodLabel,'近 7 天');assert.throws(()=>ctx.DeepSeekUsageExtract.fromValues({cost:'¥0.15 CNY',requests:'48',tokens:'83,688',apiKeyLabel:'API Key\n全部',periodLabel:'近7天'}));});
test('official snapshot binding isolates API keys and requires explicit confirmation after filters change',async()=>{
 const dir=await mkdtemp(path.resolve(import.meta.dirname,'../../work/official-check-'));try{
  const store=new OfficialUsage(dir);await store.init();await assert.rejects(store.update('key-a',source,false),/筛选已改变/);
  await store.update('key-a',source,true);await store.update('key-a',{...source,cost:.2},false);assert.equal(store.get('key-a').cost,.2);
  assert.equal(store.get('key-b'),null);await assert.rejects(store.update('key-a',{...source,periodLabel:'今天'},false),/筛选已改变/);
  const restored=new OfficialUsage(dir);await restored.init();assert.equal(restored.get('key-a').tokens,83688);assert.equal((await stat(restored.file)).mode&0o777,0o600);
 }finally{await rm(dir,{recursive:true,force:true});}
});
