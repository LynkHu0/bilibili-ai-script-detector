(() => {
 if(location.origin!=='https://platform.deepseek.com' || !/^\/usage\/?$/.test(location.pathname))return;
 const box=document.createElement('div');box.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483647;background:#202636;color:#fff;padding:12px;border:1px solid #65708a;border-radius:10px;font:13px/1.5 system-ui;max-width:320px;box-shadow:0 4px 20px #0004';
 const button=document.createElement('button');button.textContent='同步当前Key账单到本地检测服务';button.style.cssText='padding:8px;border:0;border-radius:6px;background:#f5a6c3;color:#111;cursor:pointer';
 const note=document.createElement('p');note.style.cssText='font-size:12px;margin:7px 0 0';note.textContent='先筛选本工具专用Key。同步当前页面的金额、次数、Tokens和时间范围。';box.append(button,note);document.body.append(box);
 let signature='',lastData='',pending=false,timer;
 const sig=data=>data.apiKeyLabel+'|'+data.periodLabel;
 async function sync(bind){
  if(pending)return;let data;
  try{data=DeepSeekUsageExtract.read();}catch(e){if(bind)note.textContent=e.message;return;}
  if(!bind && (!signature || sig(data)!==signature))return;
  if(!bind && JSON.stringify(data)===lastData)return;
  pending=true;button.disabled=true;
  try{
   const reply=await chrome.runtime.sendMessage({type:'DS_OFFICIAL_USAGE_SYNC',snapshot:data,bind});
   if(reply?.error)throw new Error(reply.error);signature=sig(data);lastData=JSON.stringify(data);
   note.textContent=`已同步：${data.apiKeyLabel} · ${data.periodLabel}。页面保持打开时自动更新；官方数据可能延迟5分钟。`;
  }catch(e){note.textContent=e.message || '同步失败，请确认本地检测服务已启动并已连接。';}
  finally{pending=false;button.disabled=false;}
 }
 button.onclick=()=>sync(true);
 new MutationObserver(mutations=>{
  if(mutations.every(m=>box.contains(m.target)))return;
  clearTimeout(timer);timer=setTimeout(()=>sync(false),2000);
 }).observe(document.body,{childList:true,subtree:true,characterData:true});
})();
