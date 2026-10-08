// Isolated browser profiles and OPFS only. No actual user folder or native picker.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {launchBrowser,stubGoogle} from './browser-runtime.mjs';
const BASE=process.argv[2]||'http://127.0.0.1:8899/';
const out=process.env.PKOS_ONBOARDING_TEST_OUT?path.resolve(process.env.PKOS_ONBOARDING_TEST_OUT):fileURLToPath(new URL('../test-results/onboarding-folder-20261009/',import.meta.url));
await mkdir(out,{recursive:true});
const browser=await launchBrowser(),results=[],errors=[],consoleErrors=[],contexts=[];
async function openPage({seen=false,folderSeen=false,demo=false,unsupported=false,width=1440,height=1000}={}){
 const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});contexts.push(ctx);
 await ctx.addInitScript(({seen,folderSeen,unsupported})=>{
  if(seen)localStorage.setItem('pkos-guide-v1','done');
  if(folderSeen)localStorage.setItem('pkos-folder-guide-v1','done');
  window.testPickerCalls=0;window.testPermissionCalls=0;
  window.showDirectoryPicker=unsupported?undefined:async()=>{
   window.testPickerCalls++;
   if(window.testCancelPicker)throw new DOMException('선택 취소 시험','AbortError');
   return(await navigator.storage.getDirectory()).getDirectoryHandle('가상 저장 폴더',{create:true});
  };
  const query=FileSystemHandle.prototype.queryPermission,request=FileSystemHandle.prototype.requestPermission;
  FileSystemHandle.prototype.queryPermission=function(...args){return sessionStorage.getItem('testPermission')==='prompt'?Promise.resolve('prompt'):query.apply(this,args);};
  FileSystemHandle.prototype.requestPermission=function(...args){window.testPermissionCalls++;if(window.testAllowPermission){sessionStorage.removeItem('testPermission');return Promise.resolve('granted');}return request.apply(this,args);};
 },{seen,folderSeen,unsupported});
 await stubGoogle(ctx);const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
 await p.goto(new URL(demo?'?demo=1':'',BASE).href);await p.locator('.topbar').waitFor();await p.locator('.pkos-guide').waitFor({state:'attached'});return p;
}
const guide=p=>p.locator('.pkos-guide'),button=(p,key)=>p.locator('[data-guide="'+key+'"]');
const state=p=>p.evaluate(async()=>{
 const {openStore}=await import('./store.js'),db=await openStore(false),cfg=await db.get('meta','folder-mirror-v1'),files=[];
 if(cfg?.handle)for await(const [name,h]of cfg.handle.entries())if(h.kind==='file')files.push({name,text:await(await h.getFile()).text()});
 return {config:cfg?{folderName:cfg.folderName,enabled:cfg.enabled,lastAt:cfg.lastAt}:null,files,notes:await db.all('notes'),pickers:window.testPickerCalls,requests:window.testPermissionCalls};
});
const saved=p=>p.waitForFunction(()=>[...document.querySelectorAll('[data-mirror-status]')].some(e=>e.textContent==='로컬 폴더 저장됨'));
const screenshot=(p,name)=>p.screenshot({path:path.join(out,name+'.png'),fullPage:false});
const seed=(p,body='처음 연결하기 전에 보관한 가상 본문')=>p.evaluate(async body=>{
 const {openStore}=await import('./store.js'),{makeNote}=await import('./core.js'),db=await openStore(false);return(await db.save(makeNote({title:'가상 폴더 안내 시험',body}),0)).id;
},body);
const offlineChange=(p,id,body)=>p.evaluate(async({id,body})=>{
 const {openStore}=await import('./store.js'),db=await openStore(false),note=await db.get('notes',id);
 await new Promise((resolve,reject)=>{const tx=db.db.transaction('notes','readwrite');tx.objectStore('notes').put({...note,body,updated:new Date().toISOString()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
},{id,body});
async function complete(p){while(await guide(p).evaluate(e=>e.open))await button(p,'next').click();}
async function check(name,fn){try{await fn();results.push({name,pass:true});console.log('OK',name);}catch(e){results.push({name,pass:false,error:e.stack||e.message});console.error('FAIL',name,e.message);throw e;}}
let fresh,noteId,folder;
try{
 await check('first-use tutorial offers step-two folder setup without automatically opening a picker',async()=>{
  fresh=await openPage();assert.equal(await guide(fresh).evaluate(e=>e.open),true);assert.match(await fresh.locator('.guide-count').textContent(),/1 \/ 6/);
  assert.equal(await fresh.evaluate(()=>window.testPickerCalls),0);noteId=await seed(fresh);
  await button(fresh,'next').click();assert.match(await fresh.locator('.guide-count').textContent(),/2 \/ 6/);assert.ok(await button(fresh,'connect').isVisible());assert.equal(await fresh.evaluate(()=>window.testPickerCalls),0);await screenshot(fresh,'first-folder-step');
 });
 await check('picker cancellation preserves the record and keeps the tutorial usable',async()=>{
  await fresh.evaluate(()=>window.testCancelPicker=true);await button(fresh,'connect').click();
  await fresh.waitForFunction(()=>document.querySelector('[data-guide-folder-result]').textContent.includes('취소'));
  assert.equal(await guide(fresh).evaluate(e=>e.open),true);assert.ok(await button(fresh,'connect').isEnabled());
  const s=await state(fresh);assert.equal(s.config,null);assert.equal(s.notes[0].id,noteId);assert.equal(s.pickers,1);
 });
 await check('tutorial connection exports existing records and the remaining guide continues',async()=>{
  await fresh.evaluate(()=>window.testCancelPicker=false);await button(fresh,'connect').click();await saved(fresh);
  await fresh.waitForFunction(()=>document.querySelector('[data-guide-folder-result]').textContent.includes('저장했습니다'));
  const s=await state(fresh);assert.equal(s.config.enabled,true);assert.ok(s.files.some(f=>f.text.includes('처음 연결하기 전에 보관한 가상 본문')));folder=s.config.folderName;
  assert.equal(await button(fresh,'connect').isVisible(),false);await button(fresh,'next').click();assert.match(await fresh.locator('#guide-title').textContent(),/한 줄/);await complete(fresh);
  assert.equal(await fresh.evaluate(()=>localStorage.getItem('pkos-guide-v1')),'done');assert.equal(await fresh.evaluate(()=>localStorage.getItem('pkos-folder-guide-v1')),'done');
 });
 await check('relaunch reuses the handle and automatically resumes pending changes when permission remains',async()=>{
  await offlineChange(fresh,noteId,'재실행 시 기억한 폴더에 반영할 새 본문');await fresh.reload();await fresh.locator('.pkos-guide').waitFor({state:'attached'});await saved(fresh);
  const s=await state(fresh);assert.equal(await guide(fresh).evaluate(e=>e.open),false);assert.equal(s.pickers,0);assert.equal(s.requests,0);assert.equal(s.config.folderName,folder);assert.ok(s.files.some(f=>f.text.includes('재실행 시 기억한 폴더에 반영할 새 본문')));
 });
 await check('an existing connection suppresses upgrade prompts and respects explicit automatic-save-off',async()=>{
  await fresh.locator('.topbar [data-action="folder-mirror"]').click();await fresh.locator('[data-mirror-command="toggle"]').click();
  await fresh.waitForFunction(()=>[...document.querySelectorAll('[data-mirror-status]')].some(e=>e.textContent==='폴더 자동 저장 꺼짐'));await fresh.locator('[data-mirror-close]').click();const before=(await state(fresh)).files;
  await offlineChange(fresh,noteId,'꺼 둔 동안에는 폴더에 자동으로 쓰지 않을 본문');await fresh.evaluate(()=>localStorage.removeItem('pkos-folder-guide-v1'));await fresh.reload();await fresh.locator('.pkos-guide').waitFor({state:'attached'});
  const s=await state(fresh);assert.equal(s.config.enabled,false);assert.equal(s.config.folderName,folder);assert.deepEqual(s.files,before);assert.equal(s.pickers,0);assert.equal(s.requests,0);assert.equal(await guide(fresh).evaluate(e=>e.open),false);
 });
 await check('a remembered folder suppresses automatic tutorials even when guide completion flags are missing',async()=>{
  await fresh.evaluate(()=>{localStorage.removeItem('pkos-guide-v1');localStorage.removeItem('pkos-folder-guide-v1');});await fresh.reload();await fresh.locator('.pkos-guide').waitFor({state:'attached'});
  assert.equal(await guide(fresh).evaluate(e=>e.open),false);assert.equal((await state(fresh)).pickers,0);assert.equal((await state(fresh)).config.enabled,false);
 });
 await check('lost permission never prompts automatically and explicit retry restores the same connection',async()=>{
  await fresh.locator('.topbar [data-action="folder-mirror"]').click();await fresh.locator('[data-mirror-command="toggle"]').click();await saved(fresh);await fresh.locator('[data-mirror-close]').click();
  await fresh.evaluate(()=>sessionStorage.setItem('testPermission','prompt'));await fresh.reload();await fresh.waitForFunction(()=>[...document.querySelectorAll('[data-mirror-status]')].some(e=>e.textContent.includes('폴더 저장 실패')));
  assert.equal((await state(fresh)).requests,0);assert.equal((await state(fresh)).pickers,0);assert.equal(await guide(fresh).evaluate(e=>e.open),false);
  await fresh.locator('.topbar [data-action="folder-mirror"]').click();await fresh.evaluate(()=>window.testAllowPermission=true);await fresh.locator('[data-mirror-command="now"]').click();await saved(fresh);
  const s=await state(fresh);assert.equal(s.requests,1);assert.equal(s.config.folderName,folder);await fresh.locator('[data-mirror-close]').click();
 });
 await check('an existing unconnected user sees one concise prompt and can defer without repeated prompts',async()=>{
  const p=await openPage({seen:true});assert.equal(await guide(p).evaluate(e=>e.open),true);assert.equal(await p.locator('.guide-count').textContent(),'로컬 폴더 자동 저장');assert.ok(await button(p,'connect').isVisible());assert.equal(await p.evaluate(()=>window.testPickerCalls),0);
  await button(p,'next').click();assert.equal(await guide(p).evaluate(e=>e.open),false);await p.reload();await p.locator('.pkos-guide').waitFor({state:'attached'});assert.equal(await guide(p).evaluate(e=>e.open),false);
  await p.locator('[data-guide-open]').click();await button(p,'next').click();assert.ok(await button(p,'connect').isVisible());await button(p,'close').click();
 });
 await check('an existing user can connect from the concise prompt and finish it',async()=>{
  const p=await openPage({seen:true});await seed(p,'기존 사용자의 가상 기록');await button(p,'connect').click();await saved(p);await p.waitForFunction(()=>document.querySelector('[data-guide-folder-result]').textContent.includes('저장했습니다'));
  await button(p,'next').click();assert.equal(await guide(p).evaluate(e=>e.open),false);assert.ok((await state(p)).files.some(f=>f.text.includes('기존 사용자의 가상 기록')));await screenshot(p,'existing-user-connected');
 });
 await check('demo sessions never automatically prompt and keep the five-step manual tour',async()=>{
  const p=await openPage({demo:true});assert.equal(await guide(p).evaluate(e=>e.open),false);assert.equal(await p.evaluate(()=>window.testPickerCalls),0);
  await p.locator('[data-guide-open]').click();assert.match(await p.locator('.guide-count').textContent(),/1 \/ 5/);await button(p,'next').click();assert.equal(await button(p,'connect').isVisible(),false);await button(p,'close').click();
 });
 await check('unsupported browsers avoid upgrade prompting and offer Markdown export in the first tour',async()=>{
  const p=await openPage({seen:true,unsupported:true});assert.equal(await guide(p).evaluate(e=>e.open),false);
  const first=await openPage({unsupported:true});await button(first,'next').click();assert.equal(await button(first,'connect').isVisible(),false);assert.match(await first.locator('#guide-description').textContent(),/Markdown/);await button(first,'next').click();assert.match(await first.locator('#guide-title').textContent(),/한 줄/);await button(first,'close').click();
 });
 await check('narrow-screen setup keeps controls visible and allows keyboard dismissal',async()=>{
  const p=await openPage({seen:true,width:390,height:844});assert.ok(await button(p,'connect').isVisible());const r=await p.locator('.guide-card').boundingBox();assert.ok(r.x>=0&&r.x+r.width<=391);assert.ok(r.y>=0&&r.y+r.height<=845);
  const connectBox=await button(p,'connect').boundingBox(),nextBox=await button(p,'next').boundingBox();assert.ok(nextBox.y>=connectBox.y+connectBox.height+10,'folder and defer controls have a clear gap');
  await screenshot(p,'mobile-folder-step');await p.keyboard.press('Escape');assert.equal(await guide(p).evaluate(e=>e.open),false);assert.equal(await p.evaluate(()=>window.testPickerCalls),0);
 });
 await check('no uncaught page or console errors occur during setup, reload, cancellation or recovery',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);});
}finally{
 await writeFile(path.join(out,'verification.json'),JSON.stringify({base:BASE,isolatedStorage:'Disposable browser profiles and OPFS only',results,errors,consoleErrors},null,2));
 await Promise.all(contexts.map(ctx=>ctx.close()));await browser.close();
}
console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length,out}));
