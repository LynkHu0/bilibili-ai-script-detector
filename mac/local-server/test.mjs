import http from 'node:http';
import {EXTENSION_ID} from '../native/identity.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,stat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {generateKeyPair,SignJWT,exportJWK,createLocalJWKSet} from 'jose';
import {Auth} from './auth.mjs';
import {requestBody,readResponseStream,validateResult} from './inference.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
// 临时目录放在项目内的 work/；测试首次运行时自动创建，避免依赖外部预先存在的目录。
const work=path.resolve(root,'../../work');
await mkdir(work,{recursive:true});
function stream(events,fragment=false){const b=new TextEncoder().encode(events.map(e=>'data: '+JSON.stringify(e)+'\r\n\r\n').join(''));return new ReadableStream({start(c){if(fragment)for(const x of b)c.enqueue(Uint8Array.of(x));else c.enqueue(b);c.close();}});}
test('uses exactly requested model/effort and only plan-compatible request fields',()=>{const b=requestBody('abc');assert.equal(b.model,'gpt-6-luna');assert.equal(b.reasoning.effort,'high');assert.equal(b.store,false);assert.equal(b.stream,true);assert.ok(Array.isArray(b.input));assert.equal(b.max_output_tokens,undefined);assert.match(b.instructions,/仅返回JSON对象/);assert.match(b.instructions,/不要输出解释/);});
test('requires successful terminal event; preserves fragmented Chinese and CRLF',async()=>{assert.equal(await readResponseStream(stream([{type:'response.output_text.delta',delta:'中文OK'},{type:'response.completed',response:{status:'completed'}}],true)),'中文OK');await assert.rejects(readResponseStream(stream([{type:'response.output_text.delta',delta:'partial'}])),/未收到完成事件/);await assert.rejects(readResponseStream(stream([{type:'response.failed',response:{error:{code:'subscription_sharing_usage_limit_exceeded'}}}])),/subscription_sharing_usage_limit_exceeded/);});
test('accepts score-only response and rejects invalid scores',()=>{
 const result=validateResult('{"score":0.8}');assert.equal(result.score,.8);assert.equal(result.summary,undefined);assert.equal(result.evidence,undefined);
 for(const score of [2,-1,null,'0.8'])assert.throws(()=>validateResult(JSON.stringify({score})),/评分无效/);
 assert.throws(()=>validateResult('{}'),/评分无效/);
 assert.equal(validateResult('```json\n{"score":0}\n```').score,0);
});
test('OAuth state/nonce/scope/identity validation and protected storage',async()=>{
 const dir=await mkdtemp(path.join(work,'slop-auth-test-'));const a=new Auth(dir,'http://127.0.0.1:17653');await a.init();
 const savedHost=a.data.hostId;const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='test';
 a.config={issuer:'https://auth.openai.com'};a.jwks=createLocalJWKSet({keys:[jwk]});
 let nonce,subject='user-a',scope='chatgpt.tokens.use.direct';
 a.token=async()=>({access_token:'TEST_ONLY',refresh_token:'TEST_ONLY',expires_in:3600,scope,id_token:await new SignJWT({nonce,email:'test@example.invalid'}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('https://auth.openai.com').setAudience('oaiapp_test').setSubject(subject).setIssuedAt().setExpirationTime('1h').sign(privateKey)});
 async function callback(selected,wrongNonce=false){const login=new URL(await a.begin(selected));assert.equal(login.searchParams.get('ext_agent_host_id'),savedHost);assert.equal(login.searchParams.get('code_challenge_method'),'S256');nonce=wrongNonce?'wrong':login.searchParams.get('nonce');return new URL('http://127.0.0.1:17653/auth/callback?'+new URLSearchParams({code:'TEST_CODE',state:login.searchParams.get('state'),client_id:'oaiapp_test'}));}
 try{
  await assert.rejects(a.finish(new URL('http://127.0.0.1/auth/callback?state=bad')),/登录状态无效/);
  await assert.rejects(a.finish(await callback(null,true)),/登录身份验证失败/);
  scope='openid';await assert.rejects(a.finish(await callback()),/未授予/);
  scope='chatgpt.tokens.use.direct';const cb=await callback();await a.finish(cb);assert.equal(a.active().subject,'user-a');await assert.rejects(a.finish(cb),/登录状态无效/);
  const login=new URL(await a.begin('oaiapp_test'));assert.equal(login.searchParams.get('client_id'),'oaiapp_test');assert.equal(login.searchParams.get('agent_name_hint'),null);
  subject='user-b';await assert.rejects(a.finish(await callback('oaiapp_test')),/身份验证失败/);assert.equal(a.active().subject,'user-a');
  assert.equal((await stat(path.join(dir,'accounts.json'))).mode&0o777,0o600);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('plugin settings stay authenticated and never expose saved credentials',async()=>{
 const dir=await mkdtemp(path.join(work,'slop-server-test-'));const port=18654;
 const child=spawn(process.execPath,[path.join(root,'server.mjs')],{env:{...process.env,BILI_SLOP_PORT:String(port),BILI_SLOP_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('startup timeout')),10000);child.stdout.once('data',()=>{clearTimeout(t);resolve();});child.once('exit',()=>{clearTimeout(t);reject(new Error('server exited'));});});
  const base='http://127.0.0.1:'+port,extensionOrigin='chrome-extension://'+EXTENSION_ID;
  assert.equal((await fetch(base+'/api/settings')).status,401);
  assert.equal((await fetch(base+'/api/pair',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json','X-BiliSlop-Client':'extension'},body:'{}'})).status,403);
  const pair=await fetch(base+'/api/pair',{method:'POST',headers:{Origin:extensionOrigin,'Content-Type':'application/json','X-BiliSlop-Client':'extension'},body:'{}'});assert.equal(pair.status,200);const code=(await pair.json()).token;
  const headers={Authorization:'Bearer '+code,Origin:extensionOrigin,'Content-Type':'application/json'};
  const landing=await fetch(base);const html=await landing.text();assert.match(html,/设置已迁移到浏览器插件/);assert.doesNotMatch(html,/本机连接码|检查当前检测服务|浏览器插件自动连接|type="password"/);
  const status=await(await fetch(base+'/api/status',{headers})).json();assert.equal(status.connected,false);
  assert.equal((await fetch(base+'/api/settings',{headers:{...headers,Origin:'https://evil.example'}})).status,403);
  const hostile=await new Promise((resolve,reject)=>{http.get(base+'/api/settings',{headers:{...headers,Host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});assert.equal(hostile,403);
  const initial=await(await fetch(base+'/api/settings',{headers})).json();assert.equal(initial.config.chatgptModel,'gpt-6-luna');assert.equal(initial.config.apiKeySet,false);assert.deepEqual(initial.accounts,[]);
  const secret='test-only-secret-1234';
  const save=await fetch(base+'/api/settings',{method:'POST',headers,body:JSON.stringify({provider:'deepseek',model:'deepseek-flash',thinking:'disabled',apiKey:secret,maxConcurrent:7})});assert.equal(save.status,200);const text=await save.text();assert.equal(text.includes(secret),false);assert.equal(JSON.parse(text).config.apiKeySet,true);assert.equal(JSON.parse(text).status.maxConcurrent,7);
  const again=await(await fetch(base+'/api/settings',{headers})).text();assert.equal(again.includes(secret),false);
  const invalid=await fetch(base+'/api/settings',{method:'POST',headers,body:JSON.stringify({provider:'deepseek',maxConcurrent:101})});assert.equal(invalid.status,400);
  const back=await fetch(base+'/api/settings',{method:'POST',headers,body:JSON.stringify({provider:'chatgpt',clearKey:'yes',chatgptModel:'gpt-6-sol',chatgptEffort:'low'})});assert.equal(back.status,200);const config=await back.json();assert.equal(config.config.apiKeySet,false);assert.equal(config.config.chatgptModel,'gpt-6-sol');assert.equal(config.config.chatgptEffort,'low');
  const launch=await(await fetch(base+'/api/auth/start',{method:'POST',headers,body:'{}'})).json();const loginUrl=new URL(launch.launchUrl);assert.equal(loginUrl.origin,base);assert.equal(loginUrl.pathname,'/auth/launch');assert.ok(loginUrl.searchParams.get('ticket'));assert.equal(JSON.stringify(launch).includes('access_token'),false);
  assert.equal((await fetch(base+'/auth/launch?ticket=bad')).status,400);
  assert.equal((await fetch(base+'/api/accounts/switch',{method:'POST',headers,body:JSON.stringify({account:'unknown'})})).status,400);
  assert.equal((await fetch(base+'/api/auth/logout',{method:'POST',headers,body:'{}'})).status,200);
  assert.equal((await fetch(base+'/test',{method:'POST'})).status,404);
 }finally{child.kill();await new Promise(r=>child.once('exit',r));await rm(dir,{recursive:true,force:true});}
});

test('custom ChatGPT model/effort reaches request, auto omits reasoning',()=>{
 const body=requestBody('字幕',{model:'gpt-6.1-sol',effort:'low'});assert.equal(body.model,'gpt-6.1-sol');assert.equal(body.reasoning.effort,'low');
 const auto=requestBody('字幕',{model:'gpt-6-luna',effort:'auto'});assert.equal(auto.reasoning,undefined);assert.equal(auto.store,false);assert.equal(auto.stream,true);
});
