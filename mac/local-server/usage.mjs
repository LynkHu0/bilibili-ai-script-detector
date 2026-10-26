import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {savePrivate} from './auth.mjs';
const RATES={
 'deepseek-flash':{hit:[.02,.04],miss:[1,2],output:[4,8]},
 'deepseek-v4-pro':{hit:[.15,.30],miss:[4.5,9],output:[13.5,27]}
};
const number=v=>typeof v==='number' && Number.isFinite(v) && v>=0?v:null;
export function normalizeUsage(usage,provider){
 if(!usage || typeof usage!=='object')return null;
 const input=number(provider==='deepseek'?usage.prompt_tokens:usage.input_tokens),output=number(provider==='deepseek'?usage.completion_tokens:usage.output_tokens);
 if(input===null || output===null)return null;
 const rawHit=number(usage.prompt_cache_hit_tokens) ?? number(usage.prompt_tokens_details?.cached_tokens) ?? number(usage.input_tokens_details?.cached_tokens);
 const rawMiss=number(usage.prompt_cache_miss_tokens);
 const hit=rawHit!==null?Math.min(input,rawHit):rawMiss!==null?Math.max(0,input-rawMiss):null;
 return {input,output,total:number(usage.total_tokens) ?? input+output,hit,miss:hit===null?null:input-hit,reasoning:number(usage.completion_tokens_details?.reasoning_tokens) ?? number(usage.output_tokens_details?.reasoning_tokens) ?? 0};
}
export function estimateCost(model,u){
 const rates=RATES[model];if(!rates || !u)return null;
 const lowHit=u.hit ?? u.input,lowMiss=u.miss ?? 0;
 const highHit=u.hit ?? 0,highMiss=u.miss ?? u.input;
 return {min:(lowHit*rates.hit[0]+lowMiss*rates.miss[0]+u.output*rates.output[0])/1e6,max:(highHit*rates.hit[1]+highMiss*rates.miss[1]+u.output*rates.output[1])/1e6};
}
export const dayInShanghai=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
export class UsageLedger {
 constructor(dir){this.file=path.join(dir,'usage.json');this.data={version:1,trackingStartedAt:new Date().toISOString(),events:[]};this.writes=Promise.resolve();}
 async init(){try{this.data=JSON.parse(await readFile(this.file,'utf8'));if(!Array.isArray(this.data.events))throw new Error('本地用量文件格式无效。');}catch(e){if(e.code!=='ENOENT')throw e;await savePrivate(this.file,this.data);}}
 async record({provider,scope,model,kind='detect',usage=null,id,outcome='completed',at=Date.now()}){
  if(!scope)return;
  const key=id?createHash('sha256').update(provider+'|'+scope+'|'+id).digest('hex'):randomUUID();
  const operation=async()=>{
   if(this.data.events.some(e=>e.id===key))return;
   const known=normalizeUsage(usage,provider);
   this.data.events.push({id:key,provider,scope,model,kind,at,outcome,usage:known,cost:provider==='deepseek'?estimateCost(model,known):null});
   this.data.events=this.data.events.filter(e=>e.at>Date.now()-35*86400000);
   await savePrivate(this.file,this.data);
  };
  const next=this.writes.then(operation);this.writes=next.catch(()=>{});await next;
 }
 summary(provider,scope,now=Date.now()){
  const all=this.data.events.filter(e=>e.provider===provider && e.scope===scope);
  const accumulate=events=>events.reduce((s,e)=>{
   s.requests++;if(e.kind==='test')s.tests++;
   if(e.usage){s.knownRequests++;s.inputTokens+=e.usage.input;s.outputTokens+=e.usage.output;s.totalTokens+=e.usage.total;s.cacheHitTokens+=e.usage.hit || 0;s.reasoningTokens+=e.usage.reasoning || 0;}
   else if(e.outcome!=='rejected')s.unknownRequests++;
   if(e.cost){s.costMinCny+=e.cost.min;s.costMaxCny+=e.cost.max;}
   else if(provider==='deepseek' && e.usage)s.unpricedRequests++;
   return s;
  },{requests:0,tests:0,knownRequests:0,unknownRequests:0,inputTokens:0,outputTokens:0,totalTokens:0,cacheHitTokens:0,reasoningTokens:0,costMinCny:0,costMaxCny:0,unpricedRequests:0});
  const day=dayInShanghai(now);
  return {provider,trackingStartedAt:this.data.trackingStartedAt,asOf:new Date(now).toISOString(),timeZone:'Asia/Shanghai',day,today:accumulate(all.filter(e=>dayInShanghai(e.at)===day)),recentFiveHours:accumulate(all.filter(e=>e.at>now-5*3600000 && e.at<=now)),planPercent:null,planPercentAvailable:false,planUsageUrl:'https://chatgpt.com/settings/usage',priceDate:'2026-10-22',priceUrl:'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',pricingNote:'按官方高峰/空闲价格范围估算；仅统计本机本工具启用后收到的用量，不等于账户完整账单。'};
 }
}
