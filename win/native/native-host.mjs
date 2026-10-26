import {control} from './controller.mjs';
import {EXTENSION_ID} from './identity.mjs';
const origin=process.argv.find(a=>a.startsWith('chrome-extension://'));
if(![`chrome-extension://${EXTENSION_ID}`,`chrome-extension://${EXTENSION_ID}/`].includes(origin)){process.exit(1);}
let buffer=Buffer.alloc(0),done=false;
function reply(value){const data=Buffer.from(JSON.stringify(value)),head=Buffer.alloc(4);head.writeUInt32LE(data.length);process.stdout.write(Buffer.concat([head,data]),()=>process.exit(0));}
const timer=setTimeout(()=>process.exit(1),15000);
process.stdin.on('data',chunk=>{
 if(done)return;buffer=Buffer.concat([buffer,chunk]);
 if(buffer.length<4)return;const length=buffer.readUInt32LE(0);
 if(length>16384){done=true;reply({ok:false,error:'控制消息过长。'});return;}
 if(buffer.length<length+4)return;done=true;clearTimeout(timer);process.stdin.pause();
 (async()=>{const m=JSON.parse(buffer.subarray(4,length+4).toString());return {ok:true,...await control(m.action)};})().then(reply,e=>reply({ok:false,error:e.message}));
});
process.stdin.on('error',()=>process.exit(1));
