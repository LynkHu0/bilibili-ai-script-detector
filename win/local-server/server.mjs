import http from 'node:http';
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
const csrf=randomBytes(32).toString('base64url');
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
function page(message=''){
 const a=auth.active(),config=providers.config,info=providers.info();
 const common=[['gpt-6-luna','GPT-6 Luna'],['gpt-6-sol','GPT-6 Sol'],['gpt-6.1-sol','GPT-6.1 Sol'],['gpt-6-astra','GPT-6 Astra'],['gpt-5.6-luna','GPT-5.6 Luna'],['gpt-5.6-sol','GPT-5.6 Sol'],['gpt-5.6-terra','GPT-5.6 Terra']];
 const models=new Map([...catalog.models.map(m=>[m.slug,m.name]),...common]);if(!models.has(config.chatgptModel))models.set(config.chatgptModel,config.chatgptModel);
 const efforts=[['auto','自动（模型默认）'],['none','None'],['minimal','Minimal'],['low','Low'],['medium','Medium'],['high','High'],['xhigh','XHigh'],['max','Max'],['ultra','Ultra']];
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="bili-local-token" content="${pairing}"><title>B站文案检测 · 服务设置</title><style>body{max-width:650px;margin:50px auto;padding:20px;font:16px/1.7 system-ui;background:#131722;color:#eee}button,input,select{padding:12px;border-radius:8px;border:1px solid #777;max-width:100%;box-sizing:border-box}button{cursor:pointer;background:#f5a6c3}input{width:100%}input[type=number]{width:8rem}input[type=checkbox]{width:auto;flex:0 0 auto;margin:0}small{color:#bdc3ce}section{padding:18px;background:#202636;margin:20px 0;border-radius:12px}a{color:#f5a6c3}.checkbox-row{display:flex;align-items:center;gap:10px}</style><script src="/usage-format.js" defer></script><script src="/settings.js" defer></script><h1>B站文案检测</h1><p>当前服务：${info.provider==='deepseek'?'DeepSeek API · '+esc(info.model)+' · '+(info.effort==='none'?'非思考模式':`思考模式 · ${esc(info.effort.toUpperCase())}`):'ChatGPT 套餐 · '+esc(config.chatgptModel)+' · '+esc(config.chatgptEffort)}</p><p>${esc(message)}</p><section id="provider"><h2>检测服务</h2><form method="post" action="/provider/save">
 <input type="hidden" name="csrf" value="${csrf}">
 <label>服务 <select name="provider"><option value="chatgpt" ${config.provider==='chatgpt'?'selected':''}>ChatGPT 套餐</option><option value="deepseek" ${config.provider==='deepseek'?'selected':''}>DeepSeek API</option></select></label>
 <p><label>自动检测并发任务数 <input type="number" name="maxConcurrent" min="1" max="100" step="1" value="${config.maxConcurrent}"></label></p><p><small>范围 1–100，默认 10。并发越高，同时发出的模型请求越多，可能更快，也更容易触发服务限流或增加短时间用量。</small></p>
 <p><button type="submit" id="save-provider">保存并切换服务</button></p>
 <div id="chatgpt-options" ${config.provider==='deepseek'?'hidden':''}><p><label>ChatGPT 模型 <select name="chatgptModel">${[...models].map(([value,label])=>`<option value="${esc(value)}" ${config.chatgptModel===value?'selected':''}>${esc(label)} · ${esc(value)}</option>`).join('')}</select></label></p>
 <p><label>ChatGPT 推理强度 <select name="chatgptEffort">${efforts.map(([value,label])=>`<option value="${value}" ${config.chatgptEffort===value?'selected':''}>${label}</option>`).join('')}</select></label></p>
 <p><small>${esc(catalog.error || '已列出当前账户模型及常见候选模型。')} 具体可用性取决于账户权限；不支持的组合会在测试时报告。</small></p></div>
 <div id="deepseek-options" ${config.provider==='chatgpt'?'hidden':''}><p><label>DeepSeek 模型 <select name="model"><option value="deepseek-flash" ${config.model==='deepseek-flash'?'selected':''}>DeepSeek Flash</option><option value="deepseek-v4-pro" ${config.model==='deepseek-v4-pro'?'selected':''}>DeepSeek Pro</option></select></label></p>
 <p><label>思考模式 <select name="thinking"><option value="disabled" ${config.thinking==='disabled'?'selected':''}>关闭（非思考）</option><option value="enabled" ${config.thinking==='enabled'?'selected':''}>开启</option></select></label></p>
 <div id="deepseek-effort-options" ${config.thinking==='disabled'?'hidden':''}><p><label>思考强度 <select name="thinkingEffort"><option value="low" ${config.thinkingEffort==='low'?'selected':''}>Low · 低</option><option value="high" ${config.thinkingEffort==='high'?'selected':''}>High · 高</option><option value="max" ${config.thinkingEffort==='max'?'selected':''}>Max · 最大</option></select></label></p></div>
 <label>DeepSeek API Key <input name="apiKey" type="password" autocomplete="new-password" placeholder="${config.apiKey?'已保存，留空保留现有Key':'粘贴DeepSeek API Key'}"></label>
 <p><label class="checkbox-row"><input type="checkbox" name="clearKey" value="yes"><span>删除已保存的DeepSeek Key（需同时选回ChatGPT）</span></label></p>
 <p><small>DeepSeek 按你的API账户余额计费；选择它后，字幕会发送至 api.deepseek.com。Key只保存在本机，不返回给插件或页面。不会自动切换计费服务。</small></p></div>
 </form></section>
 <section id="chatgpt-login" ${config.provider==='deepseek'?'hidden':''}><h2>连接 ChatGPT</h2><p>${a?.access_token?'已登录：'+esc(a.email || 'ChatGPT账户'):'尚未登录'}</p>
 ${auth.data.accounts.map(x=>`<form method="post" action="/auth/start"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="account" value="${esc(x.client_id)}"><button>Continue with ChatGPT · ${esc(x.email || '已保存账户')} · ${esc(x.client_id.slice(-6))}</button></form>`).join('')}
 <form method="post" action="/auth/start"><input type="hidden" name="csrf" value="${csrf}"><button>Continue with ChatGPT${auth.data.accounts.length?' · 添加账户':''}</button></form>
 ${a?.access_token?`<form method="post" action="/logout"><input type="hidden" name="csrf" value="${csrf}"><button>退出当前账户</button></form>`:''}
 <small>会占用套餐额度。可在 <a href="https://chatgpt.com/settings/usage" rel="noreferrer">ChatGPT 使用量设置</a>管理额度与访问权限。模型无权限时会报错，不自动换模型或使用付费API密钥。</small></section>
 <section><h2>浏览器插件自动连接</h2><p>启动本机程序并加载扩展后，插件会自动连接，无需复制连接码。你只需在上方连接 ChatGPT，或选择 DeepSeek 并保存 API Key。</p></section>
 <section id="usage-panel"><h2>服务用量</h2><p id="usage-primary">读取用量中…</p><p id="usage-detail"></p><small id="usage-notice"></small><p><a id="usage-deepseek" href="https://platform.deepseek.com/usage" target="_blank" rel="noreferrer" hidden>打开DeepSeek官方账单并同步</a></p><p><a id="usage-official" href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">查看官方套餐用量</a></p><small>DeepSeek可同步官方页当前Key的账单汇总，保留所选时间范围。需更新扩展后在官方用量页点击同步；页面保持打开时自动更新。官方页可能有5分钟延迟。本机统计单独标注。</small></section>
 <section><h2>检查当前检测服务</h2><form method="post" action="/test"><input type="hidden" name="csrf" value="${csrf}"><button>测试当前服务</button></form><small>会使用一次很小的套餐请求。成功完成请求才表示该账户实际可用。</small></section>
 <p>检测只读取字幕文案；结果是风格判断。没有字幕的视频暂不支持。支持电脑Chrome和Edge，手机B站官方App暂不支持。</p></html>`;
}
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
   if(caller && caller!==origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(caller))return send(403,{error:'仅允许浏览器扩展连接。'});
   if(caller){res.setHeader('Access-Control-Allow-Origin',caller);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, X-BiliSlop-Client');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Private-Network','true');}
   if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
   if(url.pathname==='/api/pair'){
    if(req.method!=='POST' || !/^chrome-extension:\/\/[a-p]{32}$/.test(caller || '') || req.headers['x-bilislop-client']!=='extension' || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''))return send(403,{error:'自动连接仅允许浏览器扩展发起。'});
    await readBody(req);
    return send(200,{token:pairing});
   }
   if(!equal(req.headers.authorization,`Bearer ${pairing}`))return send(401,{error:'插件连接已过期，将自动重新连接。',code:'PAIRING_REQUIRED'});
   if(url.pathname==='/api/control/stop' && req.method==='POST'){
    if(!stopping){stopping=true;queue.cancelWaiting();const timer=setInterval(()=>{if(queue.busy || busy)return;clearInterval(timer);server.close(()=>process.exit(0));server.closeIdleConnections();},250);}
    return send(202,{running:true,stopping:true});
   }
   if(url.pathname==='/api/status' && req.method==='GET')return send(200,publicStatus());
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
  if(req.method==='GET' && url.pathname==='/usage-format.js'){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});return res.end(await readFile(path.join(root,'../extension/bili/usage-format.js'),'utf8'));}
  if(req.method==='GET' && url.pathname==='/settings.js'){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});return res.end(await readFile(path.join(root,'settings-ui.js'),'utf8'));}
  if(req.method==='GET' && url.pathname==='/'){await catalog.refresh(auth);return send(200,page(),true);}
  if(req.method==='GET' && url.pathname==='/auth/callback'){
   if(busy || queue.busy)throw new Error('检测尚未完成，请等待完成后重新登录。');
   await auth.finish(url);res.writeHead(303,{Location:'/'});return res.end();
  }
  if(req.method==='POST' && ['/auth/start','/logout','/test','/provider/save'].includes(url.pathname)){
   if(req.headers.origin!==origin)return send(403,{error:'请求来源不匹配。'});
   const form=new URLSearchParams(await readBody(req));if(!equal(form.get('csrf'),csrf))return send(403,{error:'页面已过期，请刷新后重试。'});
   if(busy || queue.busy)return send(409,page('请等待当前检测完成后重试。'),true);
   if(url.pathname==='/provider/save'){await providers.save(form);queue.setConcurrency(providers.config.maxConcurrent);await catalog.refresh(auth);return send(200,page('服务与并发设置已保存。页面顶部显示当前生效配置。'),true);}
   if(url.pathname==='/auth/start'){res.writeHead(303,{Location:await auth.begin(form.get('account'))});return res.end();}
   if(url.pathname==='/logout'){const revoked=await auth.logout();return send(200,page(revoked?'已退出。':'已在本机退出；未确认远端撤销。请到ChatGPT设置断开该工具。'),true);}
   busy=true;
   try{
    if(providers.config.provider==='deepseek'){
      validateResult(await inferConfiguredDeepseek('这是一段用于验证文案检测接口的简短测试字幕，主要检查服务是否能够返回有效的JSON分数，不要求解释或其他输出。','test'));
    }else{
      const chosen=providers.info();
      const body={model:chosen.model,...(chosen.effort==='auto'?{}:{reasoning:{effort:chosen.effort}}),store:false,stream:true,input:[{role:'user',content:'Reply exactly OK.'}]};
      const text=await infer(body,'test');if(text.trim()!=='OK')throw new Error('模型已完成响应，但验证文本不匹配。');
    }
    return send(200,page('当前服务测试通过。'),true);
   }finally{busy=false;}
  }
  return send(404,{error:'页面不存在。'});
 }catch(e){
  const safe=e instanceof SyntaxError?'数据格式无效。':e.message;
  // OAuth URLs, callback query strings, credentials, transcript text are never logged.
  if(req.url.startsWith('/api/'))send(400,{error:safe});else send(400,page(safe),true);
 }
});
server.requestTimeout=210000;
server.listen(port,'127.0.0.1',()=>{console.log(`本地检测程序已启动：${origin}\n当前服务：${providers.info().provider} / ${providers.info().model}。请打开页面配置检测服务，插件会自动连接。`);});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'本地检测程序已在运行，或端口17653被占用。':'本地程序无法启动：'+e.code);process.exitCode=1;});
