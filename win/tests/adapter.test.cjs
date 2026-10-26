const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const base=path.join(__dirname,'../extension/bili');
function setup(noCaptions=false,badScore=false,queued=false,maxConcurrent=4){
 let polls=0;
 const store={biliLocalToken:'test-token'};let listener;let calls=[];
 const ctx={URL,AbortSignal,Map,Number,setTimeout:fn=>fn(),chrome:{runtime:{onMessage:{addListener(fn){listener=fn;}}},storage:{local:{async get(k){return {[k]:store[k]};},async set(v){Object.assign(store,v);}}}},fetch:async(url,opts)=>{calls.push({url,opts});let data;
 if(url.endsWith('/api/status'))data={connected:true,model:'gpt-6-luna',effort:'high',maxConcurrent,promptVersion:'zh-script-v2',cacheIdentity:'test-account'};
 else if(url.includes('/view?'))data={code:0,data:{title:'测试',pages:[{cid:11},{cid:22}]}};
 else if(url.includes('/wbi/v2'))data={code:0,data:{subtitle:{subtitles:noCaptions?[]:[{lan:'ai-zh',subtitle_url:'https://aisubtitle.hdslb.com/test.json'}]}}};
 else if(url.includes('hdslb.com'))data={body:[{content:'这是一段用于检测字幕接入链路的中文文案。'.repeat(8)}]};
 else if(queued && (url.endsWith('/api/jobs') || (url.includes('/api/jobs/') && ++polls===1)))data={status:url.endsWith('/api/jobs')?'queued':'running',queuePosition:1,jobId:'x'.repeat(32)};
 else data={status:'completed',result:{score:badScore?2:.8,engine:'gpt-6-luna',effort:'high',cacheIdentity:'test-account'}};
 return {ok:true,json:async()=>data};}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(base,'core.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(base,'background.js'),'utf8'),ctx);
 return {ctx,store,calls,send:(url,type='BILI_ANALYZE')=>new Promise(resolve=>listener({type,url},{},resolve))};
}
test('strict platform URL and page parsing',()=>{const {ctx}=setup();assert.equal(ctx.BiliSlop.parse('https://evil.example/video/BV1xx411c7mD'),null);assert.equal(ctx.BiliSlop.parse('https://www.bilibili.com/video/BV1xx411c7mD?p=-1'),null);assert.equal(ctx.BiliSlop.parse('https://www.bilibili.com/video/BV1xx411c7mD?p=2').p,2);});
test('extension reads shared concurrency without receiving the local token',async()=>{const t=setup(false,false,false,37);const config=await t.send('', 'BILI_CONFIG');assert.equal(config.maxConcurrent,37);assert.equal(JSON.stringify(config).includes('test-token'),false);});
test('subtitle -> detector; CID cache; separate multipart result',async()=>{const t=setup();const url='https://www.bilibili.com/video/BV1xx411c7mD';assert.equal((await t.send(url)).result.cid,11);await t.send(url);assert.equal(t.calls.filter(c=>c.url.endsWith('/api/jobs')).length,1);assert.equal((await t.send(url+'?p=2')).result.cid,22);const sent=t.calls.filter(c=>c.url.endsWith('/api/jobs'));assert.equal(JSON.parse(sent[1].opts.body).videoId,'bili:BV1xx411c7mD:22');assert.ok(t.store.bili_card_plan_BV1xx411c7mD_2);});
test('no captions is unknown and never sent for detection',async()=>{const t=setup(true);assert.match((await t.send('https://www.bilibili.com/video/BV1xx411c7mD')).error,/未返回可用字幕/);assert.equal(t.calls.filter(c=>c.url.endsWith('/api/jobs')).length,0);});
test('invalid detector score is not cached',async()=>{const t=setup(false,true);assert.match((await t.send('https://www.bilibili.com/video/BV1xx411c7mD')).error,/有效评分/);assert.equal(t.store.bili_card_plan_BV1xx411c7mD_1,undefined);});

test('queued request waits through running and caches final score',async()=>{const t=setup(false,false,true);const r=await t.send('https://www.bilibili.com/video/BV1xx411c7mD');assert.equal(r.result.score,.8);assert.equal(t.calls.filter(c=>c.url.includes('/api/jobs/')).length,2);});
test('short task polling reports failure without silently restarting work',async()=>{const t=setup(true);const url='https://www.bilibili.com/video/BV1xx411c7mD';await t.send(url,'BILI_START');await new Promise(setImmediate);const before=t.calls.length;const r=await t.send(url,'BILI_TASK');assert.equal(r.status,'failed');assert.equal(r.code,'NO_SUBTITLES');assert.equal(t.calls.length,before);});
test('duplicate requests share one model submission',async()=>{const t=setup();const url='https://www.bilibili.com/video/BV1xx411c7mD';const replies=await Promise.all([t.send(url),t.send(url)]);assert.equal(replies[0].result.score,replies[1].result.score);assert.equal(t.calls.filter(c=>c.url.endsWith('/api/jobs')).length,1);});
