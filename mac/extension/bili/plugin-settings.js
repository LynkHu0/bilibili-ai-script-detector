/* Service configuration remains in the local backend, not chrome.storage. */
(() => {
 const $=id=>document.getElementById(id);
 let loading,working=false;
 const message=(text,bad=false)=>{const e=$('config-message');e.textContent=text;e.style.color=bad?'var(--accent-red)':'var(--text-secondary)';};
 async function api(path,body){
  const response=await BiliLocal.request(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
  const data=await response.json();if(!response.ok)throw new Error(response.status===404?'请更新并重启本机程序，以使用插件内设置。':data.error || '设置请求失败。');return data;
 }
 function selectProvider(){const deep=$('provider').value==='deepseek';$('chatgpt-config').hidden=deep;$('chatgpt-accounts').hidden=deep;$('deepseek-config').hidden=!deep;thinking();}
 function thinking(){$('deepseek-effort-row').hidden=$('deepseek-thinking').value!=='enabled';}
 function render(data){
  const c=data.config;if(!c)throw new Error('本机程序版本较旧，请更新后重启。');
  for(const [id,key] of [['provider','provider'],['max-concurrent','maxConcurrent'],['transcript-limit','transcriptLimit'],['chatgpt-model','chatgptModel'],['chatgpt-effort','chatgptEffort'],['deepseek-model','model'],['deepseek-thinking','thinking'],['deepseek-effort','thinkingEffort']])$(id).value=String(c[key]);
  $('deepseek-key').value='';$('deepseek-key').placeholder=c.apiKeySet?'已保存，留空保留现有 Key':'填写 DeepSeek API Key';$('clear-key').checked=false;
  $('model-notice').textContent=data.modelNotice || '可选择账户模型或输入你有权限使用的模型 ID。';
  $('chatgpt-models').replaceChildren();for(const m of data.models || []){const option=document.createElement('option');option.value=m.id;option.label=m.name;$('chatgpt-models').append(option);}
  $('account-list').replaceChildren();
  for(const account of data.accounts || []){
   const row=document.createElement('div');row.className='account-row';const text=document.createElement('span');text.textContent=account.email+(account.active&&account.loggedIn?' · 当前使用':account.loggedIn?'':' · 已退出');row.append(text);
   if(!account.active || !account.loggedIn){const button=document.createElement('button');button.type='button';button.className='btn btn-retry';button.textContent=account.loggedIn?'切换使用':'重新登录';button.onclick=()=>account.loggedIn?perform(async()=>{render(await api('/api/accounts/switch',{account:account.id}));await syncIdentity();message('已切换账户。');}):login(account.id);row.append(button);}
   $('account-list').append(row);
  }
  $('account-empty').hidden=!!data.accounts?.length;
  $('logout-account').hidden=!data.accounts?.some(a=>a.active&&a.loggedIn);
  const s=data.status || {};if(Object.prototype.hasOwnProperty.call(s,'cacheIdentity'))chrome.storage.local.set({biliProviderIdentity:s.cacheIdentity || ''}).catch(()=>{});$('provider-status').textContent=s.provider==='deepseek'?`DeepSeek API · ${s.model} · ${s.effort==='none'?'非思考':s.effort}`:`ChatGPT 套餐 · ${s.model || c.chatgptModel} / ${s.effort || c.chatgptEffort}`;
  selectProvider();$('save-config').disabled=false;
 }
 async function syncIdentity(){try{const r=await BiliLocal.request('/api/status');if(r.ok){const d=await r.json();await chrome.storage.local.set({biliProviderIdentity:d.cacheIdentity || ''});}}catch{}}
 async function load(){
  if(loading)return loading;
  loading=(async()=>{try{render(await api('/api/settings'));message('');}catch(e){message(e.message,true);$('save-config').disabled=true;}})();
  try{await loading;}finally{loading=null;}
 }
 async function perform(action){if(working)return;working=true;$('save-config').disabled=true;try{await action();}catch(e){message(e.message,true);}finally{working=false;$('save-config').disabled=false;}}
 async function login(account){await perform(async()=>{const data=await api('/api/auth/start',{account});const url=new URL(data.launchUrl);if(url.origin!=='http://127.0.0.1:17653'||url.pathname!=='/auth/launch')throw new Error('登录入口地址无效。');await chrome.tabs.create({url:url.href});message('请在 OpenAI 页面完成授权，再回到插件。');});}
 $('provider').addEventListener('change',selectProvider);$('deepseek-thinking').addEventListener('change',thinking);
 $('provider-form').addEventListener('submit',event=>{event.preventDefault();perform(async()=>{
  const body={provider:$('provider').value,maxConcurrent:$('max-concurrent').value,transcriptLimit:$('transcript-limit').value,chatgptModel:$('chatgpt-model').value.trim(),chatgptEffort:$('chatgpt-effort').value,model:$('deepseek-model').value,thinking:$('deepseek-thinking').value,thinkingEffort:$('deepseek-effort').value,apiKey:$('deepseek-key').value.trim(),clearKey:$('clear-key').checked?'yes':''};
  const data=await api('/api/settings',body);$('deepseek-key').value='';render(data);await syncIdentity();message('检测设置已保存。');
 });});
 $('refresh-models').onclick=()=>perform(async()=>{render(await api('/api/models/refresh',{}));message('模型列表已更新。');});
 $('refresh-config').onclick=load;
 $('add-account').onclick=()=>login(null);
 $('logout-account').onclick=()=>perform(async()=>{const d=await api('/api/auth/logout',{});render(d);await syncIdentity();message(d.message);});
 for(const [id,key] of [['show-percentage','biliShowPercentage'],['show-glow','biliShowGlow']]){
  chrome.storage.local.get(key).then(d=>$(id).checked=d[key]!==false).catch(()=>{});
  $(id).addEventListener('change',()=>{chrome.storage.local.set({[key]:!!$(id).checked}).catch(e=>message(e.message,true));});
 }
 globalThis.PluginSettings={load};selectProvider();
})();
