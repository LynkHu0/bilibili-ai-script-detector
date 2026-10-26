(() => {
  // 视频卡片自动检测：卡片进入可视区域（含下方预加载区）后加入客户端队列；
  // 服务端状态提供全局模型请求并发上限，多个标签页共用该上限。
  const AUTO_DELAY = 600;
  const SERVICE_PAUSE_MS = 60000;
  const TRANSIENT_RETRY_MS = 8000;

  const cards = new WeakMap();
  const live = new Set();
  const pending = [];
  const state = {auto:true, token:'', active:0, maxConcurrent:1, pausedUntil:0, resumeTimer:null};

  const style=document.createElement('style');
  style.textContent='.bili-slop-check{position:absolute;top:5px;left:5px;z-index:12;border:0;border-radius:5px;padding:5px 7px;background:#242737eb;color:white;font:12px system-ui;cursor:pointer}.bili-slop-check:disabled{opacity:.72;cursor:default}';
  document.head.append(style);

  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      const record = cards.get(entry.target);
      if (!record || record.stale) continue;
      record.visible = entry.isIntersecting;
      if (entry.isIntersecting) scheduleAuto(record);
    }
  }, {rootMargin:'200px 0px', threshold:0}) : null;

  function paint(button,result){
    button.textContent=`${Math.round(result.score*100)}%`;
    button.style.background=result.score>.7?'#a9233aeb':result.score<.4?'#17624deb':'#795b19eb';
    button.title=`${result.provider==='deepseek'?'DeepSeek API':'ChatGPT 套餐'} · ${result.engine || 'gpt-6-luna'} · 本机已检测结果；启发式评分，不能证明创作来源`;
  }
  function errorLabel(error){
    if(error.code==='NO_SUBTITLES')return '无文案';
    if(/队列已满/.test(error.message))return '队列已满 · 稍后再试';
    if(/字幕不足/.test(error.message))return '字幕太短 · 无法检测';
    if(/连接码|登录ChatGPT|本地检测程序|本地程序/.test(error.message))return '请连接检测服务';
    if(/context invalidated|Receiving end does not exist|message port closed/i.test(error.message))return '请刷新此页面';
    return '检测失败 · 重试';
  }
  function serviceDown(error){
    return /连接码|登录ChatGPT|本地检测程序|本地程序|请在本地设置|请先打开本地/.test(error.message || '');
  }
  function transient(error){
    return /队列已满|请求失败|超时|任务查询失败|检测未完成|Failed to fetch|NetworkError/.test(error.message || '');
  }

  function alive(record){
    if(record.stale || cards.get(record.anchor)!==record)return false;
    const video=BiliSlop.parse(record.anchor.href);
    return !!video && `${video.bvid}:${video.p}`===record.identity;
  }
  function label(record,text,title){
    if(!alive(record))return;
    record.button.textContent=text;record.button.title=title || '';
  }
  function clearTimer(record){
    if(record.timer){clearTimeout(record.timer);record.timer=null;}
  }

  function scheduleAuto(record){
    if(!alive(record) || record.state!=='idle')return;
    if(!state.auto || !state.token || !record.visible || Date.now()<state.pausedUntil)return;
    clearTimer(record);
    record.timer=setTimeout(()=>{
      record.timer=null;
      if(!alive(record) || record.state!=='idle')return;
      enqueue(record,false);
    },AUTO_DELAY);
  }

  async function refreshConcurrency(){
    try{
      const response=await chrome.runtime.sendMessage({type:'BILI_CONFIG'});
      if(Number.isInteger(response?.maxConcurrent)&&response.maxConcurrent>=1&&response.maxConcurrent<=100){
        state.maxConcurrent=response.maxConcurrent;
        drain();
      }
    }catch{}
  }

  function enqueue(record,manual){
    if(!alive(record) || record.state!=='idle')return;
    if(!manual && (!state.auto || !state.token || Date.now()<state.pausedUntil))return;
    record.manual=manual;
    record.state='queued';
    if(manual)pending.unshift(record);else pending.push(record);
    label(record,'等待检测…',manual?'正在读取视频信息和字幕':'已加入自动检测队列');
    drain();
  }

  function drain(){
    while(state.active<state.maxConcurrent && pending.length){
      const record=pending.shift();
      if(!alive(record) || record.state!=='queued')continue;
      state.active++;
      const task=run(record);
      record.task=task;
      task.finally(()=>{state.active--;drain();});
    }
  }

  async function run(record){
    record.state='running';
    if(alive(record)){record.button.disabled=true;label(record,'读取字幕…','正在读取视频信息和字幕');}
    try{
      const result=await BiliSlop.analyze(record.anchor.href,progress=>{
        if(!alive(record))return;
        record.button.textContent=progress.status==='queued'?`排队中 · 前方 ${progress.queuePosition || 1} 个` : progress.status==='preparing'?'读取字幕…':'检测中…';
        record.button.title=progress.status==='queued'?'将自动检测，无需重试':'检测完成后会自动显示结果';
      });
      if(!alive(record)){record.state='stale';return;}
      paint(record.button,result);
      record.state='done';
    }catch(error){
      record.manual=false;
      if(!alive(record)){record.state='stale';return;}
      record.state='error';
      record.serviceError=serviceDown(error);
      label(record,errorLabel(error),error.message);
      if(record.serviceError){
        pauseAuto();
      }else if(!record.autoRetried && transient(error)){
        // 一次性自动重试：覆盖本地服务刚重启、短暂网络波动等情况。
        record.autoRetried=true;
        clearTimer(record);
        label(record,`${errorLabel(error)} · 稍后自动重试`,error.message);
        record.state='idle';
        record.timer=setTimeout(()=>{
          record.timer=null;
          if(!alive(record) || record.state!=='idle' || !record.visible)return;
          enqueue(record,false);
        },TRANSIENT_RETRY_MS);
      }
    }finally{
      if(alive(record))record.button.disabled=false;
      record.manual=false;
    }
  }

  function pauseAuto(){
    state.pausedUntil=Date.now()+SERVICE_PAUSE_MS;
    for(let i=pending.length-1;i>=0;i--){
      const record=pending[i];
      if(record.manual)continue;
      pending.splice(i,1);
      if(alive(record) && record.state==='queued'){
        record.state='idle';
        label(record,'请连接检测服务','本地检测程序未启动或连接码失效；恢复后会自动继续');
      }
    }
    if(state.resumeTimer)clearTimeout(state.resumeTimer);
    state.resumeTimer=setTimeout(()=>{state.resumeTimer=null;state.pausedUntil=0;resumeVisible();},SERVICE_PAUSE_MS);
  }

  function resumeVisible(){
    for(const record of live){
      if(!alive(record) || !record.visible)continue;
      if(record.state==='idle')scheduleAuto(record);
      else if(record.state==='error' && record.serviceError){
        record.serviceError=false;
        record.state='idle';
        scheduleAuto(record);
      }
    }
  }

  function cancelAuto(){
    for(let i=pending.length-1;i>=0;i--){
      const record=pending[i];
      if(record.manual)continue;
      pending.splice(i,1);
      if(alive(record) && record.state==='queued'){
        record.state='idle';
        label(record,'检测文案','自动检测已关闭，点击手动检测');
      }
    }
    for(const record of live)clearTimer(record);
  }

  function resetCards(){
    for(const record of live){clearTimer(record);record.stale=true;observer?.unobserve(record.anchor);}
    live.clear();pending.length=0;
    scan();
  }

  function scan(){
    for(const record of live){
      if(record.anchor.isConnected===false){clearTimer(record);observer?.unobserve(record.anchor);live.delete(record);cards.delete(record.anchor);}
    }
    document.querySelectorAll('a[href*="/video/BV"]').forEach(a=>{
      if(!a.querySelector('img,picture,video'))return;
      const video=BiliSlop.parse(a.href);if(!video)return;
      const identity=`${video.bvid}:${video.p}`;
      const previous=cards.get(a);
      if(previous && !previous.stale && previous.identity===identity)return;
      if(previous){clearTimer(previous);previous.stale=true;observer?.unobserve(previous.anchor);live.delete(previous);}
      if(previous?.button)previous.button.remove();
      if(getComputedStyle(a).position==='static')a.style.position='relative';
      const button=document.createElement('button');button.className='bili-slop-check';button.type='button';button.textContent='检测文案';
      button.title=state.auto?'自动检测已开启：卡片进入可视区域后自动检测，也可点击立即检测':'点击检测文案';
      const record={anchor:a,identity,button,state:'idle',visible:!observer,timer:null,manual:false,autoRetried:false,serviceError:false,stale:false};
      cards.set(a,record);live.add(record);a.append(button);observer?.observe(a);
      const key=`bili_card_plan_${video.bvid}_${video.p}`;
      chrome.storage.local.get([key,'biliProviderIdentity']).then(stored=>{
        if(!alive(record))return;
        const cached=stored?.[key];
        if(cached && cached.promptVersion===BiliSlop.PROMPT_VERSION && (!stored.biliProviderIdentity || cached.cacheIdentity===stored.biliProviderIdentity) && BiliSlop.validScore(cached.score)){
          record.state='done';
          paint(button,cached);
        }
      }).catch(()=>{});
      button.onclick=async e=>{
        e.preventDefault();e.stopPropagation();
        clearTimer(record);
        if(!alive(record))return;
        if(record.state==='done' || record.state==='error')record.state='idle';
        if(record.state!=='idle')return;
        enqueue(record,true);
        // 等待本次检测结束，便于调用方（弹窗/测试）读取最终状态。
        if(record.task)await record.task.catch(()=>{});
      };
    });
  }

  chrome.storage.local.get(['biliAutoDetect','biliLocalToken']).then(async settings=>{
    state.auto=settings?.biliAutoDetect!==false;
    state.token=typeof settings?.biliLocalToken==='string'?settings.biliLocalToken:'';
    if(state.token)await refreshConcurrency();
    resumeVisible();
  }).catch(()=>{});
  if(typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.token)refreshConcurrency();});

  let timer;
  new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(scan,250);}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['href']});
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local')return;
    if(changes.biliAutoDetect){
      state.auto=changes.biliAutoDetect.newValue!==false;
      if(state.auto)resumeVisible();else cancelAuto();
    }
    if(changes.biliLocalToken){
      state.token=typeof changes.biliLocalToken.newValue==='string'?changes.biliLocalToken.newValue:'';
      if(state.token){resumeVisible();refreshConcurrency().finally(resumeVisible);}
      else state.maxConcurrent=1;
    }
    if(changes.biliProviderIdentity){resetCards();return;}
    for(const record of live){
      if(!alive(record))continue;
      const video=BiliSlop.parse(record.anchor.href);
      const updated=video && changes[`bili_card_plan_${video.bvid}_${video.p}`]?.newValue;
      if(updated && updated.promptVersion===BiliSlop.PROMPT_VERSION && BiliSlop.validScore(updated.score)){record.state='done';paint(record.button,updated);}
    }
  });
  scan();
})();
