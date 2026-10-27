// Synthetic pages and an OPFS folder in a disposable browser profile only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser,stubGoogle} from './browser-runtime.mjs';

const base=process.env.PKOS_TEST_URL||'http://127.0.0.1:8927/';
const out=process.env.PKOS_PAGE_DELETE_TEST_OUT||'test-results/page-delete-performance-20261027';
await fs.mkdir(out,{recursive:true});
const browser=await launchBrowser(),checks=[],errors=[];
const context=await browser.newContext({viewport:{width:1460,height:1000},serviceWorkers:'block'});
await context.addInitScript(()=>{
 localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');
 window.showDirectoryPicker=async()=> (await navigator.storage.getDirectory()).getDirectoryHandle('synthetic-page-delete',{create:true});
});
await stubGoogle(context);
const page=await context.newPage();page.setDefaultTimeout(20000);
page.on('pageerror',error=>errors.push(error.message));
const noteId='delete-performance-note',sourceId='delete-performance-source';
const card=number=>page.locator(`[data-document-page="performance-page-${number}"]`);
const action=name=>page.locator(`[data-action="${name}"]:visible`).first().click();
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
const stored=()=>page.evaluate(async id=>{const {openStore}=await import('./store.js'),db=await openStore(false);return {note:await db.get('notes',id),other:await db.get('notes','shared-page-owner'),assets:(await db.all('assets')).map(a=>({id:a.id,size:a.blob.size}))};},noteId);
async function waitStored(predicate){for(let i=0;i<100;i++){const value=await stored();if(predicate(value))return value;await page.waitForTimeout(50);}throw Error('Timed out waiting for browser page state');}
async function mirrorState(){return page.evaluate(async()=>{
 const {openStore}=await import('./store.js'),db=await openStore(false),config=await db.get('meta','folder-mirror-v1'),files=[];
 const hash=async file=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
 const walk=async(dir,prefix='')=>{for await(const [name,entry] of dir.entries()){try{if(entry.kind==='directory')await walk(entry,prefix+name+'/');else{const file=await entry.getFile();files.push({path:prefix+name,hash:await hash(file),text:name.endsWith('.md')?await file.text():undefined});}}catch(error){if(error.name!=='NotFoundError')throw error;}}};
 if(config?.handle)await walk(config.handle);
 return {manifest:config?.manifest,files};
 });}
async function waitMirror(predicate){for(let i=0;i<120;i++){const value=await mirrorState();if(predicate(value))return value;await page.waitForTimeout(75);}throw Error('Timed out waiting for local folder page state');}
async function holdMirror(){
 await page.evaluate(()=>{window.__mirrorHeld=false;void navigator.locks.request('pkos-folder-mirror-pkem-real-personal-v1',async()=>{window.__mirrorHeld=true;await new Promise(resolve=>window.__releaseMirror=resolve);});});
 await page.waitForFunction(()=>window.__mirrorHeld);
}
async function releaseMirror(){await page.evaluate(()=>{window.__releaseMirror?.();delete window.__releaseMirror;window.__mirrorHeld=false;});}
async function deletePage(number){await card(number).locator('[data-action="page-delete"]').click();await action('ask-ok');}
let originalFile,page20Path,page21Path;
try{
 await page.goto(base);await page.locator('.welcome').waitFor();
 await page.evaluate(async({noteId,sourceId})=>{
  const {openStore}=await import('./store.js'),{makeNote}=await import('./core.js'),db=await openStore(false);
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#e4edf8';ctx.fillRect(0,0,640,360);ctx.fillStyle='#273e64';ctx.font='32px sans-serif';ctx.fillText('Synthetic page deletion test',35,180);
  const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  const source={id:sourceId,name:'가상 40페이지.pdf',type:'application/pdf',blob:new Blob(['Synthetic original preserved byte for byte'],{type:'application/pdf'})};
  const images=Array.from({length:40},(_,i)=>({id:'performance-image-'+(i+1),name:'가상페이지-'+String(i+1).padStart(3,'0')+'.png',type:'image/png',blob:png}));
  const documentPages=images.map((image,i)=>({id:'performance-page-'+(i+1),sourceAssetId:sourceId,assetId:image.id,number:i+1,comment:'가상 의견 '+(i+1),deleted:false}));
  const note=makeNote({id:noteId,title:'40페이지 삭제 응답 시험',body:'보존할 본문',revision:1,attachments:[sourceId,...images.map(a=>a.id)],documentPages});
  const other=makeNote({id:'shared-page-owner',title:'공유 이미지 보존 시험',revision:1,attachments:['performance-image-21']});
  await db.batch({notes:[note,other],assets:[source,...images]});
 },{noteId,sourceId});
 await page.reload();await page.locator(`.note-row[data-note="${noteId}"]`).click();await card(40).waitFor({state:'attached'});
 await action('folder-mirror');await page.locator('[data-mirror-command="choose"]').click();
 await page.locator('[data-mirror-command="now"]:not([disabled])').waitFor();await page.locator('[data-mirror-close]').click();
 const initial=await waitMirror(s=>Object.keys(s.manifest?.assets||{}).length===41);
 originalFile=initial.files.find(f=>f.path===initial.manifest.assets[sourceId].path);
 page20Path=initial.manifest.assets['performance-image-20'].path;page21Path=initial.manifest.assets['performance-image-21'].path;
 await action('edit');await page.locator('#edit-body').waitFor();

 await check('40-page deletion completes while an earlier autosave waits for the folder lock; other images and scroll remain stable',async()=>{
  await holdMirror();
  await card(20).locator('[data-page-comment]').fill('삭제 전 자동 저장한 20페이지 의견');
  await waitStored(s=>s.note.documentPages[19].comment==='삭제 전 자동 저장한 20페이지 의견');
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-mirror-status]')].some(el=>el.textContent==='로컬 폴더 저장 중'));
  await card(20).locator('[data-action="page-delete"]').click();
  await page.evaluate(()=>{window.__stablePage=document.querySelector('[data-document-page="performance-page-21"]');window.__stableImage=window.__stablePage.querySelector('img');window.__stableSrc=window.__stableImage.src;window.__stableEditor=document.querySelector('#edit-body');window.__scrollBeforeDelete=document.querySelector('.document').scrollTop;});
  const started=Date.now();await action('ask-ok');
  await card(20).waitFor({state:'detached',timeout:1500});
  const elapsed=Date.now()-started;
  const data=await stored();assert.equal(data.note.documentPages[19].deleted,true);assert.equal(data.note.documentPages[19].comment,'삭제 전 자동 저장한 20페이지 의견');
  assert.ok(data.assets.some(a=>a.id==='performance-image-20'));assert.ok(data.assets.some(a=>a.id===sourceId));assert.equal(data.note.body,'보존할 본문');
  const ui=await page.evaluate(()=>({held:window.__mirrorHeld,card:window.__stablePage===document.querySelector('[data-document-page="performance-page-21"]'),image:window.__stableImage===document.querySelector('[data-document-page="performance-page-21"] img'),src:window.__stableSrc===window.__stableImage.src,editor:window.__stableEditor===document.querySelector('#edit-body'),scroll:Math.abs(window.__scrollBeforeDelete-document.querySelector('.document').scrollTop)}));
  assert.equal(ui.held,true);assert.equal(ui.card,true);assert.equal(ui.image,true);assert.equal(ui.src,true);assert.equal(ui.editor,true);assert.ok(ui.scroll<200,'deleting the current page should not jump the editor to its top');
  assert.equal(await page.locator('.document-page-card').count(),39);
  assert.ok((await mirrorState()).files.some(f=>f.path===page20Path),'folder work is still blocked while UI deletion has finished');
  checks.push('delete acknowledgement '+elapsed+' ms with mirror lock held');
  await releaseMirror();
  const mirrored=await waitMirror(s=>!s.files.some(f=>f.path===page20Path));
  assert.deepEqual(mirrored.files.find(f=>f.path===originalFile.path),originalFile);
  assert.ok(mirrored.files.some(f=>f.path===page21Path));
  assert.ok(!mirrored.files.find(f=>f.path===mirrored.manifest.notes[noteId].path).text.includes('삭제 전 자동 저장한 20페이지 의견'));
 });

 await check('restoration is visible before folder completion and retains the original page opinion and bytes',async()=>{
  await holdMirror();await page.locator('.deleted-pages summary').click();
  await page.locator('[data-action="page-restore"][data-page-id="performance-page-20"]').click();
  await card(20).waitFor({state:'attached',timeout:1500});
  assert.equal(await card(20).locator('[data-page-comment]').inputValue(),'삭제 전 자동 저장한 20페이지 의견');
  assert.equal((await stored()).note.documentPages[19].deleted,false);
  await releaseMirror();
  const mirrored=await waitMirror(s=>!!s.manifest.assets['performance-image-20']&&s.files.some(f=>f.path===s.manifest.assets['performance-image-20'].path));
  assert.equal(mirrored.files.find(f=>f.path===mirrored.manifest.assets['performance-image-20'].path).hash,initial.files.find(f=>f.path===page20Path).hash);
  assert.deepEqual(mirrored.files.find(f=>f.path===originalFile.path),originalFile);
 });

 await check('a failed browser save leaves the page visible and allows the same delete to be retried',async()=>{
  await page.evaluate(async()=>{
   const {openStore}=await import('./store.js'),prototype=Object.getPrototypeOf(await openStore(false)),save=prototype.save;
   window.__restoreSave=()=>{prototype.save=save;delete window.__restoreSave;};
   prototype.save=function(note,...args){if(note.id==='delete-performance-note'&&note.documentPages?.some(p=>p.id==='performance-page-22'&&p.deleted)){prototype.save=save;return Promise.reject(Error('가상 페이지 삭제 저장 실패'));}return save.call(this,note,...args);};
  });
  await deletePage(22);await page.getByText('가상 페이지 삭제 저장 실패',{exact:true}).waitFor();
  assert.equal(await card(22).count(),1);assert.equal((await stored()).note.documentPages[21].deleted,false);
  await deletePage(22);await card(22).waitFor({state:'detached',timeout:1500});
  assert.equal((await stored()).note.documentPages[21].deleted,true);
  await page.evaluate(()=>window.__restoreSave?.());
 });

 await check('deleting a page shared by another note preserves its folder PNG and every original asset',async()=>{
  await deletePage(21);await card(21).waitFor({state:'detached',timeout:1500});
  await waitMirror(s=>{const file=s.files.find(f=>f.path===s.manifest.notes[noteId].path);return file&&!file.text.includes('가상 의견 21');});
  const data=await stored(),mirrored=await mirrorState();
  assert.deepEqual(data.other.attachments,['performance-image-21']);assert.ok(data.assets.some(a=>a.id==='performance-image-21'));
  assert.equal(mirrored.files.find(f=>f.path===page21Path).hash,initial.files.find(f=>f.path===page21Path).hash);
  assert.deepEqual(mirrored.files.find(f=>f.path===originalFile.path),originalFile);
  assert.equal(data.assets.length,41);
 });

 await check('reload preserves deletion and restoration state in the 40-page note',async()=>{
  await page.reload();await card(40).waitFor({state:'attached'});
  assert.equal(await page.locator('.document-page-card').count(),38);assert.equal(await card(20).count(),1);assert.equal(await card(21).count(),0);assert.equal(await card(22).count(),0);
  const data=await stored();assert.equal(data.note.documentPages.length,40);assert.equal(data.note.documentPages[19].comment,'삭제 전 자동 저장한 20페이지 의견');assert.equal(data.note.body,'보존할 본문');
  await page.screenshot({path:path.join(out,'page-delete-restored.png')});
 });
 assert.deepEqual(errors,[]);
}catch(error){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(out,'failure.txt'),error.stack);throw error;}
finally{await releaseMirror().catch(()=>{});await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({base,checks,errors},null,2));await browser.close();}
console.log(checks.length+' checks passed');
