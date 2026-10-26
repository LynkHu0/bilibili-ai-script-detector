import path from 'node:path';import {readFile} from 'node:fs/promises';import {savePrivate} from './auth.mjs';
export function validateSnapshot(data){
 if(!data || data.sourceUrl!=='https://platform.deepseek.com/usage')throw new Error('官方账单来源无效。');
 const label=typeof data.apiKeyLabel==='string'?data.apiKeyLabel.trim():'';
 if(!label || label.length>120 || /全部|所有|all\s*(api|key)/i.test(label))throw new Error('请在官方页筛选本工具专用的单个API Key。');
 const period=typeof data.periodLabel==='string'?data.periodLabel.trim():'';
 if(!period || period.length>120)throw new Error('无法确认账单时间范围。');
 if(!['CNY','USD'].includes(data.currency) || typeof data.cost!=='number' || !Number.isFinite(data.cost) || data.cost<0)throw new Error('官方消费金额无效。');
 for(const key of ['requests','tokens'])if(!Number.isSafeInteger(data[key]) || data[key]<0)throw new Error('官方账单计数无效。');
 return {source:'deepseek-dashboard',sourceUrl:data.sourceUrl,apiKeyLabel:label,periodLabel:period,currency:data.currency,cost:data.cost,requests:data.requests,tokens:data.tokens,syncedAt:new Date().toISOString(),precision:'dashboard-display',verification:'user-bound-key-label'};
}
export class OfficialUsage {
 constructor(dir){this.file=path.join(dir,'official-usage.json');this.records={};this.writes=Promise.resolve();}
 async init(){try{const data=JSON.parse(await readFile(this.file,'utf8'));this.records=data.records || {};}catch(e){if(e.code!=='ENOENT')throw e;}}
 get(scope){return this.records[scope] || null;}
 async update(scope,data,bind=false){
  if(!scope)throw new Error('请先在本地设置里配置本工具使用的DeepSeek Key。');
  const snapshot=validateSnapshot(data);
  const task=async()=>{
   const old=this.get(scope);
   if(!bind && (!old || old.apiKeyLabel!==snapshot.apiKeyLabel || old.periodLabel!==snapshot.periodLabel))throw new Error('筛选已改变，请在官方页点击“同步当前Key账单”重新确认。');
   const next={...this.records,[scope]:snapshot};await savePrivate(this.file,{version:1,records:next});this.records=next;return snapshot;
  };
  const pending=this.writes.then(task);this.writes=pending.catch(()=>{});return pending;
 }
}
