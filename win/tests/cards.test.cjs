const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const tick=()=>new Promise(setImmediate);
function fixture(run){
 let observe,change;
 const anchor={href:'https://www.bilibili.com/video/BV1xx411c7mD',style:{},button:null,querySelector(s){return s==='.bili-slop-check'?this.button:{};},append(b){this.button=b;b.remove=()=>{this.button=null;};}};
 const ctx={URL,AbortSignal,setTimeout:fn=>{fn();return 1;},clearTimeout(){},getComputedStyle:()=>({position:'relative'}),MutationObserver:class{constructor(fn){observe=fn;}observe(){}},document:{head:{append(){}},body:{},createElement:()=>({style:{},title:'',textContent:''}),querySelectorAll:()=>[anchor]},chrome:{storage:{local:{get:async()=>({})},onChanged:{addListener(fn){change=fn;}}}}};
 vm.createContext(ctx);for(const f of ['core.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/bili',f),'utf8'),ctx);
 ctx.BiliSlop.analyze=run;vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/bili/content.js'),'utf8'),ctx);
 return {anchor,refresh:()=>observe(),change:(key,result)=>change({[key]:{newValue:result}},'local'),click:()=>anchor.button.onclick({preventDefault(){},stopPropagation(){}})};
}
test('cover shows queued progress then score without generic failure',async()=>{
 let done;const f=fixture(async(url,progress)=>{progress({status:'queued',queuePosition:2});return new Promise(r=>{done=r;});});
 const pending=f.click();assert.equal(f.anchor.button.textContent,'排队中 · 前方 2 个');done({score:.6});await pending;assert.match(f.anchor.button.textContent,/60/);assert.equal(f.anchor.button.disabled,false);
});
test('missing subtitles has a specific non-score state',async()=>{
 const f=fixture(async()=>{const e=new Error('B站未返回可用字幕');e.code='NO_SUBTITLES';throw e;});await f.click();assert.equal(f.anchor.button.textContent,'暂无可用字幕');assert.equal(f.anchor.button.title,'B站未返回可用字幕');
});
test('recycled card ignores previous video late result',async()=>{
 let done;const f=fixture(async()=>new Promise(r=>{done=r;}));const pending=f.click();
 f.anchor.href='https://www.bilibili.com/video/BV1CCHe64EGB';f.refresh();const newButton=f.anchor.button;
 done({score:.9});await pending;await tick();assert.equal(f.anchor.button,newButton);assert.equal(newButton.textContent,'检测文案');
});
