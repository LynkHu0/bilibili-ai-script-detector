chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(message.type!=='DS_OFFICIAL_USAGE_SYNC')return false;
 let allowed=false;try{const u=new URL(sender.url || sender.tab?.url);allowed=u.origin==='https://platform.deepseek.com' && /^\/usage\/?$/.test(u.pathname);}catch{}
 if(!allowed){reply({error:'只接受DeepSeek官方用量页的同步。'});return false;}
 (async()=>{
  const token=(await chrome.storage.local.get('biliLocalToken')).biliLocalToken;
  if(!token)throw new Error('请先在检测插件中保存本机连接码。');
  const response=await fetch('http://127.0.0.1:17653/api/official-usage',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({snapshot:message.snapshot,bind:message.bind===true}),signal:AbortSignal.timeout(10000)});
  const body=await response.json();if(!response.ok)throw new Error(body.error || '官方账单同步失败。');return {ok:true};
 })().then(reply).catch(e=>reply({error:e.message}));return true;
});
