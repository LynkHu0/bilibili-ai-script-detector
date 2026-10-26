/* Unofficial Bilibili adapter for MauroPello/stop-the-slop. */
globalThis.BiliSlop = {
  PROMPT_VERSION: 'zh-score-v4',
  parse(value) {
    try {
      const u = new URL(value, 'https://www.bilibili.com');
      if (!['www.bilibili.com', 'm.bilibili.com', 'search.bilibili.com'].includes(u.hostname)) return null;
      const bvid = u.pathname.match(/\/video\/(BV[a-zA-Z0-9]{10})(?:\/|$)/)?.[1];
      const p = Number(u.searchParams.get('p') || 1);
      return bvid && Number.isSafeInteger(p) && p > 0 ? { bvid, p } : null;
    } catch { return null; }
  },
  async analyze(url,onProgress=()=>{}) {
    let response=await chrome.runtime.sendMessage({type:'BILI_START',url});
    const began=Date.now();
    while(response && !['completed','failed'].includes(response.status) && !response.error){
      if(Date.now()-began>3600000)throw new Error('等待检测超时，请稍后查看。');
      onProgress(response);
      await new Promise(resolve=>setTimeout(resolve,500));
      response=await chrome.runtime.sendMessage({type:'BILI_TASK',url});
    }
    if(response?.error || response?.status==='failed'){
      const error=new Error(response.error || '检测失败。');error.code=response.code;throw error;
    }
    if(!response?.result)throw new Error('检测结果缺失，请重试。');
    return response.result;
  },
  validScore(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1; },
  label(score) { return score > .7 ? '疑似 AI 文案' : score < .4 ? 'AI 特征较少' : '文案来源不确定'; },
  async json(url) {
    const r = await fetch(url, { credentials: 'include', signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`字幕请求失败（${r.status}）`);
    const data = await r.json();
    if (typeof data.code === 'number' && data.code !== 0) throw new Error(`B站：${data.message || data.code}`);
    return data;
  }
};
