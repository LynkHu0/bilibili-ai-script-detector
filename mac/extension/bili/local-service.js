/* Local service pairing stays private to extension contexts. */
globalThis.BiliLocal = (() => {
  const base = 'http://127.0.0.1:17653';
  let pairing;
  async function token(force=false) {
    if(pairing)return pairing;
    if(!force){const stored=(await chrome.storage.local.get('biliLocalToken')).biliLocalToken;if(/^[A-Za-z0-9_-]{43}$/.test(stored || ''))return stored;}
    pairing=(async()=>{
      let response;
      try{response=await fetch(base+'/api/pair',{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','X-BiliSlop-Client':'extension'},body:'{}',signal:AbortSignal.timeout(5000)});}
      catch{throw new Error('无法连接本地检测程序，请先启动它；启动后会自动连接。');}
      const data=await response.json();
      if(!response.ok || !/^[A-Za-z0-9_-]{43}$/.test(data.token || ''))throw new Error('本地服务不支持自动连接，请更新并重新启动本地程序。');
      await chrome.storage.local.set({biliLocalToken:data.token});
      return data.token;
    })();
    try{return await pairing;}finally{pairing=null;}
  }
  async function request(path,options={}) {
    if(!/^\/api\//.test(path))throw new Error('无效的本机接口。');
    const send=async code=>{
      try{return await fetch(base+path,{...options,headers:{...options.headers,Authorization:'Bearer '+code},signal:AbortSignal.timeout(10000),redirect:'error'});}
      catch{throw new Error('无法连接本地检测程序，请先启动它；启动后会自动连接。');}
    };
    let response=await send(await token());
    if(response.status===401){
      const error=await response.clone().json().catch(()=>({}));
      if(error.code==='PAIRING_REQUIRED')response=await send(await token(true));
    }
    return response;
  }
  async function control(action){
    if(!['status','start','stop'].includes(action))throw new Error('不支持的服务操作。');
    try{const result=await chrome.runtime.sendNativeMessage('com.stoptheslop.bilibili',{action});if(!result?.ok)throw new Error(result?.error || '本机控制组件返回无效响应。');return {...result,installed:true};}
    catch(error){
      if(action!=='status')throw new Error('无法控制本机服务：'+error.message+'。请先运行安装本机组件，并重新加载新版扩展。');
      try{const r=await fetch(base+'/health',{signal:AbortSignal.timeout(1200)});const d=await r.json();if(r.ok&&d.app==='stop-the-slop-local')return {running:true,stopping:!!d.stopping,installed:false};if(r.status===404)return {running:true,legacy:true,installed:false};}catch{}
      return {running:false,installed:false};
    }
  }
  return {request,control};
})();
