// Open the report once per video in the focused tab, including SPA navigation.
const reportPages=new Map(),reportPending=new Map();
async function maybeOpenReport(id, candidate){
 const parsed=BiliSlop.parse(candidate || '');
 if(!parsed){reportPages.delete(id);return;}
 const key=parsed.bvid+':'+parsed.p;
 if(reportPages.get(id)===key || reportPending.get(id)===key)return;
 reportPending.set(id,key);
 try{
  const setting=await chrome.storage.local.get('biliAutoReport');if(setting.biliAutoReport===false)return;
  const current=await chrome.tabs.get(id),now=BiliSlop.parse(current.url || '');
  if(!current.active || !now || now.bvid+':'+now.p!==key)return;
  const win=await chrome.windows.get(current.windowId);if(!win.focused || !chrome.action.openPopup)return;
  await chrome.action.openPopup({windowId:current.windowId});reportPages.set(id,key);
 }catch{}finally{if(reportPending.get(id)===key)reportPending.delete(id);}
}
chrome.tabs.onUpdated.addListener((id,change,tab)=>{
 if(typeof change.url==='string' || change.status==='complete')maybeOpenReport(id,change.url || tab.url);
});
chrome.tabs.onActivated.addListener(info=>{chrome.tabs.get(info.tabId).then(tab=>maybeOpenReport(info.tabId,tab.url)).catch(()=>{});});
chrome.tabs.onRemoved.addListener(id=>{reportPages.delete(id);reportPending.delete(id);});
