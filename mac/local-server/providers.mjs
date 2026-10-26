import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {savePrivate} from './auth.mjs';
import {MODEL,EFFORT,instructions} from './inference.mjs';
export class Providers {
 constructor(dir){this.file=path.join(dir,'providers.json');this.config={provider:'chatgpt',model:'deepseek-flash',thinking:'disabled',thinkingEffort:'high',maxConcurrent:10,apiKey:'',chatgptModel:MODEL,chatgptEffort:EFFORT};}
 async init(){try{const saved=JSON.parse(await readFile(this.file,'utf8'));this.config={...this.config,...saved};}catch(e){if(e.code!=='ENOENT')throw e;}if(!Number.isInteger(this.config.maxConcurrent)||this.config.maxConcurrent<1||this.config.maxConcurrent>100)this.config.maxConcurrent=10;}
 info(){const c=this.config,effort=c.thinking==='enabled'?c.thinkingEffort:'none';return c.provider==='deepseek'?{provider:'deepseek',model:c.model,effort,maxConcurrent:c.maxConcurrent,connected:!!c.apiKey,cacheIdentity:c.apiKey?'ds:'+createHash('sha256').update(JSON.stringify([c.apiKey,c.model,effort])).digest('hex').slice(0,24):null}:{provider:'chatgpt',model:c.chatgptModel,effort:c.chatgptEffort,maxConcurrent:c.maxConcurrent};}
 async save(form){
  const provider=form.get('provider');if(!['chatgpt','deepseek'].includes(provider))throw new Error('请选择ChatGPT套餐或DeepSeek API。');
  const model=form.get('model') || this.config.model,thinking=form.get('thinking') || this.config.thinking;
  const thinkingEffort=form.get('thinkingEffort') || this.config.thinkingEffort || 'high';
  if(!['deepseek-flash','deepseek-v4-pro'].includes(model) || !['enabled','disabled'].includes(thinking) || !['low','high','max'].includes(thinkingEffort))throw new Error('DeepSeek模型、思考模式或思考强度无效。');
  const rawConcurrency=form.get('maxConcurrent'),maxConcurrent=rawConcurrency===null?this.config.maxConcurrent:Number(rawConcurrency);
  if(!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>100)throw new Error('并发任务数必须为1到100的整数。');
  const supplied=(form.get('apiKey') || '').trim();
  if(supplied && (supplied.length<10 || supplied.length>512 || /\s/.test(supplied)))throw new Error('API Key格式不正确，请完整粘贴。');
  const apiKey=form.get('clearKey')==='yes'?'':supplied || this.config.apiKey;
  const chatgptModel=(form.get('chatgptModel') || this.config.chatgptModel).trim(),chatgptEffort=form.get('chatgptEffort') || this.config.chatgptEffort;
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(chatgptModel))throw new Error('ChatGPT模型ID格式无效。');
  if(!['auto','none','minimal','low','medium','high','xhigh','max','ultra'].includes(chatgptEffort))throw new Error('ChatGPT推理强度无效。');
  const next={provider,model,thinking,thinkingEffort,maxConcurrent,apiKey,chatgptModel,chatgptEffort};
  if(provider==='deepseek' && !apiKey)throw new Error('请填写DeepSeek API Key后保存。');
  await savePrivate(this.file,next);this.config=next;
 }
}
export function deepseekBody(transcript,{model,thinking,thinkingEffort='high'}){
 return {model,thinking:{type:thinking},...(thinking==='enabled'?{reasoning_effort:thinkingEffort}:{}),stream:false,...(thinking==='disabled'?{max_tokens:128}:{}),response_format:{type:'json_object'},messages:[{role:'system',content:instructions},{role:'user',content:JSON.stringify({transcript:transcript.slice(0,15000)})}]};
}
export async function inferDeepseek(transcript,config,fetcher=fetch,onUsage=async()=>{}){
 if(!config.apiKey)throw new Error('请先配置DeepSeek API Key。');
 let r;try{r=await fetcher('https://api.deepseek.com/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(deepseekBody(transcript,config)),signal:AbortSignal.timeout(180000)});}catch{await onUsage({outcome:'unknown'});throw new Error('无法连接DeepSeek API，请检查网络后重试。');}
 if(!r.ok){await onUsage({outcome:'rejected'});const hints={401:'API Key无效',402:'账户余额不足',429:'请求受限，请稍后重试',400:'模型或请求参数不受支持',422:'模型或请求参数不受支持'};throw new Error(`DeepSeek请求失败（${r.status}）：${hints[r.status] || '服务暂不可用，请稍后重试'}。`);}
 let data;try{data=await r.json();}catch{await onUsage({outcome:'unknown'});throw new Error('DeepSeek返回数据格式无效。');}
 await onUsage({usage:data.usage,id:data.id,outcome:data.choices?.[0]?.finish_reason==='stop'?'completed':'failed'});
 const choice=data.choices?.[0];
 if(choice?.finish_reason!=='stop')throw new Error(`DeepSeek未正常完成（${['length','content_filter','aborted','insufficient_system_resource'].includes(choice?.finish_reason)?choice.finish_reason:'响应不完整'}），未保存结果。`);
 if(typeof choice.message?.content!=='string' || !choice.message.content.trim())throw new Error('DeepSeek未返回评分。');
 return choice.message.content;
}
