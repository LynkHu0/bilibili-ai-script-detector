/* Shared presentation for the extension popup and local settings page. */
globalThis.BiliUsageView={
 render(data,doc=document){
  const get=id=>doc.getElementById(id),n=value=>Number(value || 0).toLocaleString('zh-CN');
  const today=data.today || {},five=data.recentFiveHours || {};
  const official=data.officialDeepseek;
  if(data.provider==='deepseek' && official){
   const symbol=official.currency==='CNY'?'¥':'$';
   get('usage-primary').textContent=`官方消费 ${symbol}${Number(official.cost).toFixed(2)} ${official.currency}`;
   get('usage-detail').textContent=`${official.apiKeyLabel} · ${official.periodLabel} · ${n(official.requests)} 次请求 · ${n(official.tokens)} tokens`;
   get('usage-notice').textContent=`官方页显示值，可能延迟5分钟。同步于 ${new Date(official.syncedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}；关闭官方页后不会自动刷新。`;
   get('usage-official').hidden=true;get('usage-deepseek').hidden=false;return;
  }
  if(data.provider==='deepseek'){
   const money=value=>Number(value || 0).toFixed(4);
   get('usage-primary').textContent=`本机今日记录 ${n(today.totalTokens)} tokens · ${!today.knownRequests && today.unknownRequests?'费用待确认':`预计 ¥${money(today.costMinCny)}–${money(today.costMaxCny)}`}`;
   get('usage-detail').textContent=`输入 ${n(today.inputTokens)} · 输出 ${n(today.outputTokens)} · ${n(today.requests)} 次请求（北京时间）`;
  }else{
   get('usage-primary').textContent='5小时套餐百分比：暂不可读取';
   get('usage-detail').textContent=`本工具最近5小时：${n(five.totalTokens)} tokens · ${n(five.requests)} 次请求`;
  }
  const since=data.trackingStartedAt?new Date(data.trackingStartedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
  const unknown=data.provider==='deepseek'?today.unknownRequests:five.unknownRequests;
  get('usage-notice').textContent=[since?`自 ${since} 开始记录。`:'',unknown?`另有 ${n(unknown)} 次请求未返回用量，统计可能不完整。`:'',data.persistenceError?'用量尚未保存到磁盘。':'',data.provider==='deepseek'?'费用按官方高峰/空闲价估算，仅含本机本工具记录。':'此token统计不能换算为套餐百分比，也不代表整个账户的用量。'].filter(Boolean).join(' ');
  get('usage-official').hidden=data.provider==='deepseek';
  get('usage-deepseek').hidden=data.provider!=='deepseek';
 }
};
