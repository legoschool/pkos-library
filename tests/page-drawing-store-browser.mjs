// Isolated browser/IndexedDB only; no personal profile, files, or cloud account.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchBrowser} from './browser-runtime.mjs';
const base=process.argv[2]||'http://127.0.0.1:8899/';
const browser=await launchBrowser(),checks=[];
const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
await context.addInitScript(()=>{localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');});
try{
 await page.goto(base);await page.locator('#app').waitFor();
 checks.push(...await page.evaluate(async()=>{
  const {openStore,ConflictError}=await import('./store.js'),{makeNote,validateBackup}=await import('./core.js');
  const {buildReadingBundle}=await import('./reading-export.js');
  const db=await openStore(false),checks=[];
  const ok=(value,message)=>{if(!value)throw Error(message);};
  const annotations={version:1,width:1000,height:750,items:[{type:'sticker',text:'★',size:30,x:100,y:100}]};
  const source={id:'source',name:'원본.pptx',type:'application/vnd.openxmlformats-officedocument.presentationml.presentation',blob:new Blob(['original document'])};
  const png=(id,byte)=>({id,name:id+'.png',type:'image/png',blob:new Blob([new Uint8Array([137,80,78,71,13,10,26,10,byte])],{type:'image/png'})});
  const original=png('original',1),first=png('drawn-first',2),nextImage=png('drawn-next',3);
  const firstPage={id:'page',sourceAssetId:source.id,assetId:original.id,annotatedAssetId:first.id,annotations,number:1,comment:'내 의견',deleted:false};
  const note=makeNote({id:'note',title:'그림 시험',body:'본문 그대로',attachments:[source.id,original.id,first.id],documentPages:[firstPage],revision:1});
  const edited=n=>({...n,attachments:[source.id,original.id,nextImage.id],documentPages:[{...n.documentPages[0],annotatedAssetId:nextImage.id,annotations:{...annotations,items:[]}}]});
  const bytes=async id=>{const a=await db.get('assets',id);return a?Array.from(new Uint8Array(await a.blob.arrayBuffer())):null;};

  await db.clear();await db.batch({notes:[note],assets:[source,original,first]});
  const originalBytes=await bytes(original.id),sourceBytes=await bytes(source.id);
  const saved=await db.saveCaptured(edited(note),note.revision,nextImage,undefined,[first.id]);
  ok(saved.revision===2&&saved.documentPages[0].annotatedAssetId===nextImage.id,'new annotation and image reference commit together');
  ok(!await db.get('assets',first.id),'unshared former composite retired');
  ok(JSON.stringify(await bytes(original.id))===JSON.stringify(originalBytes),'original page PNG unchanged');
  ok(JSON.stringify(await bytes(source.id))===JSON.stringify(sourceBytes),'source PPTX unchanged');
  ok((await db.get('assets',nextImage.id)).blob.size===nextImage.blob.size,'composite PNG committed');
  validateBackup(await db.backup());checks.push('drawing save atomically commits JSON and new PNG, retires old PNG, and preserves originals');

  for(const deleted of [false,true]){
   await db.clear();const copy={...structuredClone(note),id:'copy',deleted,attachments:deleted?[]:note.attachments,documentPages:[{...structuredClone(firstPage),deleted}]};
   await db.batch({notes:[note,copy],assets:[source,original,first]});
   await db.saveCaptured(edited(note),note.revision,nextImage,undefined,[first.id]);
   ok(!!await db.get('assets',first.id),'copy or page tombstone retains former composite');
   ok((await db.get('notes','copy')).documentPages[0].annotatedAssetId===first.id,'copy retains its own image reference');
   await db.remove('copy');ok(!await db.get('assets',first.id),'last former-composite owner removal cleans only its unshared bytes');
   ok(!!await db.get('assets',nextImage.id)&&!!await db.get('assets',original.id),'current drawing and original survive copy deletion');
   validateBackup(await db.backup());
  }
  checks.push('live copied notes and deleted-page references protect shared composites until their last owner is removed');

  await db.clear();await db.batch({notes:[note],assets:[source,original,first]});
  const latest=await db.save({...note,body:'다른 창에서 고친 본문'},note.revision);let rejected=false;
  try{await db.saveCaptured(edited(note),note.revision,nextImage,undefined,[first.id]);}catch(error){rejected=error instanceof ConflictError;}
  ok(rejected,'stale save rejected as conflict');ok(!await db.get('assets',nextImage.id),'conflict never inserts composite');ok(!!await db.get('assets',first.id),'conflict never retires prior composite');
  const retained=await db.get('notes',note.id);ok(retained.revision===latest.revision&&retained.body===latest.body&&retained.documentPages[0].annotatedAssetId===first.id,'latest note unchanged by conflict');
  checks.push('conflicting save leaves the latest note and previous PNG intact without inserting a partial image');

  const backup=validateBackup(await db.backup());await db.clear();await db.mergeBackup(backup);
  const imported=await db.get('notes',note.id);ok(JSON.stringify(imported.documentPages[0].annotations)===JSON.stringify(annotations),'editable layers survive roundtrip');
  const collision=structuredClone(backup);collision.assets.find(a=>a.id===first.id).data=btoa('different composite');
  const result=await db.mergeBackup(collision),all=await db.all('notes'),copy=all.find(n=>n.id!==note.id);
  ok(result.copies===1&&copy.documentPages[0].annotatedAssetId!==first.id,'composite collision remaps copied note');
  ok(copy.attachments.includes(copy.documentPages[0].annotatedAssetId),'remapped composite included in copied attachments');
  ok((await db.get('assets',copy.documentPages[0].annotatedAssetId)).blob.size==='different composite'.length,'incoming composite preserved');
  ok((await db.get('assets',first.id)).blob.size===first.blob.size,'existing composite preserved');validateBackup(await db.backup());
  checks.push('backup roundtrip preserves editable layers and remaps conflicting composite asset IDs');

  const assets=[source,original,first];
  const combined=await buildReadingBundle([note],assets,{attachmentIds:note.attachments});
  const compositePath=Object.keys(combined.files).find(path=>path.endsWith('-'+first.name));
  ok(combined.html.includes('src="'+compositePath+'"'),'reading export chooses composite when both PNGs selected');
  ok((combined.html.match(/<img /g)||[]).length===1,'no duplicate original/composite figure');
  const plain=await buildReadingBundle([note],assets,{attachmentIds:[original.id]});
  const originalPath=Object.keys(plain.files).find(path=>path.endsWith('-'+original.name));
  ok(plain.html.includes('src="'+originalPath+'"'),'explicit original-only selection exports original');
  checks.push('reading export prefers composite and respects explicit original-only selection');
  return checks;
 }));
 assert.equal(checks.length,5);for(const check of checks)console.log('OK',check);
 await mkdir('test-results/page-drawing-store-20261013',{recursive:true});
 await writeFile('test-results/page-drawing-store-20261013/verification.json',JSON.stringify({base,checks},null,2));
}finally{await browser.close();}
console.log(checks.length+' checks passed');
