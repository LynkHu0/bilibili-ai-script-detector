const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../extension/bili/auto-report.js'),'utf8');
test('report opens for focused video, honors switch and navigation',async()=>{
 let enabled=true,calls=0,active=true,url='https://www.bilibili.com/video/BV1234567890';const listeners={};
 const ctx={Map,BiliSlop:{parse:s=>{const m=s?.match(/video\/(BV\w{10})/);return m?{bvid:m[1],p:1}:null;}},chrome:{tabs:{onUpdated:{addListener:f=>listeners.update=f},onActivated:{addListener:f=>listeners.activate=f},onRemoved:{addListener:f=>listeners.remove=f},get:async()=>({url,active,windowId:2})},windows:{get:async()=>({focused:true})},storage:{local:{get:async()=>({biliAutoReport:enabled})}},action:{openPopup:async()=>{calls++}}}};
 vm.createContext(ctx);vm.runInContext(source,ctx);const tick=()=>new Promise(r=>setImmediate(r));
 listeners.update(1,{url},{url});await tick();assert.equal(calls,1);
 listeners.update(1,{status:'complete'},{url});await tick();assert.equal(calls,1);
 enabled=false;url='https://www.bilibili.com/video/BV1234567891';listeners.update(1,{url},{url});await tick();assert.equal(calls,1);
 enabled=true;active=false;listeners.update(1,{url},{url});await tick();assert.equal(calls,1);
 active=true;listeners.activate({tabId:1});await tick();assert.equal(calls,2);
 url='https://www.bilibili.com/';listeners.update(1,{url},{url});await tick();url='https://www.bilibili.com/video/BV1234567891';listeners.update(1,{url},{url});await tick();assert.equal(calls,3);
});
