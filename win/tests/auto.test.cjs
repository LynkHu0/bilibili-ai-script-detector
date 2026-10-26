const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const base=path.join(__dirname,'../extension/bili');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const url='https://www.bilibili.com/video/BV1xx411c7mD';
const url2='https://www.bilibili.com/video/BV1CCHe64EGB';
const okResult=score=>({score,engine:'deepseek-flash',effort:'none',provider:'deepseek',cacheIdentity:'acct'});

// 用可控的定时器/IntersectionObserver/存储模拟B站页面，验证自动检测调度。
function fixture({hrefs=[url],store={biliLocalToken:'t'.repeat(43)},analyze,maxConcurrent=1}={}){
 const anchors=hrefs.map(href=>{
  const anchor={href,attrs:{},style:{setProperty(){},removeProperty(){}},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},button:null,isConnected:true,
   querySelector(sel){return sel==='.bili-slop-check'?anchor.button:{};},
   append(button){anchor.button=button;button.parentElement=anchor;button.remove=()=>{if(anchor.button===button)anchor.button=null;};}};
  return anchor;
 });
 const storeData={...store};
 const timers=[];let seq=0,clock=1700000000000,mutation;
 const observers=[];const listeners=[];
 const ctx={
  URL,AbortSignal,Map,Set,Number,
  Date:{now:()=>clock},
  setTimeout:(fn,ms)=>{const id=++seq;timers.push({id,fn,ms});return id;},
  clearTimeout:id=>{const i=timers.findIndex(t=>t.id===id);if(i>=0)timers.splice(i,1);},
  getComputedStyle:()=>({position:'relative'}),
  MutationObserver:class{constructor(fn){mutation=fn;}observe(){}},
  IntersectionObserver:class{constructor(fn){this.fn=fn;this.targets=new Set();observers.push(this);}observe(t){this.targets.add(t);}unobserve(t){this.targets.delete(t);}disconnect(){this.targets.clear();}},
  document:{head:{append(){}},body:{},
   createElement:()=>({style:{},className:'',type:'',textContent:'',title:'',disabled:false,remove(){}}),
   querySelectorAll:()=>anchors},
  chrome:{runtime:{onMessage:{addListener(){}},sendMessage:async()=>({maxConcurrent})},
   storage:{local:{
    get:async keys=>{if(Array.isArray(keys)){const out={};for(const k of keys)out[k]=storeData[k];return out;}if(typeof keys==='string')return {[keys]:storeData[keys]};return {...storeData};},
    set:async values=>{Object.assign(storeData,values);}},
   onChanged:{addListener(fn){listeners.push(fn);}}}},
  };
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(base,'core.js'),'utf8'),ctx);
 const calls=[];
 const impl=analyze || (async()=>okResult(.5));
 ctx.BiliSlop.analyze=(target,progress)=>{calls.push(target);return impl(target,progress);};
 vm.runInContext(fs.readFileSync(path.join(base,'content.js'),'utf8'),ctx);
 function runTimers(maxMs=Infinity){
  for(let guard=0;guard<2000;guard++){
   const i=timers.findIndex(t=>t.ms<=maxMs);
   if(i<0)return;
   const [t]=timers.splice(i,1);t.fn();
  }
  throw new Error('timer loop');
 }
 return {
  anchors,calls,store:storeData,
  intersect(anchor,visible=true){
   const target=typeof anchor==='number'?anchors[anchor]:anchor;
   const observer=observers.find(o=>o.targets.has(target));
   if(!observer)throw new Error('card not observed');
   observer.fn([{target,isIntersecting:visible}]);
  },
  refresh(){mutation();runTimers(250);},
  change(values){const changes={};for(const [k,v] of Object.entries(values))changes[k]={newValue:v};for(const fn of listeners)fn(changes,'local');},
  runTimers,
 };
}

test('visible card auto-detects after debounce and paints the score',async()=>{
 const f=fixture({analyze:async()=>okResult(.82)});
 await tick();
 assert.equal(f.calls.length,0);
 f.intersect(0);
 assert.equal(f.calls.length,0);
 f.runTimers(600);
 await tick();
 assert.equal(f.calls.length,1);
 assert.match(f.anchors[0].button.textContent,/82/);
});

test('visible cards can dispatch in parallel up to the local server limit',async()=>{
 const resolvers=[];
 const f=fixture({hrefs:[url,url2],maxConcurrent:2,analyze:()=>new Promise(resolve=>resolvers.push(resolve))});
 await tick();f.intersect(0);f.intersect(1);f.runTimers(600);await tick();
 assert.equal(f.calls.length,2);
 resolvers[0](okResult(.4));resolvers[1](okResult(.8));await tick();
 assert.match(f.anchors[0].button.textContent,/40/);assert.match(f.anchors[1].button.textContent,/80/);
});

test('auto detection can be disabled and manual click still works',async()=>{
 const f=fixture({store:{biliLocalToken:'t'.repeat(43),biliAutoDetect:false}});
 await tick();
 f.intersect(0);f.runTimers(600);await tick();
 assert.equal(f.calls.length,0);
 await f.anchors[0].button.onclick({preventDefault(){},stopPropagation(){}});
 assert.equal(f.calls.length,1);
 assert.match(f.anchors[0].button.textContent,/50/);
});

test('saved result is painted without spending another model call',async()=>{
 const f=fixture({store:{biliLocalToken:'t'.repeat(43),biliProviderIdentity:'acct',
  bili_card_plan_BV1xx411c7mD_1:{score:.37,engine:'deepseek-flash',effort:'none',provider:'deepseek',cacheIdentity:'acct',promptVersion:'zh-score-v4'}}});
 await tick();
 f.intersect(0);f.runTimers(600);await tick();
 assert.equal(f.calls.length,0);
 assert.match(f.anchors[0].button.textContent,/37/);
});

test('cached score from the previous prompt version is not reused',async()=>{
 const f=fixture({store:{biliLocalToken:'t'.repeat(43),biliProviderIdentity:'acct',
  bili_card_plan_BV1xx411c7mD_1:{score:.37,engine:'deepseek-flash',effort:'none',provider:'deepseek',cacheIdentity:'acct',promptVersion:'zh-score-v3'}}});
 await tick();f.intersect(0);f.runTimers(600);await tick();
 assert.equal(f.calls.length,1);
});

test('cards are analyzed one at a time instead of all at once',async()=>{
 const resolvers=[];
 const f=fixture({hrefs:[url,url2],analyze:()=>new Promise(resolve=>resolvers.push(resolve))});
 await tick();
 f.intersect(0);f.intersect(1);f.runTimers(600);await tick();
 assert.equal(f.calls.length,1);
 assert.equal(f.anchors[1].button.textContent,'等待检测…');
 resolvers[0](okResult(.2));await tick();
 assert.equal(f.calls.length,2);
 resolvers[1](okResult(.9));await tick();
 assert.match(f.anchors[0].button.textContent,/20/);
 assert.match(f.anchors[1].button.textContent,/90/);
});

test('missing subtitles is a final state and is not retried automatically',async()=>{
 const f=fixture({analyze:async()=>{const e=new Error('B站未返回可用字幕');e.code='NO_SUBTITLES';throw e;}});
 await tick();
 f.intersect(0);f.runTimers(600);await tick();
 assert.equal(f.calls.length,1);
 assert.equal(f.anchors[0].button.textContent,'无文案');
 f.runTimers(8000);await tick();
 assert.equal(f.calls.length,1);
});

test('local service failure pauses auto detection and resumes after the pause',async()=>{
 let calls=0;const resolvers=[];
 const f=fixture({hrefs:[url,url2],analyze:()=>{
  calls++;
  return calls===1?Promise.reject(new Error('无法连接本地检测程序，请先启动它。')):new Promise(resolve=>resolvers.push(resolve));
 }});
 await tick();
 f.intersect(0);f.intersect(1);f.runTimers(600);await tick();
 assert.equal(f.calls.length,1);
 assert.equal(f.anchors[0].button.textContent,'请连接检测服务');
 assert.equal(f.anchors[1].button.textContent,'请连接检测服务');
 f.runTimers(59999);await tick();
 assert.equal(f.calls.length,1);
 f.runTimers(60000);await tick();
 assert.equal(f.calls.length,2);
 resolvers[0](okResult(.3));await tick();
 assert.equal(f.calls.length,3);
 resolvers[1](okResult(.8));await tick();
 assert.match(f.anchors[1].button.textContent,/80/);
});

test('turning auto detection off drops queued auto work',async()=>{
 const resolvers=[];
 const f=fixture({hrefs:[url,url2],analyze:()=>new Promise(resolve=>resolvers.push(resolve))});
 await tick();
 f.intersect(0);f.intersect(1);f.runTimers(600);await tick();
 assert.equal(f.calls.length,1);
 f.change({biliAutoDetect:false});
 assert.equal(f.anchors[1].button.textContent,'检测文案');
 resolvers[0](okResult(.4));await tick();
 assert.equal(f.calls.length,1);
});

test('automatic connection does not require a saved connection code',async()=>{const f=fixture({store:{}});await tick();f.intersect(0);f.runTimers(600);await tick();assert.equal(f.calls.length,1);});

test('recycled card does not paint a late automatic result on the next video',async()=>{
 let resolve;
 const f=fixture({analyze:()=>new Promise(r=>{resolve=r;})});
 await tick();
 f.intersect(0);f.runTimers(600);await tick();
 assert.equal(f.calls.length,1);
 f.anchors[0].href=url2;f.refresh();
 const button=f.anchors[0].button;
 resolve(okResult(.9));await tick();
 assert.equal(f.anchors[0].button,button);
 assert.equal(button.textContent,'检测文案');
});

test('percentage and cover glow can be toggled independently without new analysis',async()=>{
 const key='bili_card_plan_BV1xx411c7mD_1';const f=fixture({store:{biliAutoDetect:false,biliProviderIdentity:'acct',[key]:{score:.58,promptVersion:'zh-score-v4',cacheIdentity:'acct'}}});await tick();
 assert.equal(f.anchors[0].attrs['data-bili-slop-glow'],'orange');assert.equal(f.anchors[0].button.hidden,false);
 f.change({biliShowPercentage:false});assert.equal(f.anchors[0].button.hidden,true);assert.equal(f.anchors[0].attrs['data-bili-slop-glow'],'orange');
 f.change({biliShowGlow:false});assert.equal(f.anchors[0].attrs['data-bili-slop-glow'],undefined);
 f.change({biliShowPercentage:true});assert.equal(f.anchors[0].button.hidden,false);assert.equal(f.anchors[0].attrs['data-bili-slop-glow'],undefined);
 f.change({biliShowGlow:true});assert.equal(f.anchors[0].attrs['data-bili-slop-glow'],'orange');assert.equal(f.calls.length,0);
});
