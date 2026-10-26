import {randomBytes} from 'node:crypto';
// Bounded FIFO: keep active work, deduplicate retries, isolate accounts.
export class AnalysisQueue {
 constructor({limit=100,retain=200,concurrency=1}={}){this.limit=limit;this.retain=retain;this.concurrency=concurrency;this.jobs=new Map();this.byKey=new Map();this.waiting=[];this.active=new Set();}
 get busy(){return this.active.size>0 || this.waiting.length>0;}
 setConcurrency(value){if(!Number.isInteger(value)||value<1||value>100)throw new Error('并发任务数必须为1到100的整数。');this.concurrency=value;this.drain();}
 snapshot(id){const j=this.jobs.get(id);if(!j)return null;return {jobId:id,status:j.status,queuePosition:j.status==='queued'?this.waiting.indexOf(id)+1:0,...(j.result?{result:j.result}:{}),...(j.error?{error:j.error}:{}),account:j.account};}
 enqueue(key,account,run){
  const prior=this.byKey.get(key);if(prior && this.jobs.get(prior)?.status!=='failed')return this.snapshot(prior);
  if(this.waiting.length+this.active.size>=this.limit)throw new Error('检测队列已满，请等待已提交的视频完成后再试。');
  for(const [id,j] of this.jobs){if(this.jobs.size<this.retain)break;if(['completed','failed'].includes(j.status)){this.jobs.delete(id);if(this.byKey.get(j.key)===id)this.byKey.delete(j.key);}}
  const id=randomBytes(24).toString('base64url');this.jobs.set(id,{key,account,run,status:'queued'});this.byKey.set(key,id);this.waiting.push(id);this.drain();return this.snapshot(id);
 }
 drain(){
  while(this.active.size<this.concurrency && this.waiting.length){
   const id=this.waiting.shift(),j=this.jobs.get(id);if(!j)continue;this.active.add(id);j.status='running';
   Promise.resolve().then(j.run).then(result=>{j.result=result;j.status='completed';},error=>{j.error=error.message || '检测失败';j.status='failed';}).finally(()=>{delete j.run;this.active.delete(id);this.drain();});
  }
 }
}
