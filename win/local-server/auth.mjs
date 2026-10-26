import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,rename,mkdir,chmod} from 'node:fs/promises';
import path from 'node:path';
import {createRemoteJWKSet,jwtVerify} from 'jose';
export const RESOURCE='https://api.openai.com/v1';
const AUTH='https://auth.openai.com';
const scopes='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const random=()=>randomBytes(32).toString('base64url');
export async function savePrivate(file,data){
  await mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+randomUUID()+'.tmp';
  await writeFile(tmp,JSON.stringify(data),{mode:0o600});await rename(tmp,file);await chmod(file,0o600);
}
export class Auth {
  constructor(dir,origin){this.dir=dir;this.origin=origin;this.pending=new Map();this.data={accounts:[]};}
  async init(){
    try{this.data=JSON.parse(await readFile(path.join(this.dir,'accounts.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    this.data.hostId ||= 'urn:uuid:'+randomUUID();
    await this.save();
  }
  save(){return savePrivate(path.join(this.dir,'accounts.json'),this.data);}
  active(){return this.data.accounts.find(x=>x.client_id===this.data.active);}
  async discovery(){
    if(!this.config){
      const r=await fetch(AUTH+'/.well-known/openid-configuration',{signal:AbortSignal.timeout(20000)});
      if(!r.ok)throw new Error('无法连接OpenAI登录服务。');
      const config=await r.json();
      if(config.issuer!==AUTH || !config.jwks_uri?.startsWith(AUTH+'/'))throw new Error('登录服务配置不符合预期。');
      this.config=config;this.jwks=createRemoteJWKSet(new URL(config.jwks_uri));
    }return this.config;
  }
  async begin(selected){
    await this.discovery();
    const account=this.data.accounts.find(x=>x.client_id===selected);
    const txn={state:random(),nonce:random(),verifier:random(),expires:Date.now()+600000,account,redirect:this.origin+'/auth/callback'};
    this.pending.clear();this.pending.set(txn.state,txn);
    const params={client_id:account?.client_id || 'dynamic_agent_client',ext_agent_host_id:this.data.hostId,response_type:'code',redirect_uri:txn.redirect,scope:scopes,resource:RESOURCE,state:txn.state,nonce:txn.nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(txn.verifier).digest('base64url')};
    if(!account)params.agent_name_hint='Stop the Slop Bilibili';
    if(account?.id_token)params.id_token_hint=account.id_token;
    return AUTH+'/api/accounts/authorize?'+new URLSearchParams(params);
  }
  async token(params){
    const r=await fetch(AUTH+'/api/accounts/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...params,resource:RESOURCE}),signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw new Error(`ChatGPT授权失败（${r.status}），请重新登录。`);
    const t=await r.json();
    if(typeof t.access_token!=='string' || !Number.isFinite(t.expires_in) || t.expires_in<=0)throw new Error('OpenAI返回的凭据不完整。');
    return t;
  }
  async finish(url){
    const state=url.searchParams.get('state');const txn=this.pending.get(state);this.pending.delete(state);
    if(!txn || txn.expires<Date.now())throw new Error('登录状态无效或已过期，请重新登录。');
    if(url.searchParams.has('error'))throw new Error('登录授权未完成。');
    const supplied=url.searchParams.get('client_id');
    const client=supplied || txn.account?.client_id;
    if(!client || client==='dynamic_agent_client' || (txn.account && client!==txn.account.client_id))throw new Error('登录注册信息不匹配。');
    const code=url.searchParams.get('code');if(!code)throw new Error('未收到授权码。');
    const t=await this.token({grant_type:'authorization_code',client_id:client,code,code_verifier:txn.verifier,redirect_uri:txn.redirect});
    await this.discovery();
    const {payload}=await jwtVerify(t.id_token,this.jwks,{issuer:AUTH,audience:client,requiredClaims:['sub','exp','iat'],clockTolerance:5});
    if(payload.nonce!==txn.nonce || !payload.sub || (txn.account && payload.sub!==txn.account.subject))throw new Error('登录身份验证失败。');
    if(!(t.scope || '').split(' ').includes('chatgpt.tokens.use.direct'))throw new Error('未授予ChatGPT套餐使用权限，请重新登录并启用套餐授权。');
    const account={...t,subject:payload.sub,email:payload.email || '',client_id:client,expires_at:Date.now()+t.expires_in*1000};
    this.data.accounts=this.data.accounts.filter(a=>a.client_id!==client);this.data.accounts.push(account);this.data.active=client;await this.save();
  }
  async access(){
    const a=this.active();if(!a?.access_token)throw new Error('请先在本地设置页面登录ChatGPT。');
    if(a.expires_at>Date.now()+60000)return a.access_token;
    if(!this.refreshing)this.refreshing=this.refresh(a).finally(()=>{this.refreshing=null;});
    await this.refreshing;return this.active().access_token;
  }
  async refresh(a){
    if(!a.refresh_token)throw new Error('登录已过期，请重新登录。');
    const t=await this.token({grant_type:'refresh_token',client_id:a.client_id,refresh_token:a.refresh_token});
    const granted=t.scope ?? a.scope;
    if(!(granted || '').split(' ').includes('chatgpt.tokens.use.direct'))throw new Error('套餐使用权限已失效。');
    Object.assign(a,t,{scope:granted,expires_at:Date.now()+t.expires_in*1000});await this.save();
  }
  async logout(){
    if(this.refreshing)await this.refreshing.catch(()=>{});
    const a=this.active();if(!a)return true;let revoked=false;
    try{
      const c=await this.discovery();
      if(c.revocation_endpoint && a.refresh_token){
        const u=new URL(c.revocation_endpoint);if(u.origin!==AUTH)throw new Error('invalid revocation URL');
        for(let i=0;i<2;i++){
          const r=await fetch(u,{method:'POST',body:new URLSearchParams({token:a.refresh_token,token_type_hint:'refresh_token',client_id:a.client_id}),signal:AbortSignal.timeout(15000)});
          if(r.status===200){revoked=true;break;}if(r.status<500)break;
          await new Promise(resolve=>setTimeout(resolve,500));
        }
      }
    }catch{}
    for(const key of ['access_token','refresh_token','id_token'])delete a[key];await this.save();return revoked;
  }
}
