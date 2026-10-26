import {readFile,mkdir,stat,rm,open} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
let config={};try{config=JSON.parse(await readFile(path.join(here,'controller-config.json'),'utf8'));}catch{}
const root=path.resolve(here,'..');
export const dataDir=process.env.BILI_SLOP_DATA_DIR || config.dataDir || (process.platform==='win32'?path.join(process.env.LOCALAPPDATA || os.homedir(),'BiliSlopData'):path.join(os.homedir(),'Library/Application Support/StopTheSlop'));
const base=`http://127.0.0.1:${process.env.BILI_SLOP_PORT || 17653}`;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function status(){
 try{
  const response=await fetch(base+'/health',{signal:AbortSignal.timeout(1200)});
  const body=await response.json().catch(()=>null);
  if(response.ok && body?.app==='stop-the-slop-local')return {running:true,stopping:!!body.stopping,version:body.version};
  return {running:false,occupied:true,message:'旧版服务或其他程序占用了端口。请先关闭旧版终端，然后点击启动检测服务。'};
 }catch(e){
  if(e.name==='TimeoutError')return {running:false,occupied:true,message:'本机端口响应超时，请先检查旧版服务。'};
  return {running:false,stopping:false};
 }
}
export async function start(){
 let current=await status();if(current.running || current.occupied)return current;
 await mkdir(dataDir,{recursive:true,mode:0o700});
 const lock=path.join(dataDir,'service-start.lock');let owns=false;
 try{
  try{await mkdir(lock);owns=true;}catch(e){
   if(e.code!=='EEXIST')throw e;
   if(Date.now()-(await stat(lock)).mtimeMs>30000){await rm(lock,{recursive:true,force:true});await mkdir(lock);owns=true;}
   else{for(let i=0;i<40;i++){await delay(200);current=await status();if(current.running || current.occupied)return current;}throw new Error('服务正在启动，请稍后再试。');}
  }
  current=await status();if(current.running || current.occupied)return current;
  if(process.platform==='win32'){
   // WMI creates the hidden launcher outside the browser native-host job, so closing the popup cannot kill the service.
   const quote=s=>"'"+s.replaceAll("'","''")+"'";
   const command=`$env:BILI_SLOP_DATA_DIR=${quote(dataDir)}; $env:BILI_SLOP_PORT=${quote(process.env.BILI_SLOP_PORT || '17653')}; $env:BILI_SLOP_OPEN='0'; Start-Process -FilePath ${quote(config.nodePath || process.execPath)} -ArgumentList ${quote('"'+path.join(root,'local-server/server.mjs')+'"')} -WorkingDirectory ${quote(path.join(root,'local-server'))} -WindowStyle Hidden -RedirectStandardOutput ${quote(path.join(dataDir,'background-service.log'))} -RedirectStandardError ${quote(path.join(dataDir,'background-service-error.log'))}`;
   const executable=path.join(process.env.SystemRoot || 'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
   const launch='"'+executable+'" -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand '+Buffer.from(command,'utf16le').toString('base64');
   const outer=`$r=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=${quote(launch)}}; if($r.ReturnValue -ne 0){exit 1}`;
   const child=spawn(executable,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(outer,'utf16le').toString('base64')],{windowsHide:true,stdio:'ignore'});
   await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Windows 后台启动失败，请检查 PowerShell / WMI 是否可用。')));});
  }else{
   const log=await open(path.join(dataDir,'background-service.log'),'a',0o600);
   try{
    const child=spawn(config.nodePath || process.execPath,[path.join(root,'local-server/server.mjs')],{cwd:path.join(root,'local-server'),detached:true,stdio:['ignore',log.fd,log.fd],env:{...process.env,BILI_SLOP_DATA_DIR:dataDir,BILI_SLOP_OPEN:'0'}});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
   }finally{await log.close();}
  }
  for(let i=0;i<40;i++){await delay(200);current=await status();if(current.running || current.occupied)return current;}
  throw new Error('服务未能启动，请查看本机数据目录的 background-service.log。');
 }finally{if(owns)await rm(lock,{recursive:true,force:true});}
}
export async function stop(){
 const current=await status();if(!current.running || current.stopping)return current;
 let code;try{code=JSON.parse(await readFile(path.join(dataDir,'connection.json'),'utf8')).code;}catch{throw new Error('无法读取本机服务凭据，请重新运行本机组件安装程序。');}
 const response=await fetch(base+'/api/control/stop',{method:'POST',headers:{Authorization:'Bearer '+code,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(3000)});
 const result=await response.json();if(!response.ok)throw new Error(result.error || '服务停止失败。');
 await delay(200);return status();
}
export async function control(action){
 if(action==='status')return status();if(action==='start')return start();if(action==='stop')return stop();
 throw new Error('不支持的服务控制操作。');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{const result=await control(process.argv[2] || 'status');console.log(JSON.stringify(result));if(result.occupied)process.exitCode=1;}catch(e){console.error(e.message);process.exitCode=1;}
}
