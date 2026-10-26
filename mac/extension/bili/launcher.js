/* Original Stop the Slop gauge presentation, backed by the local plan adapter. */
const BASE='http://127.0.0.1:17653';
const $=id=>document.getElementById(id);
const states=['state-ready','state-not-youtube','state-loading','state-error','state-rate-limit','state-result'];
let activeTab, running=false;
function show(id){for(const key of states)$(key).classList.toggle('hidden',key!==id);}
function error(message){$('error-message').textContent=message;show('state-error');}
function render(result){
 if(!BiliSlop.validScore(result?.score))throw new Error('检测结果未包含有效评分。');
 const score=result.score;
 const kind=score<.4?'human':score<=.7?'mixed':'ai';
 const color=`var(--accent-${kind==='human'?'green':kind==='mixed'?'yellow':'red'})`;
 $('score-value').textContent=`${Math.round(score*100)}%`;
 $('score-value').style.color=color;
 $('gauge-fill').setAttribute('stroke-dashoffset',String(251.33*(1-score)));
 $('gauge-needle').setAttribute('transform',`rotate(${score*180-90}, 100, 100)`);
 $('verdict').className=`verdict verdict--${kind}`;
 $('verdict-text').textContent=BiliSlop.label(score);
 show('state-result');
}
function applyTheme(theme){
 if(theme==='system')document.documentElement.removeAttribute('data-theme');
 else document.documentElement.setAttribute('data-theme',theme);
 for(const t of ['system','dark','light'])$(`theme-icon-${t}`).classList.toggle('hidden',t!==theme);
 $('theme-toggle').title=`Theme: ${theme}`;
 localStorage.setItem('sts_theme',theme);
}
async function connection(){
 let response;
 try{response=await BiliLocal.request('/api/status');}
 catch{throw new Error('请先启动本地检测程序。');}
 const data=await response.json();if(!response.ok)throw new Error(data.error || '本机连接失败。');
 if(!data.connected)throw new Error(data.provider==='deepseek'?'请在本地设置中填写DeepSeek API Key。':'请先打开本地登录页面，连接ChatGPT。');
 $('provider-status').textContent=data.provider==='deepseek'?`DeepSeek API · ${data.model} · ${data.effort==='none'?'非思考':`思考 ${data.effort.toUpperCase()}`}`:`ChatGPT 套餐 · ${data.model} / ${data.effort}`;
 await chrome.storage.local.set({biliProviderIdentity:data.cacheIdentity});
 return data;
}
async function analyze(){
 if(running)return;running=true;let connected=false;document.querySelector('#state-loading .state-message').textContent='正在读取字幕…';show('state-loading');
 try{
  await connection();connected=true;
  if(!BiliSlop.parse(activeTab?.url)){show('state-not-youtube');return;}
  const result=await BiliSlop.analyze(activeTab.url,progress=>{
    document.querySelector('#state-loading .state-message').textContent=progress.status==='queued'?`排队中 · 前方 ${progress.queuePosition || 1} 个任务`:'正在检测文案…';
  });
  render(result);
 }catch(e){error(e.message);if(!connected)$('connection-settings').classList.remove('hidden');}
 finally{running=false;}
}
$('btn-retry').onclick=analyze;
$('analyze').onclick=analyze;
$('settings-toggle').onclick=()=>$('connection-settings').classList.toggle('hidden');
$('open').onclick=()=>chrome.tabs.create({url:BASE});
// 自动检测开关：保存在本机，默认开启；内容脚本监听变化后立即生效，无需刷新B站页面。
const autoDetect=$('auto-detect');
async function initAutoDetectSetting(){
 if(!autoDetect)return;
 try{const stored=await chrome.storage.local.get('biliAutoDetect');autoDetect.checked=stored.biliAutoDetect!==false;}
 catch{autoDetect.checked=true;}
 autoDetect.addEventListener?.('change',()=>{chrome.storage.local.set({biliAutoDetect:!!autoDetect.checked}).catch(()=>{});});
}
initAutoDetectSetting();
$('theme-toggle').onclick=()=>{
 const themes=['system','dark','light'];
 applyTheme(themes[(themes.indexOf(localStorage.getItem('sts_theme') || 'system')+1)%themes.length]);
};
async function initialState(){
 const parsed=BiliSlop.parse(activeTab?.url);
 if(!parsed){show('state-not-youtube');return;}
 const health=await connection();
 const key=`bili_card_plan_${parsed.bvid}_${parsed.p}`;
 const record=(await chrome.storage.local.get(key))[key];
 if(record && BiliSlop.validScore(record.score) && record.promptVersion===health.promptVersion && health.promptVersion===BiliSlop.PROMPT_VERSION && record.bvid===parsed.bvid && record.p===parsed.p && record.engine===health.model && record.effort===health.effort && record.cacheIdentity===health.cacheIdentity){render(record);return;}
 await analyze();
}
(async()=>{
 [activeTab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(activeTab?.url && new URL(activeTab.url).hostname==='www.youtube.com'){location.replace('../popup/popup.html');return;}
 const settings=await chrome.storage.local.get(['theme_preference']);
 applyTheme(settings.theme_preference || localStorage.getItem('sts_theme') || 'system');
 await initialState();
})().catch(e=>{error(e.message);$('connection-settings').classList.remove('hidden');});

async function refreshUsage(){
 try{
  const r=await BiliLocal.request('/api/usage');
  if(!r.ok)throw new Error();BiliUsageView.render(await r.json());
 }catch{$('usage-primary').textContent='用量暂不可读取';}
}
refreshUsage();setInterval(refreshUsage,5000);

// Native messaging can launch the local service even when its HTTP listener is stopped.
let serviceState={running:false,installed:false},serviceAction=false,servicePoll=false,serviceError='';
async function refreshService(){
 if(serviceAction || servicePoll)return;servicePoll=true;
 try{
  serviceState=await BiliLocal.control('status');
  $('service-status').textContent=serviceState.stopping?'正在停止检测服务':serviceState.occupied||serviceState.legacy?'旧版服务占用检测端口':serviceState.running?'正在运行检测服务':'没有运行检测服务';
  $('service-toggle').textContent=serviceState.stopping?'正在停止…':serviceState.running?'停止检测服务':'启动检测服务';
  $('service-toggle').disabled=!serviceState.installed || !!serviceState.stopping || !!serviceState.occupied;
  $('service-hint').textContent=serviceError || (!serviceState.installed?'请先运行安装包中的“安装本机组件”，再加载安装程序打开的新版扩展。':serviceState.message || (serviceState.stopping?'正在等待已提交的模型请求完成；未开始的任务已取消。':'后台运行，无需保留终端窗口。'));
 }catch(e){$('service-hint').textContent=e.message;}finally{servicePoll=false;}
}
$('service-toggle').onclick=async()=>{
 if(serviceAction)return;serviceAction=true;serviceError='';$('service-toggle').disabled=true;
 const stopping=serviceState.running;
 try{
  if(stopping)await chrome.storage.local.set({biliServiceStopped:true});
  const result=await BiliLocal.control(stopping?'stop':'start');
  if(result.occupied)throw new Error(result.message);
  if(!stopping && result.running){await chrome.storage.local.set({biliServiceStopped:false});await initialState();refreshUsage();}
 }catch(e){serviceError=e.message;$('service-hint').textContent=e.message;}finally{serviceAction=false;await refreshService();}
};
refreshService();setInterval(()=>{if(!document.hidden)refreshService();},3000);
