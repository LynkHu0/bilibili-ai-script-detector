document.addEventListener('DOMContentLoaded',()=>{
 const select=document.querySelector('select[name=provider]');
 if(select){
  const sync=()=>{const deep=select.value==='deepseek';document.getElementById('chatgpt-options').hidden=deep;document.getElementById('deepseek-options').hidden=!deep;document.getElementById('chatgpt-login').hidden=deep;};
  select.addEventListener('change',sync);sync();
 }
 const thinking=document.querySelector('select[name=thinking]');
 if(thinking){const sync=()=>{document.getElementById('deepseek-effort-options').hidden=thinking.value!=='enabled';};thinking.addEventListener('change',sync);sync();}
 async function refresh(){
  try{
   const token=document.querySelector('meta[name="bili-local-token"]')?.content;if(!token)return;
   const r=await fetch('/api/usage',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error();
   BiliUsageView.render(await r.json());
  }catch{document.getElementById('usage-primary').textContent='用量暂时无法读取，请刷新重试。';}
 }
 refresh();setInterval(()=>{if(!document.hidden)refresh();},5000);
});
