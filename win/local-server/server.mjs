import http from 'node:http';
import {EXTENSION_ID} from '../native/identity.mjs';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {UsageLedger} from './usage.mjs';
import {OfficialUsage} from './official-usage.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {Auth,savePrivate} from './auth.mjs';
import {AnalysisQueue} from './queue.mjs';
import {Providers,inferDeepseek} from './providers.mjs';
import {ModelCatalog} from './catalog.mjs';
import {MODEL,EFFORT,PROMPT_VERSION,requestBody,readResponseStream,validateResult} from './inference.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const dir=process.env.BILI_SLOP_DATA_DIR || path.resolve(root,'../../.local-data');
const port=Number(process.env.BILI_SLOP_PORT || 17653);
const origin=`http://127.0.0.1:${port}`;
const extensionOrigin='chrome-extension://'+EXTENSION_ID;
const appVersion=(await readFile(path.join(root,'../VERSION'),'utf8')).trim();
const auth=new Auth(dir,origin);await auth.init();
const providers=new Providers(dir);await providers.init();
const catalog=new ModelCatalog();
const ledger=new UsageLedger(dir);await ledger.init();
const official=new OfficialUsage(dir);await official.init();
const validConnection=value=>typeof value==='string' && /^[A-Za-z0-9_-]{43}$/.test(value);
let savedConnection;try{savedConnection=JSON.parse(await readFile(path.join(dir,'connection.json'),'utf8')).code;}catch{}
const pairing=validConnection(process.env.BILI_SLOP_CONNECTION_CODE)?process.env.BILI_SLOP_CONNECTION_CODE:validConnection(savedConnection)?savedConnection:randomBytes(32).toString('base64url');
delete process.env.BILI_SLOP_CONNECTION_CODE;
await savePrivate(path.join(dir,'connection.json'),{code:pairing});
const cache=new Map();const queue=new AnalysisQueue({limit:100,concurrency:providers.config.maxConcurrent});let busy=false;let stopping=false;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function equal(a,b){const aa=Buffer.from(a || ''),bb=Buffer.from(b);return aa.length===bb.length && timingSafeEqual(aa,bb);}
function chatgptIdentity(){const a=auth.active();return a?.access_token?createHash('sha256').update(a.client_id+':'+a.subject).digest('hex').slice(0,24):null;}
function identity(){return providers.config.provider==='deepseek'?providers.info().cacheIdentity:(chatgptIdentity()?chatgptIdentity()+':'+providers.info().model+':'+providers.info().effort:null);}
function usageScope(provider=providers.config.provider){return provider==='deepseek'?(providers.config.apiKey?'ds:'+createHash('sha256').update(providers.config.apiKey).digest('hex').slice(0,24):null):chatgptIdentity();}
function currentUsage(){return {...ledger.summary(providers.config.provider,usageScope()),officialDeepseek:providers.config.provider==='deepseek'?official.get(usageScope('deepseek')):null};}
async function logUsage(event){try{await ledger.record(event);ledger.persistenceError=false;}catch{ledger.persistenceError=true;console.error('用量记录暂未写入磁盘；显示值可能在重启后丢失。');}}
async function inferConfiguredDeepseek(transcript,kind='detect'){const config={...providers.config},scope=usageScope('deepseek');return inferDeepseek(transcript,config,fetch,e=>logUsage({...e,provider:'deepseek',scope,model:config.model,kind}));}
function publicStatus(){return {...providers.info(),connected:!!identity(),promptVersion:PROMPT_VERSION,cacheIdentity:identity()};}
async function readBody(req){
 let body='';for await(const c of req){body+=c;if(Buffer.byteLength(body)>150000)throw new Error('请求内容过长。');}return body;
}
function page(message='设置已迁移到浏览器插件。请打开插件设置，选择服务或管理账号。'){
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>B站文案检测</title><body><h1>B站文案检测</h1><p>${esc(message)}</p></body></html>`;
}
const loginLaunches=new Map();
function pluginSettings(){
 const c=providers.config,active=auth.active();
 const models=new Map([...catalog.models.map(m=>[m.slug,m.name]),...['gpt-6-luna','gpt-6-sol','gpt-6.1-sol','gpt-6-astra','gpt-5.6-luna','gpt-5.6-sol','gpt-5.6-terra'].map(id=>[id,id])]);
 if(!models.has(c.chatgptModel))models.set(c.chatgptModel,c.chatgptModel);
 return {status:publicStatus(),config:{provider:c.provider,model:c.model,thinking:c.thinking,thinkingEffort:c.thinkingEffort,maxConcurrent:c.maxConcurrent,chatgptModel:c.chatgptModel,chatgptEffort:c.chatgptEffort,apiKeySet:!!c.apiKey},accounts:auth.data.accounts.map(a=>({id:a.client_id,email:a.email || 'ChatGPT 账户',active:a.client_id===active?.client_id,loggedIn:!!a.access_token})),models:[...models].map(([id,name])=>({id,name})),modelNotice:catalog.error};
}
function settingsBusy(){return stopping || busy || queue.busy;}
async function infer(input,kind='detect'){
 const scope=usageScope('chatgpt');
 const token=await auth.access();
 let meta={outcome:'unknown'};
 try{
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(180000)});
  if(!r.ok){meta.outcome='rejected';let code='';try{const e=await r.json();code=e.error?.code || '';}catch{}
   throw new Error(`模型请求失败（HTTP ${r.status}${code?' / '+code:''}）。请检查登录、套餐额度、所选模型及推理强度的访问权限。`);
  }
  return await readResponseStream(r.body,(usage,id,type)=>{meta={usage,id,outcome:type==='response.completed'?'completed':'failed'};});
 }finally{await logUsage({...meta,provider:'chatgpt',scope,model:input.model,kind});}
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
 res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'self' https://auth.openai.com; frame-ancestors 'none'; base-uri 'none'");
 const send=(status,data,html=false)=>{res.writeHead(status,{'Content-Type':html?'text/html; charset=utf-8':'application/json; charset=utf-8'});res.end(html?data:JSON.stringify(data));};
 try{
  if(req.headers.host!==`127.0.0.1:${port}`)return send(403,{error:'不允许的主机地址。'});
  const url=new URL(req.url,origin);
  if(url.pathname==='/health' && req.method==='GET')return send(200,{app:'stop-the-slop-local',version:appVersion,stopping});
  if(url.pathname.startsWith('/api/')){
   const caller=req.headers.origin;
   if(caller && caller!==origin && caller!==extensionOrigin)return send(403,{error:'仅允许浏览器扩展连接。'});
   if(caller){res.setHeader('Access-Control-Allow-Origin',caller);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, X-BiliSlop-Client');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Private-Network','true');}
   if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
   if(url.pathname==='/api/pair'){
    if(req.method!=='POST' || caller!==extensionOrigin || req.headers['x-bilislop-client']!=='extension' || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''))return send(403,{error:'自动连接仅允许浏览器扩展发起。'});
    await readBody(req);
    return send(200,{token:pairing});
   }
   if(!equal(req.headers.authorization,`Bearer ${pairing}`))return send(401,{error:'插件连接已过期，将自动重新连接。',code:'PAIRING_REQUIRED'});
   if(url.pathname==='/api/control/stop' && req.method==='POST'){
    if(!stopping){stopping=true;queue.cancelWaiting();const timer=setInterval(()=>{if(queue.busy || busy)return;clearInterval(timer);server.close(()=>process.exit(0));server.closeIdleConnections();},250);}
    return send(202,{running:true,stopping:true});
   }
   if(url.pathname==='/api/status' && req.method==='GET')return send(200,publicStatus());
   if(url.pathname==='/api/settings' && req.method==='GET')return send(200,pluginSettings());
   if(url.pathname==='/api/models/refresh' && req.method==='POST'){await catalog.refresh(auth,true);return send(200,pluginSettings());}
   if(req.method==='POST' && ['/api/settings','/api/auth/start','/api/accounts/switch','/api/auth/logout'].includes(url.pathname)){
    if(settingsBusy())return send(409,{error:'请等待正在进行的检测完成后重试；可先关闭自动检测。'});
    const body=JSON.parse(await readBody(req));
    if(url.pathname==='/api/settings'){
     const form=new URLSearchParams();for(const key of ['provider','model','thinking','thinkingEffort','maxConcurrent','chatgptModel','chatgptEffort','apiKey','clearKey'])if(body[key]!==undefined)form.set(key,String(body[key]));
     await providers.save(form);queue.setConcurrency(providers.config.maxConcurrent);return send(200,pluginSettings());
    }
    if(url.pathname==='/api/auth/start'){
     const account=body.account || null;
     if(account && !auth.data.accounts.some(a=>a.client_id===account))return send(404,{error:'未找到此账户，请刷新插件设置。'});
     loginLaunches.clear();const ticket=randomBytes(32).toString('base64url');loginLaunches.set(ticket,{account,expires:Date.now()+120000});
     return send(200,{launchUrl:origin+'/auth/launch?ticket='+ticket});
    }
    if(url.pathname==='/api/accounts/switch'){
     const account=auth.data.accounts.find(a=>a.client_id===body.account);
     if(!account?.access_token)return send(400,{error:'该账户已退出，请重新登录。'});
     auth.data.active=account.client_id;await auth.save();catalog.models=[];catalog.account=null;catalog.error='账户已切换，可刷新模型列表。';return send(200,pluginSettings());
    }
    const revoked=await auth.logout();catalog.models=[];catalog.account=null;catalog.error='登录 ChatGPT 后可刷新账户模型列表。';return send(200,{...pluginSettings(),message:revoked?'已退出当前账户。':'已在本机退出；可到 ChatGPT 安全设置断开该工具。'});
   }

   if(url.pathname==='/api/official-usage' && req.method==='GET')return send(200,{snapshot:official.get(usageScope('deepseek'))});
   if(url.pathname==='/api/official-usage' && req.method==='POST'){const body=JSON.parse(await readBody(req));return send(200,{snapshot:await official.update(usageScope('deepseek'),body.snapshot,body.bind===true)});}
   if(url.pathname==='/api/usage' && req.method==='GET')return send(200,{...currentUsage(),persistenceError:!!ledger.persistenceError});
   if(url.pathname.startsWith('/api/jobs/') && req.method==='GET'){
    const job=queue.snapshot(url.pathname.slice('/api/jobs/'.length));
    if(!job || job.account!==identity())return send(404,{error:'未找到该账户的检测任务。'});
    const {account,...status}=job;return send(200,status);
   }
   if(stopping)return send(503,{error:'检测服务正在停止，请在插件中重新启动后检测。'});
   if(url.pathname!=='/api/jobs' || req.method!=='POST')return send(404,{error:'接口不存在。'});
   if(!identity())return send(401,{error:providers.config.provider==='deepseek'?'请先在本地设置页面填写DeepSeek API Key。':'请先在本地设置页面登录ChatGPT。'});
   if(busy)return send(429,{error:'模型连接测试正在进行，请稍后重试。'});
   const data=JSON.parse(await readBody(req));
   if(!/^bili:BV[a-zA-Z0-9]{10}:\d+$/.test(data.videoId) || typeof data.transcript!=='string' || data.transcript.trim().length<50)return send(422,{error:'视频编号无效或字幕不足50字。'});
   const transcript=data.transcript.slice(0,15000);
   const key=createHash('sha256').update(identity()+providers.info().model+providers.info().effort+PROMPT_VERSION+data.videoId+transcript).digest('hex');
   if(cache.has(key))return send(200,{status:'completed',result:{...cache.get(key),cached:true}});
   const account=identity(),selected=providers.info();
   const job=queue.enqueue(key,account,async()=>{
    if(identity()!==account)throw new Error('当前登录账户已改变，请重新提交检测。');
    const raw=selected.provider==='deepseek'?await inferConfiguredDeepseek(transcript):await infer(requestBody(transcript,{model:selected.model,effort:selected.effort}));
    const result={...validateResult(raw,{engine:selected.model,effort:selected.effort,provider:selected.provider}),videoId:data.videoId,found:true,analyzedCharacters:transcript.length,cacheIdentity:account};
    if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(key,result);return result;
   });
   const {account:ignored,...status}=job;
   return send(202,status);
  }
  if(req.method==='GET' && url.pathname==='/')return send(200,page(),true);
  if(req.method==='GET' && url.pathname==='/auth/launch'){
   const ticket=url.searchParams.get('ticket'),launch=loginLaunches.get(ticket);loginLaunches.delete(ticket);
   if(!launch || launch.expires<Date.now())return send(400,page('登录入口已过期，请在插件中重新点击登录。'),true);
   if(settingsBusy())return send(409,page('检测尚未完成，请等待完成后从插件重新登录。'),true);
   res.writeHead(303,{Location:await auth.begin(launch.account)});return res.end();
  }
  if(req.method==='GET' && url.pathname==='/auth/callback'){
   if(settingsBusy())throw new Error('检测尚未完成，请等待完成后重新登录。');
   await auth.finish(url);catalog.models=[];catalog.account=null;catalog.error='授权已完成，可在插件中刷新模型列表。';return send(200,page('ChatGPT 授权完成。可以关闭此页面，回到插件查看账户并继续使用。'),true);
  }
  return send(404,{error:'页面不存在。'});
 }catch(e){
  const safe=e instanceof SyntaxError?'数据格式无效。':e.message;
  // OAuth URLs, callback query strings, credentials, transcript text are never logged.
  if(req.url.startsWith('/api/'))send(400,{error:safe});else send(400,page(safe),true);
 }
});
server.requestTimeout=210000;
server.listen(port,'127.0.0.1',()=>{console.log(`本地检测程序已启动：${origin}\n当前服务：${providers.info().provider} / ${providers.info().model}。请在浏览器插件中配置检测服务。`);});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'本地检测程序已在运行，或端口17653被占用。':'本地程序无法启动：'+e.code);process.exitCode=1;});
