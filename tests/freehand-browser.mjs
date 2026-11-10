// Fictional drawings in isolated browser profiles; no personal library is read or changed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {launchBrowser,stubGoogle} from './browser-runtime.mjs';

const base=process.env.PKOS_TEST_URL||'http://127.0.0.1:8915/';
const out=process.env.PKOS_FREEHAND_TEST_OUT||'test-results/freehand-20261015';
await fs.mkdir(out,{recursive:true});
const browser=await launchBrowser(),checks=[],errors=[];
const context=await browser.newContext({viewport:{width:1366,height:1000},hasTouch:true,acceptDownloads:true});
await context.addInitScript(()=>{
 if(window!==top)return;
 localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');
 const put=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);if(window.rejectDrawingSave&&this.name==='assets'){const transaction=this.transaction;queueMicrotask(()=>transaction.abort());}return request;};
});
await stubGoogle(context);
const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
const action=name=>page.locator(`[data-action="${name}"]:visible`).first().click();
const drawing=name=>page.locator(`[data-drawing-action="${name}"]:visible`).click();
const canvas=page.locator('.page-drawing-canvas'),dialog=page.locator('.page-drawing-dialog');
const tool=name=>page.locator(`[data-drawing-tool="${name}"]`).click();
const card=id=>page.locator(`#drawings .drawing-card[data-drawing-id="${id}"]`);
async function check(name,run){await run();checks.push(name);console.log('PASS '+name);}
async function state(target=page){return target.evaluate(async()=>{const {openStore}=await import('./store.js');const {created,...backup}=await(await openStore(false)).backup();return backup;});}
async function waitState(predicate){for(let i=0;i<150;i++){const value=await state();if(predicate(value))return value;await page.waitForTimeout(100);}throw Error('Timed out waiting for saved drawing');}
async function openDrawing(id){if(id)await card(id).locator('[data-action="draw-edit"]').click();else await action('draw-new');await canvas.waitFor();await page.locator('[data-drawing-action="save"]:not([disabled])').waitFor();}
async function stroke(name,points){
 await tool(name);const box=await canvas.boundingBox();assert.ok(box?.width>0&&box?.height>0);
 const positions=points.map(([x,y])=>({x:box.x+x*box.width,y:box.y+y*box.height}));
 await page.mouse.move(positions[0].x,positions[0].y);await page.mouse.down();
 for(const point of positions.slice(1))await page.mouse.move(point.x,point.y,{steps:6});
 await page.mouse.up();
}
async function dot(name,x,y){await tool(name);const box=await canvas.boundingBox();await page.mouse.click(box.x+x*box.width,box.y+y*box.height);}
async function png(){const pending=page.waitForEvent('download');await drawing('download');const downloaded=await pending;return fs.readFile(await downloaded.path());}
async function pixels(){return createHash('sha256').update(await png()).digest('hex');}
const note=(s)=>s.notes.find(n=>n.id===noteId);
const savedDrawing=(s,id)=>note(s).drawings.find(d=>d.id===id);
const summary=assets=>assets.map(({data,...asset})=>({...asset,sha256:createHash('sha256').update(Buffer.from(data,'base64')).digest('hex')})).sort((a,b)=>a.id.localeCompare(b.id));
let noteId,firstId,secondId;
const title='직접 그리는 가상 수업 메모',body='직접 적어 둔 생각을 유지합니다.\n\n**마크다운**과 줄바꿈도 그대로 둡니다.';

try{
 await page.goto(base);await page.locator('.welcome').waitFor();await action('new');
 await page.locator('#edit-title').fill(title);await page.locator('#edit-body').fill(body);
 noteId=(await waitState(s=>s.notes.some(n=>n.title===title&&n.body===body))).notes.find(n=>n.title===title).id;
 await check('canceling a blank drawing or discarding a changed drawing saves no PNG or drawing entry',async()=>{
  const before=await state();await openDrawing();await drawing('cancel');await dialog.waitFor({state:'detached'});
  assert.deepEqual(await state(),before);
  await openDrawing();await stroke('pen',[[.12,.2],[.4,.35]]);await drawing('cancel');await drawing('keep-editing');assert.ok(await dialog.isVisible());
  await drawing('cancel');await drawing('discard');await dialog.waitFor({state:'detached'});assert.deepEqual(await state(),before);
  assert.equal(await page.locator('#edit-body').inputValue(),body);
 });
 await check('drawing tools create a visible white PNG with editable objects while preserving the text draft',async()=>{
  await openDrawing();const blank=await pixels();await stroke('pen',[[.12,.2],[.2,.12],[.32,.2]]);
  await stroke('highlighter',[[.43,.2],[.66,.2]]);await stroke('rectangle',[[.12,.38],[.3,.58]]);
  await stroke('ellipse',[[.43,.4],[.64,.6]]);await stroke('arrow',[[.12,.76],[.34,.86]]);
  await tool('sticker');await page.locator('[data-drawing-sticker="⭐"]').click();await dot('sticker',.82,.5);await tool('pen');
  const composed=await pixels();assert.notEqual(composed,blank);await drawing('undo');assert.notEqual(await pixels(),composed);await drawing('redo');assert.equal(await pixels(),composed);
  await page.screenshot({path:path.join(out,'desktop-freehand-editor.png')});await drawing('save');await dialog.waitFor({state:'detached'});
  const data=await waitState(s=>note(s).drawings?.length===1),n=note(data),entry=n.drawings[0];firstId=entry.id;
  assert.equal(n.body,body);assert.equal(n.title,title);assert.equal(await page.locator('#edit-body').inputValue(),body);
  assert.equal(n.attachments.length,1);assert.equal(data.assets.length,1);assert.equal(n.attachments[0],entry.assetId);
  assert.deepEqual(entry.annotations.items.map(i=>i.type).sort(),['arrow','ellipse','highlighter','pen','rectangle','sticker']);
  const a=data.assets.find(a=>a.id===entry.assetId);assert.equal(a.type,'image/png');assert.match(a.name,/\.png$/i);
  const inspection=await page.evaluate(async id=>{const {openStore}=await import('./store.js'),asset=await(await openStore(false)).get('assets',id),image=await createImageBitmap(asset.blob),c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const bytes=ctx.getImageData(0,0,c.width,c.height).data;let colored=0,white=0,opaque=0;for(let i=0;i<bytes.length;i+=4){if(bytes[i+3]===255)opaque++;if(bytes[i]===255&&bytes[i+1]===255&&bytes[i+2]===255)white++;else colored++;}image.close();return{width:c.width,height:c.height,colored,white,opaque};},entry.assetId);
  assert.equal(inspection.width,1600);assert.equal(inspection.height,1000);assert.equal(inspection.opaque,1600000);assert.ok(inspection.colored>500);assert.ok(inspection.white>1000000);
  await card(firstId).locator('img').evaluate(el=>el.decode());assert.equal(await page.locator('#attachments .attachment-card img').count(),0,'drawing should not be duplicated as a generic attachment');
 });
 await check('reopening starts from vectors, erases existing strokes and replaces the PNG without duplicating the drawing',async()=>{
  const before=await state(),original=savedDrawing(before,firstId);await openDrawing(firstId);
  assert.ok(await page.locator('[data-drawing-action="undo"]').isDisabled());const initial=await pixels();await dot('eraser',.12,.2);assert.notEqual(await pixels(),initial);
  await drawing('undo');assert.equal(await pixels(),initial);await drawing('redo');assert.notEqual(await pixels(),initial);await drawing('undo');
  await stroke('rectangle',[[.73,.7],[.89,.84]]);await drawing('save');await dialog.waitFor({state:'detached'});
  const data=await waitState(s=>savedDrawing(s,firstId).annotations.items.length===7),entry=savedDrawing(data,firstId);
  assert.equal(note(data).drawings.length,1);assert.equal(note(data).attachments.length,1);assert.notEqual(entry.assetId,original.assetId);assert.ok(!note(data).attachments.includes(original.assetId));
  assert.deepEqual(entry.annotations.items.slice(0,6),original.annotations.items);assert.equal(note(data).body,body);
 });
 await check('failed PNG storage rolls back the note and attachment, keeps the drawing open and retries successfully',async()=>{
  await openDrawing(firstId);await stroke('pen',[[.73,.16],[.9,.22]]);const before=await state();
  await page.evaluate(()=>window.rejectDrawingSave=true);await drawing('save');await page.locator('[data-drawing-action="save"]:not([disabled])').waitFor();
  assert.ok(await dialog.isVisible());assert.match(await page.locator('.page-drawing-status').innerText(),/실패|오류|완료하지|저장하지/);assert.deepEqual(await state(),before);
  await page.evaluate(()=>window.rejectDrawingSave=false);await drawing('save');await dialog.waitFor({state:'detached'});
  const data=await waitState(s=>savedDrawing(s,firstId).annotations.items.length===8);assert.notEqual(savedDrawing(data,firstId).assetId,savedDrawing(before,firstId).assetId);
 });
 await check('multiple drawings remain independent, and reload presents saved images with editable objects',async()=>{
  const first=savedDrawing(await state(),firstId);await openDrawing();await stroke('ellipse',[[.3,.2],[.7,.7]]);await drawing('save');await dialog.waitFor({state:'detached'});
  const data=await waitState(s=>note(s).drawings.length===2);secondId=note(data).drawings[1].id;assert.deepEqual(savedDrawing(data,firstId),first);assert.equal(note(data).attachments.length,2);
  await page.keyboard.press('Control+e');await page.locator('#markdown').waitFor();assert.equal(await page.locator('#drawings .drawing-card').count(),2);assert.equal(await page.locator('[data-action="drawing-detach"]').count(),0);
  await page.reload();await card(firstId).locator('img').waitFor();await card(firstId).locator('img').evaluate(el=>el.decode());assert.deepEqual((await state()).notes,data.notes);
  await card(firstId).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'desktop-freehand-reader.png')});await openDrawing(firstId);assert.ok(await page.locator('[data-drawing-action="undo"]').isDisabled());await drawing('cancel');await dialog.waitFor({state:'detached'});
 });
 await check('backup restoration preserves drawing vectors and PNG bytes and remaps colliding drawing assets',async()=>{
  const backup=await page.evaluate(async()=>{const {openStore}=await import('./store.js'),{validateBackup}=await import('./core.js');return validateBackup(await(await openStore(false)).backup());});
  const other=await browser.newContext({viewport:{width:1100,height:900}});await stubGoogle(other);await other.addInitScript(()=>{localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');});
  try{
   const restored=await other.newPage();restored.on('pageerror',error=>errors.push(error.message));await restored.goto(base);await restored.locator('.welcome').waitFor();
   const roundtrip=await restored.evaluate(async backup=>{const {openStore}=await import('./store.js'),{validateBackup}=await import('./core.js'),db=await openStore(false);await db.mergeBackup(validateBackup(backup));return validateBackup(await db.backup());},backup);
   assert.deepEqual(JSON.parse(JSON.stringify(roundtrip.notes)),JSON.parse(JSON.stringify(backup.notes)));const refs=new Set(backup.notes.flatMap(n=>n.attachments));assert.deepEqual(summary(roundtrip.assets),summary(backup.assets.filter(a=>refs.has(a.id))));
   await restored.goto(base+'#n='+noteId);await restored.reload();await restored.locator('#drawings .drawing-card').first().waitFor();assert.equal(await restored.locator('#drawings .drawing-card').count(),2);
   const remapped=await restored.evaluate(async backup=>{const {openStore}=await import('./store.js'),{validateBackup}=await import('./core.js'),db=await openStore(false),id=backup.notes[0].drawings[0].assetId,a=await db.get('assets',id);await db.put('assets',{...a,blob:new Blob(['isolated PNG collision'],{type:a.type})});const result=await db.mergeBackup(validateBackup(backup));return{result,backup:validateBackup(await db.backup())};},backup);
   assert.equal(remapped.result.copies,1);const copied=remapped.backup.notes.find(n=>n.id!==noteId),incoming=backup.notes[0].drawings[0],entry=copied.drawings[0];assert.notEqual(entry.assetId,incoming.assetId);assert.ok(copied.attachments.includes(entry.assetId));assert.deepEqual(entry.annotations,incoming.annotations);assert.equal(remapped.backup.assets.find(a=>a.id===entry.assetId).data,backup.assets.find(a=>a.id===incoming.assetId).data);
  }finally{await other.close();}
 });
 await check('320px and 390px drawing tools fit the screen and finger input saves a separate editable sketch',async()=>{
  await action('edit');const first=savedDrawing(await state(),firstId);await page.setViewportSize({width:390,height:844});await openDrawing();
  for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const bounds=await dialog.boundingBox();assert.ok(bounds.x>=-1&&bounds.x+bounds.width<=width+1);assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:path.join(out,`mobile-${width}-freehand-editor.png`)});}
  await tool('pen');const box=await canvas.boundingBox(),cdp=await context.newCDPSession(page),point=(x,y)=>({x:box.x+x*box.width,y:box.y+y*box.height,radiusX:2,radiusY:2,force:.5,id:1});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(.2,.35)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(.4,.45)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(.6,.35)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  await drawing('save');await dialog.waitFor({state:'detached'});const data=await waitState(s=>note(s).drawings.length===3),entry=note(data).drawings[2];assert.equal(entry.annotations.items.length,1);assert.equal(entry.annotations.items[0].type,'pen');assert.ok(entry.annotations.items[0].points.length>=2);assert.deepEqual(savedDrawing(data,firstId),first);await page.setViewportSize({width:1366,height:1000});
 });
 await check('detaching one drawing in the editor removes only its note references',async()=>{
  const before=await state(),first=savedDrawing(before,firstId),removed=savedDrawing(before,secondId);await card(secondId).locator('[data-action="drawing-detach"]').click();
  if(await page.locator('[data-action="ask-ok"]:visible').count())await action('ask-ok');
  const data=await waitState(s=>!note(s).drawings.some(d=>d.id===secondId));assert.equal(note(data).drawings.length,2);assert.ok(!note(data).attachments.includes(removed.assetId));assert.deepEqual(savedDrawing(data,firstId),first);assert.equal(note(data).body,body);assert.equal(await card(secondId).count(),0);
 });
 await check('offline reload opens the cached drawing editor and saves another vector without changing existing ones',async()=>{
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.waitForFunction(()=>!!navigator.serviceWorker.controller);const before=savedDrawing(await state(),firstId);await context.setOffline(true);
  try{await page.reload();await card(firstId).locator('img').waitFor();await openDrawing(firstId);assert.equal(await dialog.evaluate(el=>getComputedStyle(el).display),'flex');await stroke('arrow',[[.4,.8],[.65,.88]]);await drawing('save');await dialog.waitFor({state:'detached'});const data=await waitState(s=>savedDrawing(s,firstId).annotations.items.length===before.annotations.items.length+1);assert.deepEqual(savedDrawing(data,firstId).annotations.items.slice(0,-1),before.annotations.items);assert.equal(note(data).body,body);}finally{await context.setOffline(false);}
 });
 assert.deepEqual(errors,[]);await Promise.all(['failure.txt','failure.png'].map(file=>fs.rm(path.join(out,file),{force:true})));
}catch(error){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(out,'failure.txt'),error.stack);throw error;}
finally{await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({base,checks,errors},null,2));await browser.close();}
console.log(checks.length+' checks passed');
