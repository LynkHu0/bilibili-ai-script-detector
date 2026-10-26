export class ModelCatalog {
 constructor(){this.account=null;this.savedAt=0;this.models=[];this.error='';}
 async refresh(auth,force=false,fetcher=fetch){
  const account=auth.active();
  if(!account?.access_token){this.account=null;this.models=[];this.error='登录ChatGPT后可读取账户模型列表。';return;}
  const key=account.client_id+':'+account.subject;
  if(!force && key===this.account && Date.now()-this.savedAt<300000)return;
  this.account=key;this.models=[];this.savedAt=Date.now();
  try{
   const token=await auth.access();
   const r=await fetcher('https://api.openai.com/v1/models',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
   if(!r.ok)throw new Error('模型列表暂不可用');
   const data=await r.json();if(!Array.isArray(data.models))throw new Error('模型列表格式不符合预期');
   this.models=data.models.filter(m=>m.visibility==='list' && typeof m.slug==='string').map(m=>({slug:m.slug,name:typeof m.display_name==='string'?m.display_name:m.slug}));
   this.error=this.models.length?'':'账户未返回可显示的模型，可填写已知可用的模型ID。';
  }catch{this.error='模型列表读取失败；可保留当前模型，或填写账户可用的模型ID后测试。';}
 }
}
