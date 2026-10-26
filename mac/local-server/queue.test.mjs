import {test} from 'node:test';import assert from 'node:assert/strict';import {AnalysisQueue} from './queue.mjs';
const tick=()=>new Promise(setImmediate);
test('simultaneous videos queue FIFO instead of rejecting as busy',async()=>{
 const q=new AnalysisQueue();let release;const order=[];
 const a=q.enqueue('one','account',()=>new Promise(resolve=>{release=()=>{order.push(1);resolve({score:.1});};}));
 const b=q.enqueue('two','account',async()=>{order.push(2);return {score:.2};});
 const c=q.enqueue('three','account',async()=>{order.push(3);return {score:.3};});
 assert.equal(a.status,'running');assert.equal(b.status,'queued');assert.equal(b.queuePosition,1);assert.equal(c.queuePosition,2);
 await tick();release();await tick();await tick();
 assert.deepEqual(order,[1,2,3]);assert.equal(q.snapshot(c.jobId).status,'completed');assert.equal(q.busy,false);
});
test('retries attach to same pending job and failures do not stall next video',async()=>{
 const q=new AnalysisQueue();let executions=0;
 const first=q.enqueue('same','account',async()=>{executions++;throw new Error('model error');});
 const duplicate=q.enqueue('same','account',async()=>{executions++;});assert.equal(first.jobId,duplicate.jobId);
 const next=q.enqueue('next','account',async()=>({score:.7}));await tick();await tick();
 assert.equal(executions,1);assert.equal(q.snapshot(first.jobId).status,'failed');assert.equal(q.snapshot(next.jobId).status,'completed');
 const retry=q.enqueue('same','account',async()=>({score:.5}));assert.notEqual(retry.jobId,first.jobId);await tick();
 assert.equal(q.snapshot(retry.jobId).status,'completed');
});
test('bounded queue preserves active jobs',async()=>{
 const q=new AnalysisQueue({limit:2,retain:1});let finish;
 const first=q.enqueue('1','a',()=>new Promise(r=>{finish=r;}));const second=q.enqueue('2','a',async()=>1);
 assert.throws(()=>q.enqueue('3','a',async()=>1),/队列已满/);assert.ok(q.snapshot(first.jobId));assert.ok(q.snapshot(second.jobId));await tick();finish(1);await tick();
});
test('configured concurrency runs up to the limit and preserves FIFO overflow',async()=>{
 const q=new AnalysisQueue({limit:5,concurrency:2});const release=[];const order=[];
 const jobs=[0,1,2,3].map(i=>q.enqueue(String(i),'a',()=>new Promise(resolve=>{release[i]=()=>{order.push(i);resolve(i);};})));
 await tick();assert.deepEqual(jobs.map(j=>j.status),['running','running','queued','queued']);assert.equal(q.active.size,2);
 release[0]();await tick();assert.equal(q.snapshot(jobs[2].jobId).status,'running');
 assert.throws(()=>q.setConcurrency(101),/1到100/);q.setConcurrency(3);await tick();assert.equal(q.active.size,3);
 release[1]();release[2]();release[3]();await tick();await tick();assert.equal(q.busy,false);assert.deepEqual(order,[0,1,2,3]);
});
