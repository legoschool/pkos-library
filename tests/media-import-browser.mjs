// Fictional image/PPT files in isolated browser profiles; no personal library is changed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {launchBrowser,stubGoogle} from './browser-runtime.mjs';
import {documentAssetReferences} from '../document-pages-model.js';

const base=process.env.PKOS_TEST_URL||'http://127.0.0.1:8915/';
const out=process.env.PKOS_MEDIA_TEST_OUT||'test-results/media-import-20261015';
await fs.mkdir(out,{recursive:true});
const pptx=await fs.readFile(new URL('./fixtures/document-pages.pptx',import.meta.url));
const checks=[],errors=[];
const browser=await launchBrowser();
const ctx=await browser.newContext({viewport:{width:1366,height:900},acceptDownloads:true});
await ctx.addInitScript(()=>{if(window===top){localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');}});
await stubGoogle(ctx);
const p=await ctx.newPage();p.setDefaultTimeout(20000);p.on('pageerror',error=>errors.push(error.message));
const action=name=>p.locator(`[data-action="${name}"]:visible`).first().click();
const choice=mode=>p.locator(`dialog[open] [data-media-choice="${mode}"]`).click();
const group=()=>p.locator('#image-groups .image-group').first();
const pptFrame=()=>p.frameLocator('#dialog .pptx-frame');
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function state(page=p){return page.evaluate(async()=>{const {openStore}=await import('./store.js'),db=await openStore(false);return db.backup();});}
async function waitState(predicate){for(let i=0;i<100;i++){const data=await state();if(predicate(data))return data;await p.waitForTimeout(100);}throw Error('Timed out waiting for saved import state');}
async function drop(files){await p.evaluate(items=>{const dataTransfer=new DataTransfer();for(const f of items)dataTransfer.items.add(new File([Uint8Array.from(atob(f.data),c=>c.charCodeAt(0))],f.name,{type:f.mimeType}));document.querySelector('.workspace').dispatchEvent(new DragEvent('drop',{dataTransfer,bubbles:true,cancelable:true}));},files.map(f=>({...f,buffer:undefined,data:f.buffer.toString('base64')})));}
async function finished(){await p.locator('[data-page-conversion="close"]:not([disabled])').waitFor({timeout:120000});assert.match(await p.locator('.page-conversion-jobs').innerText(),/확인 완료/);await p.locator('[data-page-conversion="close"]').click();}
async function openNote(id){await p.goto(base+'#n='+encodeURIComponent(id));await p.locator('#markdown').waitFor({state:'attached'});}
function original(data,file){const asset=data.assets.find(a=>a.name===file.name);assert.ok(asset,file.name+' was retained');assert.equal(asset.data===file.buffer.toString('base64'),true,file.name+' bytes are unchanged');return asset;}
function assetSummary(assets){return assets.map(({data,...asset})=>({...asset,sha256:createHash('sha256').update(Buffer.from(data,'base64')).digest('hex')})).sort((a,b)=>a.id.localeCompare(b.id));}
let photos,photoNoteId,draftNoteId,pptNoteId;
try{
 await p.goto(base);await p.locator('.welcome').waitFor();
 photos=await p.evaluate(()=>['#ca4d42','#386aa4'].map((fill,i)=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const c=canvas.getContext('2d');c.fillStyle=fill;c.fillRect(0,0,640,360);c.fillStyle='#ffffff';c.font='40px sans-serif';c.fillText('Fictional photo '+(i+1),40,180);return {name:'가상 사진 '+(i+1)+'.png',mimeType:'image/png',data:canvas.toDataURL('image/png').split(',')[1]};}));
 photos=photos.map(f=>({...f,buffer:Buffer.from(f.data,'base64')}));
 await check('canceling the photo choice imports neither notes nor original files',async()=>{
  await drop(photos);await p.locator('[data-media-choice="slides"]').waitFor();
  let data=await state();assert.equal(data.notes.length,0);assert.equal(data.assets.length,0);
  await choice('cancel');await p.locator('[data-media-choice="slides"]').waitFor({state:'detached'});
  data=await state();assert.equal(data.notes.length,0);assert.equal(data.assets.length,0);
 });
 await check('two photos import as one slide group with unchanged originals and working next/previous',async()=>{
  await drop(photos);await choice('slides');await group().locator('.image-group-slide img').waitFor();
  const data=await waitState(d=>d.notes.length===1&&d.notes[0].imageGroups?.length===1),note=data.notes[0];photoNoteId=note.id;
  assert.equal(note.attachments.length,2);assert.equal(data.assets.length,2);assert.equal(note.imageGroups[0].mode,'slides');assert.equal(note.imageGroups[0].assetIds.length,2);
  for(const f of photos)assert.ok(note.imageGroups[0].assetIds.includes(original(data,f).id));
  const img=group().locator('.image-group-slide img');await img.evaluate(el=>el.decode());const first=await img.getAttribute('alt');
  await group().locator('[data-image-step="1"]').click();assert.notEqual(await img.getAttribute('alt'),first);assert.equal(await group().locator('[data-image-step="1"]').isDisabled(),true);
  await group().locator('[data-image-step="-1"]').click();assert.equal(await img.getAttribute('alt'),first);assert.equal(await group().locator('[data-image-step="-1"]').isDisabled(),true);
  await p.locator('.document').evaluate(el=>{el.scrollTop=0;});await p.screenshot({path:path.join(out,'photo-slides-desktop.png')});
 });
 await check('switching photos to expanded view persists after reload without duplicate attachment cards',async()=>{
  await group().locator('[data-image-group-mode="expanded"]').click();await group().locator('.image-group-expanded img').nth(1).waitFor();
  await waitState(d=>d.notes.find(n=>n.id===photoNoteId)?.imageGroups[0].mode==='expanded');
  await p.reload();await group().locator('.image-group-expanded img').nth(1).waitFor();assert.equal(await group().locator('.image-group-expanded img').count(),2);
  assert.equal(await p.locator('#attachments .attachment-card img').count(),0);
  await p.screenshot({path:path.join(out,'photo-expanded-desktop.png')});
 });
 await check('photo file picker preserves a draft and expanded choice stores one ordered image group',async()=>{
  await action('new');await p.locator('#edit-title').fill('사진과 함께 적는 가상 생각');await p.locator('#edit-body').fill('사진을 넣기 전에 적은 생각\n\n**직접 쓴 마크다운**과 줄바꿈을 유지합니다.');
  const draftText=await p.locator('#edit-body').inputValue();await action('attach');await p.locator('#file-input').setInputFiles(photos.map(({name,mimeType,buffer})=>({name,mimeType,buffer})));
  await choice('expanded');await group().locator('.image-group-expanded img').nth(1).waitFor();assert.equal(await p.locator('#edit-body').inputValue(),draftText);
  const data=await waitState(d=>d.notes.some(n=>n.title==='사진과 함께 적는 가상 생각'&&n.imageGroups?.length));const note=data.notes.find(n=>n.title==='사진과 함께 적는 가상 생각');draftNoteId=note.id;
  assert.equal(note.body,draftText);assert.equal(note.imageGroups[0].mode,'expanded');assert.equal(note.imageGroups[0].assetIds.length,2);
  for(let i=0;i<photos.length;i++)assert.equal(data.assets.find(a=>a.id===note.imageGroups[0].assetIds[i]).data===photos[i].buffer.toString('base64'),true,'attached photo '+i+' bytes and order are preserved');
  await drop(photos);await choice('cancel');assert.equal(await p.locator('#edit-body').inputValue(),draftText);
  const after=await state();assert.equal(after.notes.find(n=>n.id===draftNoteId).attachments.length,2);assert.equal(after.assets.length,data.assets.length);
 });
 await check('detaching photos prunes group membership and removes an empty group without touching another note',async()=>{
  await group().locator('[data-image-detach]').first().click();
  await waitState(d=>d.notes.find(n=>n.id===draftNoteId)?.imageGroups[0]?.assetIds.length===1);assert.equal(await group().locator('.image-group-expanded img').count(),1);
  await group().locator('[data-image-detach]').first().click();
  const data=await waitState(d=>d.notes.find(n=>n.id===draftNoteId)?.attachments.length===0);assert.deepEqual(data.notes.find(n=>n.id===draftNoteId).imageGroups,[]);
  assert.equal(await p.locator('#image-groups .image-group').count(),0);assert.equal(data.notes.find(n=>n.id===photoNoteId).imageGroups[0].assetIds.length,2);
  await p.keyboard.press('Control+e');await p.locator('#markdown').waitFor();
 });
 await check('a failed detach keeps photo membership visible and saved so the same action can be retried',async()=>{
  await openNote(draftNoteId);await action('edit');await drop(photos);await choice('expanded');await group().locator('.image-group-expanded img').nth(1).waitFor();const before=await state();
  await p.evaluate(async id=>{const {openStore}=await import('./store.js'),prototype=Object.getPrototypeOf(await openStore(false)),original=prototype.save;window.__restoreMediaStore=()=>{prototype.save=original;delete window.__restoreMediaStore;};prototype.save=function(note,...args){if(note.id===id&&note.attachments.length===1){prototype.save=original;return Promise.reject(Error('가상 사진 해제 저장 실패'));}return original.call(this,note,...args);};},draftNoteId);
  try{
   await group().locator('[data-image-detach]').first().click();await group().getByText('변경을 저장하지 못했습니다. 다시 시도해 주세요.').waitFor();
   const after=await state();assert.deepEqual(after.notes.find(n=>n.id===draftNoteId).imageGroups,before.notes.find(n=>n.id===draftNoteId).imageGroups);assert.equal(await group().locator('[data-image-detach]').count(),2);
   await group().locator('[data-image-detach]').first().click();await waitState(d=>d.notes.find(n=>n.id===draftNoteId)?.imageGroups[0]?.assetIds.length===1);
   await group().locator('[data-image-detach]').first().click();await waitState(d=>d.notes.find(n=>n.id===draftNoteId)?.attachments.length===0);
   await p.keyboard.press('Control+e');await p.locator('#markdown').waitFor({state:'attached'});
  }finally{await p.evaluate(()=>window.__restoreMediaStore?.());}
 });
 await check('typing while image attachment storage is pending preserves the latest draft and saves it',async()=>{
  await openNote(draftNoteId);await action('edit');
  await p.evaluate(async()=>{const {openStore}=await import('./store.js'),prototype=Object.getPrototypeOf(await openStore(false)),original=prototype.saveCaptured;window.__captureStarted=false;window.__restoreMediaStore=()=>{prototype.saveCaptured=original;window.__releaseCapture?.();delete window.__restoreMediaStore;};prototype.saveCaptured=async function(...args){prototype.saveCaptured=original;window.__captureStarted=true;await new Promise(resolve=>{window.__releaseCapture=resolve;});return original.apply(this,args);};});
  try{
   await drop([{...photos[0],name:'저장 중 추가한 가상 사진.png'}]);await choice('slides');await p.waitForFunction(()=>window.__captureStarted);
   const late='사진 저장이 진행되는 동안 새로 입력한 생각\n\n**최신 입력은 유지되어야 합니다.**';await p.locator('#edit-body').fill(late);await p.waitForTimeout(950);await p.evaluate(()=>window.__releaseCapture());
   await group().locator('.image-group-slide img').waitFor();assert.equal(await p.locator('#edit-body').inputValue(),late);await waitState(d=>d.notes.find(n=>n.id===draftNoteId)?.body===late);
   await p.keyboard.press('Control+e');await p.locator('#markdown').waitFor();
  }finally{await p.evaluate(()=>window.__restoreMediaStore?.());}
 });
 await check('PPT slide choice opens the original viewer without generating page images',async()=>{
  const file={name:'넘겨 보는 가상 발표.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:pptx};
  await drop([file]);await choice('slides');await pptFrame().locator('#pages[data-rendered="1"]').waitFor({timeout:60000});
  const data=await state(),asset=original(data,file),note=data.notes.find(n=>n.attachments.includes(asset.id));pptNoteId=note.id;
  assert.deepEqual(note.attachments,[asset.id]);assert.equal(note.documentPages?.length||0,0);
  await pptFrame().locator('[data-pdf-step="1"]').click();await pptFrame().locator('#pages[data-rendered="2"]').waitFor();assert.match(await pptFrame().locator('.document-page').textContent(),/두 번째 수업/);
  await p.screenshot({path:path.join(out,'ppt-slides-desktop.png')});await action('dialog-close');
 });
 await check('PPT expanded choice produces three separate page images while retaining the complete original',async()=>{
  const file={name:'쪼개 보는 가상 발표.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:pptx};
  await drop([file]);await choice('expanded');await finished();assert.equal(await p.locator('.document-page-card').count(),3);
  const data=await state(),asset=original(data,file),note=data.notes.find(n=>n.attachments.includes(asset.id));assert.equal(note.documentPages.length,3);assert.equal(note.attachments.length,4);
  assert.ok(note.documentPages.every(page=>page.sourceAssetId===asset.id));assert.equal(new Set(note.documentPages.map(page=>data.assets.find(a=>a.id===page.assetId).data)).size,3);
  assert.equal(data.notes.find(n=>n.id===pptNoteId).documentPages?.length||0,0);
 });
 await check('390px photo and PPT slide views fit the screen and keep navigation usable',async()=>{
  await p.setViewportSize({width:390,height:844});await openNote(photoNoteId);await group().locator('[data-image-group-mode="slides"]').click();await group().locator('.image-group-slide img').waitFor();
  await group().locator('[data-image-step="1"]').click();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await group().evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await group().scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,'photo-slides-mobile.png')});
  await openNote(pptNoteId);await p.locator('[data-action="preview-pdf"]').first().click();await pptFrame().locator('#pages[data-rendered="1"]').waitFor({timeout:60000});
  assert.ok(await p.locator('#dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert.ok(await pptFrame().locator('body').evaluate(el=>el.scrollWidth<=innerWidth+1));
  await p.screenshot({path:path.join(out,'ppt-slides-mobile.png')});await action('dialog-close');
 });
 await check('validated backup roundtrip preserves image-group order, mode and all original bytes',async()=>{
  const backup=await p.evaluate(async()=>{const {openStore}=await import('./store.js'),{validateBackup}=await import('./core.js');return validateBackup(await(await openStore(false)).backup());});
  const other=await browser.newContext({viewport:{width:1100,height:800}});await stubGoogle(other);await other.addInitScript(()=>{localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');});
  try{const q=await other.newPage();q.on('pageerror',error=>errors.push(error.message));await q.goto(base);await q.locator('.welcome').waitFor();
   const restored=await q.evaluate(async backup=>{const {openStore}=await import('./store.js'),{validateBackup}=await import('./core.js'),db=await openStore(false);await db.mergeBackup(validateBackup(backup));return validateBackup(await db.backup());},backup);
   assert.deepEqual(JSON.parse(JSON.stringify(restored.notes)),JSON.parse(JSON.stringify(backup.notes)));
   // Existing backup import intentionally excludes orphaned assets detached from every note.
   const referenced=new Set(backup.notes.flatMap(documentAssetReferences));assert.deepEqual(assetSummary(restored.assets),assetSummary(backup.assets.filter(a=>referenced.has(a.id))));
   await q.goto(base+'#n='+photoNoteId);await q.reload();await q.locator('#image-groups .image-group-slide img').waitFor();
   const names=restored.notes.find(n=>n.id===photoNoteId).imageGroups[0].assetIds.map(id=>restored.assets.find(a=>a.id===id).name);assert.deepEqual(names,photos.map(f=>f.name));
  }finally{await other.close();}
 });
 await check('cached photo and PPT slide views reopen after an offline reload',async()=>{
  await p.evaluate(async()=>{await navigator.serviceWorker.ready;});await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await ctx.setOffline(true);
  try{await openNote(photoNoteId);await p.reload();await group().locator('.image-group-slide img').waitFor();await group().locator('.image-group-slide img').evaluate(el=>el.decode());
   await openNote(pptNoteId);await p.reload();await p.locator('[data-action="preview-pdf"]').first().click();await pptFrame().locator('#pages[data-rendered="1"]').waitFor({timeout:45000});await action('dialog-close');
  }finally{await ctx.setOffline(false);}
 });
 assert.deepEqual(errors,[]);
 await Promise.all(['failure.txt','failure.png'].map(file=>fs.rm(path.join(out,file),{force:true})));
}catch(error){await p.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(out,'failure.txt'),error.stack);throw error;}
finally{await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({base,checks,errors},null,2));await browser.close();}
console.log(checks.length+' checks passed');
