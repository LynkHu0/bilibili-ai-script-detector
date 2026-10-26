const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('Bilibili profile pages load the existing card detector',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../extension/manifest.json'),'utf8'));
  const bili=manifest.content_scripts.find(entry=>entry.js.includes('bili/content.js'));
  assert.ok(bili, 'Bilibili card detector should be registered');
  assert.ok(bili.matches.includes('https://space.bilibili.com/*'));
  assert.ok(bili.matches.includes('https://www.bilibili.com/*'));
});
