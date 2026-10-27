import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Providers,deepseekBody} from './providers.mjs';
import {requestBody} from './inference.mjs';
test('both providers honor limits below and above the previous cap',()=>{
 const text='字'.repeat(30000);
 for(const limit of [50,5000,15000,25000,100000]){
 assert.equal(JSON.parse(requestBody(text,{transcriptLimit:limit}).input[0].content).transcript.length,Math.min(limit,text.length));
 assert.equal(JSON.parse(deepseekBody(text,{model:'deepseek-flash',thinking:'disabled',transcriptLimit:limit}).messages[1].content).transcript.length,Math.min(limit,text.length));
 }
 assert.equal(JSON.parse(requestBody(text).input[0].content).transcript.length,15000);
});
test('character limit defaults, persists, and rejects invalid values',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'slop-limit-'));
 try{
 const p=new Providers(dir);await p.init();assert.equal(p.config.transcriptLimit,15000);
 await p.save(new URLSearchParams({provider:'chatgpt',transcriptLimit:'25000'}));
 const restored=new Providers(dir);await restored.init();assert.equal(restored.info().transcriptLimit,25000);
 for(const value of ['0','49','100001','2.5','abc',''])await assert.rejects(p.save(new URLSearchParams({provider:'chatgpt',transcriptLimit:value})),/检测字数/);
 assert.equal(p.config.transcriptLimit,25000);
 }finally{await rm(dir,{recursive:true,force:true});}
});
