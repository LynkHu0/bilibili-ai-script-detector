const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'../extension');
function element(){return {style:{setProperty(){},removeProperty(){}},attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},append(button){this.button=button;button.parentElement=this;button.remove=()=>{this.button=null;};}};}
function fixture(kind){
 const cover=element();cover.querySelector=()=>null;
 const a=element();a.href='https://www.bilibili.com/video/BV1xx411c7mD';
 a.querySelector=s=>s==='img,picture,video'?{}:s.startsWith('.bili-dyn-card')?cover:null;
 const outer=element();outer.href=a.href;outer.querySelector=s=>s.startsWith('a[')?a:{};
 const ctx={URL,AbortSignal,setTimeout,clearTimeout,getComputedStyle:()=>({position:'relative',borderRadius:'6px'}),MutationObserver:class{observe(){}},document:{head:{append(){}},body:{},createElement:element,querySelectorAll:()=>kind==='nested'?[outer,a]:[a]},chrome:{storage:{local:{get:async()=>({biliAutoDetect:false})},onChanged:{addListener(){}}}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(base,'bili/core.js'),'utf8'),ctx);ctx.BiliSlop.analyze=async()=>({score:.78});vm.runInContext(fs.readFileSync(path.join(base,'bili/content.js'),'utf8'),ctx);
 return {a,cover,outer};
}
test('nested hover menu links mark only the thumbnail, never the full row',async()=>{
 const {a,cover,outer}=fixture('nested');assert.equal(outer.button,undefined);assert.equal(a.button,undefined);assert.ok(cover.button);await cover.button.onclick({preventDefault(){},stopPropagation(){}});assert.equal(cover.button.textContent,'78%');assert.equal(cover.attrs['data-bili-slop-glow'],'red');assert.equal(outer.attrs['data-bili-slop-glow'],undefined);assert.equal(a.attrs['data-bili-slop-glow'],undefined);
});
test('dynamic feed result stays on the cover instead of the card body',async()=>{
 const {a,cover}=fixture('dynamic');await cover.button.onclick({preventDefault(){},stopPropagation(){}});assert.equal(cover.button.textContent,'78%');assert.equal(a.button,undefined);assert.equal(a.attrs['data-bili-slop-glow'],undefined);
});
test('dynamic subdomain loads the detector and its core',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(base,'manifest.json')));assert.ok(m.content_scripts.some(c=>c.matches.includes('https://t.bilibili.com/*')&&c.js.includes('bili/core.js')&&c.js.includes('bili/content.js')));
});
