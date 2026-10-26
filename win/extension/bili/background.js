const biliJobs = new Map();
function ensureBiliJob(parsed,retryFailed=true){
 const key=`${parsed.bvid}:${parsed.p}`;
 let task=biliJobs.get(key);
 if(!task || (retryFailed && ['failed','completed'].includes(task.status))){
  if(biliJobs.size>=200)for(const [k,v] of biliJobs){if(['completed','failed'].includes(v.status)){biliJobs.delete(k);break;}}
  task={status:'preparing'};biliJobs.set(key,task);
  task.promise=Promise.resolve().then(()=>biliAnalyze(parsed,progress=>Object.assign(task,progress))).then(result=>{task.status='completed';task.result=result;return result;},e=>{task.status='failed';task.error=e.message;task.code=e.code;throw e;});
  task.promise.catch(()=>{});
 }
 return {key,task};
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
 if(m?.type==='BILI_CONFIG'){
  (async()=>{
   const response=await BiliLocal.request('/api/status');
   if(!response.ok)return {maxConcurrent:1};
   const status=await response.json();
   return {maxConcurrent:status.connected&&Number.isInteger(status.maxConcurrent)&&status.maxConcurrent>=1&&status.maxConcurrent<=100?status.maxConcurrent:1};
  })().then(reply,()=>reply({maxConcurrent:1}));
  return true;
 }
 if(!['BILI_START','BILI_TASK','BILI_ANALYZE'].includes(m.type))return false;
 const parsed=BiliSlop.parse(m.url);
 if(!parsed){reply({error:'无效的B站视频链接'});return false;}
 const {key,task}=ensureBiliJob(parsed,m.type!=='BILI_TASK');
 if(m.type==='BILI_ANALYZE'){
  task.promise.then(result=>reply({result})).catch(e=>reply({error:e.message,code:e.code}));return true;
 }
 reply({taskId:key,status:task.status,queuePosition:task.queuePosition || 0,...(task.result?{result:task.result}:{}),...(task.error?{error:task.error,code:task.code}:{})});
 return false;
});
async function biliAnalyze({bvid,p},progress=()=>{}) {
  const base = 'http://127.0.0.1:17653';
  let health;
  try {
    const response = await BiliLocal.request('/api/status');
    health = await response.json();
    if (!response.ok) throw new Error(health.error || '本地程序连接失败。');
  } catch(e) { throw new Error(e.message.includes('fetch') ? '无法连接本地检测程序，请先启动它。' : e.message); }
  if (!health.connected) throw new Error(health.provider==='deepseek'?'请在本地设置中填写DeepSeek API Key。':'请先在本地设置页面登录ChatGPT。');
  const active=(await chrome.storage.local.get('biliProviderIdentity')).biliProviderIdentity;
  if(active!==health.cacheIdentity)await chrome.storage.local.set({biliProviderIdentity:health.cacheIdentity});
  const view = await BiliSlop.json(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
  const page = view.data?.pages?.[p-1];
  if (!page?.cid) throw new Error('未找到该分P。');
  const videoId = `bili:${bvid}:${page.cid}`;
  const key = `bili_result_${health.cacheIdentity}_${health.model}_${health.effort}_${health.promptVersion}_${videoId}`;
  const stored = (await chrome.storage.local.get(key))[key];
  if (stored && BiliSlop.validScore(stored.score)) return stored;
  const player = await BiliSlop.json(`https://api.bilibili.com/x/player/wbi/v2?bvid=${bvid}&cid=${page.cid}`);
  const tracks = player.data?.subtitle?.subtitles || [];
  const track = tracks.find(t => /^(ai-)?zh/.test(t.lan)) || tracks[0];
  if (!track?.subtitle_url) {const e=new Error('B站未返回可用字幕；此视频暂时无法检测。');e.code='NO_SUBTITLES';throw e;}
  const url = new URL(track.subtitle_url, 'https://www.bilibili.com');
  if (url.protocol !== 'https:' || !/(^|\.)(hdslb\.com|bilibili\.com)$/.test(url.hostname)) throw new Error('字幕地址域名不受支持。');
  const captions = await BiliSlop.json(url.href);
  const transcript = (captions.body || []).map(s => s.content || '').join('\n').trim();
  if (transcript.length < 50) throw new Error('字幕不足50字，暂不检测。');
  const response = await BiliLocal.request('/api/jobs', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({videoId, transcript}), signal:AbortSignal.timeout(10000)
  });
  let job = await response.json();
  if (!response.ok) throw new Error(job.error || `检测服务错误 ${response.status}`);
  const started = Date.now();
  while (['running','queued'].includes(job.status)) {
    progress({status:job.status,queuePosition:job.queuePosition || 0});
    if (Date.now()-started > 3600000) throw new Error('队列等待超过一小时，请稍后重新查看结果。');
    if (!/^[A-Za-z0-9_-]{32}$/.test(job.jobId || '')) throw new Error('检测任务编号无效。');
    const jobId=job.jobId;
    await new Promise(resolve=>setTimeout(resolve,job.status==='queued'?1000:300));
    const poll=await BiliLocal.request(`/api/jobs/${jobId}`);
    job={...(await poll.json()),jobId};
    if (!poll.ok) throw new Error(job.error || '任务查询失败。');
  }
  if (job.status !== 'completed') throw new Error(job.error || '检测未完成。');
  const result = job.result;
  if (!BiliSlop.validScore(result.score)) throw new Error('检测服务未返回有效评分。');
  if (result.engine !== health.model || result.effort !== health.effort || result.cacheIdentity !== health.cacheIdentity) throw new Error('检测结果的模型或登录账户与请求不一致。');
  const record = {...result, bvid, p, cid:page.cid, title:view.data.title, backend:base};
  await chrome.storage.local.set({[key]:record, [`bili_card_plan_${bvid}_${p}`]:record});
  return record;
}
