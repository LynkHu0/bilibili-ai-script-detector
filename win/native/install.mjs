import {mkdir,cp,readFile,writeFile,chmod} from 'node:fs/promises';
import {spawnSync,spawn} from 'node:child_process';
import path from 'node:path';import os from 'node:os';import {fileURLToPath,pathToFileURL} from 'node:url';
import {EXTENSION_ID,HOST} from './identity.mjs';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(Number(process.versions.node.split('.')[0])<22)throw new Error('需要先安装 Node.js 22 或更新版本。');
const windows=process.platform==='win32';if(!windows&&process.platform!=='darwin')throw new Error('安装程序仅支持 Windows 和 macOS。');
const data=windows?path.join(process.env.LOCALAPPDATA,'BiliSlopData'):path.join(os.homedir(),'Library/Application Support/StopTheSlop');
const target=windows?path.join(process.env.LOCALAPPDATA,'BiliSlop'):path.join(data,'app');
await mkdir(target,{recursive:true,mode:0o700});await mkdir(data,{recursive:true,mode:0o700});
// Copy only application payload. Account data and dependency caches are never copied.
for(const name of ['extension','local-server','native']){
 const filter=p=>!['node_modules','.local-data','controller-config.json','.DS_Store'].includes(path.basename(p));
 if(path.resolve(source)!==path.resolve(target))await cp(path.join(source,name),path.join(target,name),{recursive:true,force:true,filter});
}
for(const name of ['VERSION','使用说明.md','PRIVACY.md','UPSTREAM.md'])try{await cp(path.join(source,name),path.join(target,name),{force:true});}catch{}
const native=path.join(target,'native');
const nodePath=process.argv[2] || process.execPath;
if(/[\r\n"]/.test(nodePath))throw new Error('Node.js 路径格式不受支持。');
await writeFile(path.join(native,'controller-config.json'),JSON.stringify({dataDir:data,nodePath})+'\n',{mode:0o600});
const hostPath=path.join(native,windows?'host.cmd':'host.sh');
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
if(windows)await writeFile(hostPath,`@echo off\r\n"${nodePath}" "%~dp0native-host.mjs" %*\r\n`);
else{await writeFile(hostPath,`#!/bin/sh\nexec ${quote(nodePath)} ${quote(path.join(native,'native-host.mjs'))} "$@"\n`);await chmod(hostPath,0o755);}
const manifest={name:HOST,description:'Stop the Slop local service control',path:hostPath,type:'stdio',allowed_origins:[`chrome-extension://${EXTENSION_ID}/`]};
if(windows){
 const file=path.join(native,'host-manifest.json');await writeFile(file,JSON.stringify(manifest,null,2));
 for(const browser of ['Google\\Chrome','Microsoft\\Edge']){const result=spawnSync('reg.exe',['ADD',`HKCU\\Software\\${browser}\\NativeMessagingHosts\\${HOST}`,'/ve','/t','REG_SZ','/d',file,'/f'],{windowsHide:true,encoding:'utf8'});if(result.status!==0)throw new Error('无法注册浏览器本机控制组件。');}
}else{
 for(const browser of ['Google/Chrome','Microsoft Edge','Chromium','Google/ChromeForTesting']){const dir=path.join(os.homedir(),'Library/Application Support',browser,'NativeMessagingHosts');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,HOST+'.json'),JSON.stringify(manifest,null,2));}
}
console.log('本机控制组件已安装。浏览器加载以下 extension 文件夹：\n'+path.join(target,'extension'));
console.log('如果已经加载旧版扩展，请先移除旧版，再从上面的路径加载新版。账号配置保留在本机服务数据目录。');
try{await readFile(path.join(target,'local-server/package.json'));const npm=spawnSync(windows?'npm.cmd':'npm',['ci','--omit=dev','--no-fund','--no-audit'],{cwd:path.join(target,'local-server'),stdio:'inherit',shell:windows,windowsHide:true});if(npm.status!==0)throw new Error('源码依赖安装失败。');}catch(e){if(e.code!=='ENOENT')throw e;}
const {start}=await import(pathToFileURL(path.join(native,'controller.mjs')).href);const result=await start();
console.log(result.running?'检测服务已在后台运行，可以关闭此安装窗口。':result.message || '请在插件中点击启动检测服务。');
const opener=windows?spawn('explorer.exe',[path.join(target,'extension')],{detached:true,stdio:'ignore',windowsHide:true}):spawn('open',[path.join(target,'extension')],{detached:true,stdio:'ignore'});opener.on('error',()=>{});opener.unref();
