// Disposable browser/IndexedDB only; no personal browser or filesystem data.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchBrowser} from './browser-runtime.mjs';
const base=process.argv[2]||'http://127.0.0.1:8899/';
const browser=await launchBrowser();
const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
await context.addInitScript(()=>{localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');});
let checks=[];
try{
 await page.goto(base);await page.locator('#app').waitFor();
 checks=await page.evaluate(async()=>{
  const {openStore}=await import('./store.js'),{makeNote,validateBackup}=await import('./core.js');
  const db=await openStore(false),checks=[];
  const ok=(value,message)=>{if(!value)throw Error(message);};
  const original={id:'source',name:'원본.pdf',type:'application/pdf',blob:new Blob(['original document'],{type:'application/pdf'})};
  const png={id:'png',name:'원본-001.png',type:'image/png',blob:new Blob([new Uint8Array([137,80,78,71,13,10,26,10,1])],{type:'image/png'})};
  const tombstone={id:'page-1',sourceAssetId:'source',assetId:'png',number:1,comment:'삭제 전 의견을 복원합니다.',deleted:true};
  const n=makeNote({id:'n',title:'페이지 기록',attachments:['source'],documentPages:[tombstone],revision:1});
  const content=async id=>{const a=await db.get('assets',id);return a?Array.from(new Uint8Array(await a.blob.arrayBuffer())):null;};

  await db.clear();await db.batch({notes:[n],assets:[original,png]});
  const backup=validateBackup(await db.backup()),imageBytes=await content('png');
  await db.clear();await db.mergeBackup(backup);
  const restored=await db.get('notes','n');
  ok(restored.documentPages[0].deleted&&restored.documentPages[0].comment===tombstone.comment,'tombstone and comment survive backup');
  ok(JSON.stringify(await content('png'))===JSON.stringify(imageBytes),'deleted-page PNG bytes survive empty-browser restore');
  ok((await db.get('assets','source')).blob.size===original.blob.size,'original source retained');
  validateBackup(await db.backup());checks.push('empty-browser backup import preserves deleted page restoration bytes and opinions');

  const changedBackup=structuredClone(backup);changedBackup.assets.find(a=>a.id==='png').data=btoa('different page bytes');
  const merged=await db.mergeBackup(changedBackup),after=await db.all('notes'),copy=after.find(note=>note.id!=='n');
  ok(merged.copies===1&&copy,'tombstoned PNG ID collision creates note copy');
  ok(copy.documentPages[0].assetId!=='png','copy page points to remapped PNG');
  ok((await db.get('assets',copy.documentPages[0].assetId)).blob.size==='different page bytes'.length,'incoming page bytes retained');
  ok(JSON.stringify(await content('png'))===JSON.stringify(imageBytes),'existing PNG unchanged');
  validateBackup(await db.backup());checks.push('colliding tombstoned PNG creates correctly remapped note copy and preserves both bytes');

  await db.clear();const sharing=makeNote({id:'sharing',title:'공유 이미지',attachments:['png'],revision:1});
  await db.batch({notes:[n,sharing],assets:[original,png]});await db.remove('sharing');
  ok(!!await db.get('assets','png'),'permanent deletion of another note must keep tombstone PNG');
  const note=await db.get('notes','n');await db.save({...note,attachments:['source','png'],documentPages:[{...tombstone,deleted:false}]},note.revision);
  validateBackup(await db.backup());checks.push('permanent deletion of shared note preserves another note page restoration');

  await db.remove('n');ok((await db.all('notes')).length===0,'note removed');ok((await db.all('assets')).length===0,'orphan page/source bytes cleaned only after final owner removal');
  checks.push('permanent deletion cleans page tombstones only after all owners disappear');

  await db.clear();const detached={...n,attachments:[],documentPages:[tombstone]};
  await db.batch({notes:[detached],assets:[original,png]});const detachedBackup=validateBackup(await db.backup());await db.clear();await db.mergeBackup(detachedBackup);
  ok(!!await db.get('assets','source')&&!!await db.get('assets','png'),'detached original and deleted image remain reachable through pages');
  validateBackup(await db.backup());checks.push('detached original and deleted PNG survive backup using page metadata references');

  const same=await db.mergeBackup(detachedBackup);ok(same.added===0&&same.copies===0,'identical import is idempotent');ok((await db.all('assets')).length===2,'identical import creates no extra images');
  checks.push('identical deleted-page backup import remains idempotent');
  return checks;
 });
 assert.equal(checks.length,6);
 for(const check of checks)console.log('OK',check);
 await mkdir('test-results/document-pages-store-20261009',{recursive:true});
 await writeFile('test-results/document-pages-store-20261009/verification.json',JSON.stringify({base,checks},null,2));
}finally{await browser.close();}
console.log(checks.length+' checks passed');
