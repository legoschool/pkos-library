import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {launchBrowser} from './browser-runtime.mjs';

const base=process.argv[2]||'http://127.0.0.1:8899/';
const out=process.env.PKOS_DRAWING_TEST_OUT||'test-results/page-drawing-20261013';
await fs.mkdir(out,{recursive:true});
const pptx=await fs.readFile('tests/fixtures/document-pages.pptx');
const browser=await launchBrowser(),checks=[],errors=[],consoleErrors=[];
const context=await browser.newContext({viewport:{width:1460,height:1000},hasTouch:true});
await context.addInitScript(()=>{
 if(window!==top)return;
 localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');
 window.showDirectoryPicker=async()=>(await navigator.storage.getDirectory()).getDirectoryHandle('isolated-page-drawing-test',{create:true});
 const put=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);if(window.rejectDrawingSave&&this.name==='assets'){const transaction=this.transaction;queueMicrotask(()=>transaction.abort());}return request;};
});
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
const action=name=>page.locator(`[data-action="${name}"]:visible`).first().click();
const drawing=name=>page.locator(`[data-drawing-action="${name}"]:visible`).click();
const canvas=page.locator('.page-drawing-canvas');
const dialog=page.locator('.page-drawing-dialog');
const tool=name=>page.locator(`[data-drawing-tool="${name}"]`).click();
async function check(name,run){await run();checks.push(name);console.log('OK',name);}
async function state(){return page.evaluate(async()=>{
 const {openStore}=await import('./store.js'),db=await openStore(false);
 return navigator.locks.request('pkos-folder-mirror-'+db.db.name,async()=>{
 const notes=await db.all('notes'),assets=await db.all('assets'),config=await db.get('meta','folder-mirror-v1');
 const digest=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
 const files=[];const walk=async(dir,prefix='')=>{for await(const [name,entry]of dir.entries()){try{if(entry.kind==='directory')await walk(entry,prefix+name+'/');else{const file=await entry.getFile();files.push({path:prefix+name,hash:await digest(file),text:name.endsWith('.md')?await file.text():undefined});}}catch(error){if(error.name!=='NotFoundError')throw error;}}};
 if(config?.handle)await walk(config.handle);
 return {notes,assets:await Promise.all(assets.map(async a=>({id:a.id,name:a.name,type:a.type,size:a.blob.size,hash:await digest(a.blob)}))),files,config:config?{...config,handle:undefined}:null};
 });
});}
async function waitState(predicate){for(let i=0;i<150;i++){const value=await state();if(predicate(value))return value;await page.waitForTimeout(100);}throw Error('Timed out waiting for drawing persistence or folder mirror');}
async function openDrawing(index=0){await page.locator('[data-action="page-draw"]').nth(index).click();await canvas.waitFor();await page.locator('[data-drawing-action="save"]:not([disabled])').waitFor();}
async function stroke(name,points){
 await tool(name);const box=await canvas.boundingBox();assert.ok(box?.width>0&&box?.height>0);
 const positions=points.map(([x,y])=>({x:box.x+x*box.width,y:box.y+y*box.height}));
 await page.mouse.move(positions[0].x,positions[0].y);await page.mouse.down();
 for(const point of positions.slice(1))await page.mouse.move(point.x,point.y,{steps:6});
 await page.mouse.up();
}
async function dot(name,x,y){await tool(name);const box=await canvas.boundingBox();await page.mouse.click(box.x+x*box.width,box.y+y*box.height);}
async function pixels(){
 const pending=page.waitForEvent('download');await drawing('download');const downloaded=await pending;
 return createHash('sha256').update(await fs.readFile(await downloaded.path())).digest('hex');
}
const savedPage=(s,id)=>s.notes[0].documentPages.find(p=>p.id===id);
let pageOne,pageTwo,original,firstSaved;

try{
 await page.goto(base);await page.locator('.welcome').waitFor();
 await action('folder-mirror');await page.locator('[data-mirror-command="choose"]').click();
 await page.locator('[data-mirror-command="now"]:not([disabled])').waitFor();await page.locator('[data-mirror-close]').click();
 await check('synthetic PPTX uploads as three independent pages and unchanged original bytes',async()=>{
  await page.evaluate(bytes=>{const transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array(bytes)],'그리기 시험.pptx',{type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}));document.querySelector('.workspace').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));},[...pptx]);
  await page.locator('[data-page-conversion="close"]:not([disabled])').waitFor({timeout:120000});
  assert.match(await page.locator('.page-conversion-jobs').innerText(),/확인 완료/);await page.locator('[data-page-conversion="close"]').click();
  assert.equal(await page.locator('[data-action="page-draw"]').count(),3);
  original=await waitState(s=>s.files.filter(f=>f.path.endsWith('.png')).length===3);
  [pageOne,pageTwo]=original.notes[0].documentPages;
  assert.equal(original.assets.find(a=>a.id===pageOne.sourceAssetId).size,pptx.length);
  const source=await page.evaluate(async id=>{const {openStore}=await import('./store.js'),asset=await(await openStore(false)).get('assets',id);return [...new Uint8Array(await asset.blob.arrayBuffer())];},pageOne.sourceAssetId);
  assert.deepEqual(Buffer.from(source),pptx);
 });
 await check('pen, highlighter, shapes and sticker compose one page; undo, redo and object eraser work',async()=>{
  await page.locator('[data-action="page-edit"]').first().click();
  await page.locator('#edit-body').fill('그리기 전에 적은 본문');
  await page.locator('[data-page-comment]').first().fill('첫 슬라이드 의견을 보존합니다');
  await page.locator('[data-page-comment]').nth(1).fill('둘째 슬라이드의 독립 의견');
  await openDrawing();
  await stroke('pen',[[.1,.18],[.2,.12],[.3,.2]]);
  await stroke('highlighter',[[.45,.2],[.65,.2]]);
  await stroke('rectangle',[[.1,.38],[.3,.58]]);
  await stroke('ellipse',[[.42,.4],[.64,.6]]);
  await stroke('arrow',[[.1,.78],[.33,.87]]);
  await tool('sticker');await page.locator('[data-drawing-sticker="⭐"]').click();await dot('sticker',.82,.5);
  await tool('pen');await page.screenshot({path:path.join(out,'desktop-drawing-editor.png')});
  const beforeUndo=await pixels();await drawing('undo');assert.notEqual(await pixels(),beforeUndo);
  await drawing('redo');assert.equal(await pixels(),beforeUndo);
  await dot('eraser',.1,.48);assert.notEqual(await pixels(),beforeUndo);
  await drawing('undo');assert.equal(await pixels(),beforeUndo);
  await drawing('save');await dialog.waitFor({state:'detached'});
  firstSaved=await waitState(s=>!!s.config.manifest.assets[savedPage(s,pageOne.id).annotatedAssetId]&&s.files.filter(f=>f.path.endsWith('.png')).length===4);
  const first=savedPage(firstSaved,pageOne.id);
  assert.deepEqual(first.annotations.items.map(i=>i.type).sort(),['arrow','ellipse','highlighter','pen','rectangle','sticker']);
  assert.equal(first.annotations.items.find(i=>i.type==='sticker').text,'⭐');
  assert.notEqual(first.annotatedAssetId,pageOne.assetId);assert.equal(first.assetId,pageOne.assetId);
  assert.equal(firstSaved.notes[0].body,'그리기 전에 적은 본문');assert.equal(first.comment,'첫 슬라이드 의견을 보존합니다');
  assert.equal(savedPage(firstSaved,pageTwo.id).comment,'둘째 슬라이드의 독립 의견');assert.ok(!savedPage(firstSaved,pageTwo.id).annotatedAssetId);
  for(const asset of original.assets)assert.equal(firstSaved.assets.find(a=>a.id===asset.id).hash,asset.hash,'original bytes changed');
  assert.notEqual(firstSaved.assets.find(a=>a.id===first.annotatedAssetId).hash,original.assets.find(a=>a.id===pageOne.assetId).hash);
 });
 await check('composite PNG appears in connected Markdown and reading export, with each opinion preserved',async()=>{
  const first=savedPage(firstSaved,pageOne.id),annotatedPath=firstSaved.config.manifest.assets[first.annotatedAssetId].path;
  const md=firstSaved.files.find(f=>f.text?.includes('첫 슬라이드 의견을 보존합니다')).text;
  const target=[...md.matchAll(/!\[1페이지\]\(([^)]+)\)/g)].map(m=>decodeURIComponent(m[1]));
  assert.ok(target.some(link=>link.endsWith(annotatedPath)),'Markdown must display the annotated PNG');
  const exported=await page.evaluate(async()=>{const {openStore}=await import('./store.js'),{buildReadingBundle}=await import('./reading-export.js');const db=await openStore(false),notes=await db.all('notes'),assets=await db.all('assets'),result=await buildReadingBundle(notes,assets,{attachmentIds:notes.flatMap(n=>n.attachments)});return {html:result.html,names:Object.keys(result.files)};});
  const composite=firstSaved.assets.find(a=>a.id===first.annotatedAssetId);
  assert.ok(exported.html.includes(encodeURIComponent(composite.name)));assert.match(exported.html,/첫 슬라이드 의견을 보존합니다/);
  assert.equal((exported.html.match(/<img /g)||[]).length,3);
 });
 await check('cancel offers keep editing or discard and leaves saved annotations untouched',async()=>{
  const before=await state();await openDrawing();await stroke('pen',[[.72,.75],[.88,.8]]);
  await drawing('cancel');await page.locator('[data-drawing-action="keep-editing"]').waitFor();await drawing('keep-editing');assert.ok(await dialog.isVisible());
  await drawing('cancel');await drawing('discard');await dialog.waitFor({state:'detached'});
  const after=await state();assert.deepEqual(after.notes,before.notes);assert.deepEqual(after.assets,before.assets);
 });
 await check('failed image transaction keeps previous drawing and draft available for retry',async()=>{
  await openDrawing();await stroke('pen',[[.72,.75],[.88,.8]]);const before=await state();
  await page.evaluate(()=>window.rejectDrawingSave=true);await drawing('save');
  await page.locator('[data-drawing-action="save"]:not([disabled])').waitFor();
  assert.ok(await dialog.isVisible());assert.match(await page.locator('.page-drawing-status').innerText(),/실패|오류|완료하지|저장하지/);
  const failed=await state();assert.deepEqual(failed.notes,before.notes);assert.deepEqual(failed.assets,before.assets);
  await page.evaluate(()=>window.rejectDrawingSave=false);await drawing('save');await dialog.waitFor({state:'detached'});
  const after=await waitState(s=>savedPage(s,pageOne.id).annotations.items.length===7);assert.notEqual(savedPage(after,pageOne.id).annotatedAssetId,savedPage(before,pageOne.id).annotatedAssetId);
 });
 await check('reopening after reload retains editable objects, comments and body without duplicating them',async()=>{
  const before=await state();await page.reload();await page.locator('[data-action="page-draw"]').first().waitFor();
  assert.deepEqual((await state()).notes,before.notes);await openDrawing();assert.ok(await page.locator('[data-drawing-action="undo"]').isDisabled(),'a new edit session must not undo committed drawings');
  await drawing('cancel');await dialog.waitFor({state:'detached'});
 });
 await check('390px and 320px editors fit the screen and touch draws only on the chosen second page',async()=>{
  const before=await state();await page.setViewportSize({width:390,height:844});await openDrawing(1);
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   const bounds=await dialog.boundingBox();assert.ok(bounds.x>=-1&&bounds.x+bounds.width<=width+1);
   assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'editor has horizontal overflow');
   await page.screenshot({path:path.join(out,`mobile-${width}-drawing-editor.png`)});
  }
  await tool('pen');const box=await canvas.boundingBox(),cdp=await context.newCDPSession(page);
  const point=(x,y)=>({x:box.x+x*box.width,y:box.y+y*box.height,radiusX:2,radiusY:2,force:.5,id:1});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(.2,.35)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(.4,.45)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(.6,.35)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  await drawing('save');await dialog.waitFor({state:'detached'});
  const after=await waitState(s=>!!savedPage(s,pageTwo.id).annotatedAssetId);
  assert.equal(savedPage(after,pageTwo.id).annotations.items.length,1);assert.equal(savedPage(after,pageTwo.id).annotations.items[0].type,'pen');
  assert.ok(savedPage(after,pageTwo.id).annotations.items[0].points.length>=2);
  assert.deepEqual(savedPage(after,pageOne.id),savedPage(before,pageOne.id));
  await page.setViewportSize({width:1460,height:1000});
 });
 await check('page deletion removes original and composite from mirror; restore returns identical bytes and drawing',async()=>{
  const before=await waitState(s=>!!s.config.manifest.assets[savedPage(s,pageTwo.id).annotatedAssetId]),first=savedPage(before,pageOne.id);
  const paths=[first.assetId,first.annotatedAssetId].map(id=>before.config.manifest.assets[id].path);
  await page.locator('[data-action="page-delete"]').first().click();await action('ask-ok');
  const deleted=await waitState(s=>paths.every(p=>!s.files.some(f=>f.path===p)));
  assert.equal(savedPage(deleted,pageOne.id).deleted,true);assert.deepEqual(savedPage(deleted,pageOne.id).annotations,first.annotations);
  assert.ok(deleted.files.some(f=>f.hash===original.assets.find(a=>a.id===pageOne.sourceAssetId).hash));
  await page.locator('.deleted-pages summary').click();await action('page-restore');
  const restored=await waitState(s=>paths.every(p=>s.files.some(f=>f.path===p)));
  for(const p of paths)assert.deepEqual(restored.files.find(f=>f.path===p),before.files.find(f=>f.path===p));
  assert.deepEqual(savedPage(restored,pageOne.id),first);
 });
 await check('backup round trip preserves annotation objects and PNG bytes; conflicting IDs remap every reference',async()=>{
  const backup=await page.evaluate(async()=>{const {openStore}=await import('./store.js'),{validateBackup}=await import('./core.js');return validateBackup(await(await openStore(false)).backup());});
  const other=await browser.newContext({viewport:{width:1280,height:900}});
  try{
   await other.addInitScript(()=>localStorage.setItem('pkos-guide-v1','done'));const restored=await other.newPage();restored.on('pageerror',e=>errors.push(e.message));await restored.goto(base);await restored.locator('.welcome').waitFor();
   const roundtrip=await restored.evaluate(async backup=>{const {openStore}=await import('./store.js'),{validateBackup}=await import('./core.js'),db=await openStore(false);await db.mergeBackup(validateBackup(backup));return db.backup();},backup);
   assert.deepEqual(JSON.parse(JSON.stringify(roundtrip.notes)),JSON.parse(JSON.stringify(backup.notes)));assert.deepEqual(roundtrip.assets,backup.assets);
   await restored.reload();await restored.locator('.note-row').first().click();assert.equal(await restored.locator('[data-action="page-draw"]').count(),3);
   const remapped=await restored.evaluate(async backup=>{
    const {openStore}=await import('./store.js'),{validateBackup}=await import('./core.js'),db=await openStore(false),first=backup.notes[0].documentPages[0],ids=[first.assetId,first.sourceAssetId,first.annotatedAssetId];
    for(const id of ids){const asset=await db.get('assets',id);await db.put('assets',{...asset,blob:new Blob(['isolated collision fixture'],{type:asset.type})});}
    const result=await db.mergeBackup(validateBackup(backup));return {result,backup:validateBackup(await db.backup()),ids};
   },backup);
   assert.equal(remapped.result.copies,1);
   const copy=remapped.backup.notes.find(n=>n.id!==backup.notes[0].id),copiedPage=copy.documentPages[0],incoming=backup.notes[0].documentPages[0];
   for(const field of ['assetId','sourceAssetId','annotatedAssetId']){assert.notEqual(copiedPage[field],incoming[field]);assert.equal(remapped.backup.assets.find(a=>a.id===copiedPage[field]).data,backup.assets.find(a=>a.id===incoming[field]).data);}
   assert.deepEqual(copiedPage.annotations,incoming.annotations);assert.ok(copy.attachments.includes(copiedPage.annotatedAssetId));
  }finally{await other.close();}
 });
 await check('offline reload opens cached drawing tools and saves another editable page',async()=>{
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
  await context.setOffline(true);
  try{
   await page.reload();await page.locator('[data-action="page-draw"]').first().waitFor();await openDrawing(2);
   assert.equal(await dialog.evaluate(el=>getComputedStyle(el).display),'flex');
   await stroke('arrow',[[.25,.3],[.7,.65]]);await drawing('save');await dialog.waitFor({state:'detached'});
   const saved=await waitState(s=>!!s.notes[0].documentPages[2].annotatedAssetId);
   assert.equal(saved.notes[0].documentPages[2].annotations.items[0].type,'arrow');
  }finally{await context.setOffline(false);}
 });
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
}catch(error){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(out,'failure.txt'),error.stack);throw error;}
finally{await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({base,checks,errors,consoleErrors},null,2));await browser.close();}
console.log(checks.length+' checks passed');
