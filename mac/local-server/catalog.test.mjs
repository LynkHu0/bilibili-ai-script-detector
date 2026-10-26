import {test} from 'node:test';import assert from 'node:assert/strict';import {ModelCatalog} from './catalog.mjs';
test('model picker requests current account catalog and filters visible models',async()=>{
 const c=new ModelCatalog();let account={client_id:'a',subject:'u',access_token:'test-only'};let calls=0;
 const auth={active:()=>account,access:async()=>'test-only'};
 const fetcher=async(url,req)=>{calls++;assert.equal(url,'https://api.openai.com/v1/models');assert.equal(req.headers.Authorization,'Bearer test-only');return {ok:true,json:async()=>({models:[{slug:'gpt-6-luna',display_name:'Luna',visibility:'list'},{slug:'hidden',visibility:'hidden'}]})};};
 await c.refresh(auth,false,fetcher);assert.deepEqual(c.models,[{slug:'gpt-6-luna',name:'Luna'}]);
 await c.refresh(auth,false,fetcher);assert.equal(calls,1);account={...account,client_id:'b'};await c.refresh(auth,false,fetcher);assert.equal(calls,2);
});
test('model list failure offers explicit fallback without token disclosure',async()=>{
 const c=new ModelCatalog();await c.refresh({active:()=>({client_id:'a',subject:'u',access_token:'secret'}),access:async()=>'secret'},false,async()=>{throw new Error('secret');});
 assert.equal(c.models.length,0);assert.match(c.error,/读取失败/);assert.equal(c.error.includes('secret'),false);
});
