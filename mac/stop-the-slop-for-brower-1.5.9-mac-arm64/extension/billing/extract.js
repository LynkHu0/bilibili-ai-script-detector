/* Reads only visible dashboard summary numbers and the two filter labels. */
globalThis.DeepSeekUsageExtract={
 fromValues({cost,requests,tokens,periodLabel,apiKeyLabel}){
  const num=text=>{const cleaned=String(text).replace(/[,，\s]/g,'');if(!/^\d+(?:\.\d+)?$/.test(cleaned))throw new Error('官方用量数字格式暂不支持。');return Number(cleaned);};
  const amount=String(cost).match(/(?:¥|￥|\$)\s*([\d,.]+)\s*(CNY|USD)/i);if(!amount)throw new Error('未找到官方消费金额。');
  const key=String(apiKeyLabel).replace(/^API\s*Key\s*/i,'').trim(),period=String(periodLabel).replace(/^时间维度\s*/,'').trim();
  if(!key || /全部|所有|all\s*(api|key)/i.test(key))throw new Error('请先筛选本工具的单个API Key。');
  if(!period)throw new Error('未取得官方账单时间范围。');
  const snapshot={sourceUrl:'https://platform.deepseek.com/usage',apiKeyLabel:key,periodLabel:period,currency:amount[2].toUpperCase(),cost:num(amount[1]),requests:num(requests),tokens:num(tokens)};
  if(!Number.isSafeInteger(snapshot.requests) || !Number.isSafeInteger(snapshot.tokens))throw new Error('请求次数或Tokens不是整数。');return snapshot;
 },
 read(doc=document){
  const visible=el=>el.getClientRects().length>0;
  const nodes=[...doc.querySelectorAll('span,div,p')];
  const text=(el)=>el.innerText || el.textContent || '';
  function card(label){
   const leaf=nodes.find(el=>visible(el) && el.children.length===0 && text(el).trim()===label);
   for(let el=leaf,i=0;el && i<5;el=el.parentElement,i++){
    const value=text(el).trim();if(value===label)continue;
    if(value.length>150)break;
    if(label==='消费金额' && /(?:¥|￥|\$)\s*[\d,.]+\s*(CNY|USD)/i.test(value))return value.replace(label,'').trim();
    if(label!=='消费金额'){const stripped=value.replace(label,'').trim();if(/^[\d,，\s]+$/.test(stripped) && stripped)return stripped;}
   }
   throw new Error(`暂未读取到“${label}”，请等待官方页面加载完成。`);
  }
  const buttons=[...doc.querySelectorAll('[role=button],button')].filter(visible);
  const period=buttons.find(el=>/^时间维度/.test(text(el).trim())),key=buttons.find(el=>/^API\s*Key\b/i.test(text(el).trim()));
  if(!period || !key)throw new Error('官方页筛选项未就绪。');
  return this.fromValues({cost:card('消费金额'),requests:card('API 请求次数'),tokens:card('Tokens'),periodLabel:text(period),apiKeyLabel:text(key)});
 }
};
