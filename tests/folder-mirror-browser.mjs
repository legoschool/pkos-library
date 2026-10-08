// All browser data and selected folders live in a disposable profile's OPFS.
// No actual local folder picker, user records, or cloud account is accessed.
// Usage: node tests/folder-mirror-browser.mjs [http://127.0.0.1:8898/]
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {launchBrowser,stubGoogle} from './browser-runtime.mjs';

const BASE=process.argv[2]||'http://127.0.0.1:8898/';
const out=fileURLToPath(new URL('../test-results/folder-mirror-20261008/',import.meta.url));
await mkdir(out,{recursive:true});
const browser=await launchBrowser(),results=[],errors=[],consoleErrors=[];
const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
const dir='pkos-folder-mirror-test-'+crypto.randomUUID();
await context.addInitScript(({dir})=>{
 localStorage.setItem('pkos-guide-v1','done');
 window.mirrorWriteCalls=0;window.mirrorRequestCalls=0;window.mirrorPickerCalls=0;
 window.showDirectoryPicker=async options=>{
  window.mirrorPickerCalls++;window.mirrorPickerMode=options.mode;
  if(window.mirrorCancelPicker)throw new DOMException('선택 취소 시험','AbortError');
  const root=await navigator.storage.getDirectory(),parent=await root.getDirectoryHandle(dir,{create:true});
  const file=await parent.getFileHandle('기존 사용자 파일.txt',{create:true}),writer=await file.createWritable();
  await writer.write('원래 폴더의 파일을 보존합니다.');await writer.close();return parent;
 };
 const write=FileSystemFileHandle.prototype.createWritable;
 FileSystemFileHandle.prototype.createWritable=function(...args){
  if(window.mirrorFailWrite&&this.name.endsWith('.md'))throw new DOMException('시험 폴더 저장 공간 부족','QuotaExceededError');
  window.mirrorWriteCalls++;return write.apply(this,args);
 };
 const query=FileSystemHandle.prototype.queryPermission,request=FileSystemHandle.prototype.requestPermission;
 FileSystemHandle.prototype.queryPermission=function(...args){return window.mirrorPermissionDenied?Promise.resolve('denied'):query.apply(this,args);};
 FileSystemHandle.prototype.requestPermission=function(...args){window.mirrorRequestCalls++;return window.mirrorPermissionDenied?Promise.resolve('denied'):request.apply(this,args);};
},{dir});
await stubGoogle(context);
const page=await context.newPage();
function observe(p){p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});}
observe(page);
const action=(name,p=page)=>p.locator(`[data-action="${name}"]:visible`).first().click();
const modal=(p=page)=>p.locator('.folder-mirror-dialog');
const command=(name,p=page)=>p.locator(`[data-mirror-command="${name}"]`);
const screenshot=name=>page.screenshot({path:path.join(out,name+'.png'),fullPage:false});
const open=async(p=page)=>{
 if(await modal(p).count())return;
 if(await p.locator('.topbar [data-action="folder-mirror"]:visible').count())await p.locator('.topbar [data-action="folder-mirror"]').click();
 else if(await p.locator('[data-action="folder-mirror"]:visible').count())await action('folder-mirror',p);
 else{await action('settings',p);await p.locator('#dialog [data-action="folder-mirror"]').click();}
 await modal(p).waitFor();
};
const close=async(p=page)=>{if(await modal(p).count())await p.locator('[data-mirror-close]').click();};
const ready=(p=page)=>p.waitForFunction(()=>!!document.querySelector('[data-mirror-command="now"]')&&!document.querySelector('[data-mirror-command="now"]').disabled);
const state=(p=page)=>p.evaluate(async()=>{
 const {openStore}=await import('./store.js'),db=await openStore(false),cfg=await db.get('meta','folder-mirror-v1');
 const files=[];
 async function walk(handle,base=''){
  for await(const [name,child]of handle.entries()){
   const path=base+name;
   if(child.kind==='directory')await walk(child,path+'/');
   else{const file=await child.getFile();files.push({path,bytes:[...new Uint8Array(await file.arrayBuffer())],text:/\.(md|json|txt)$/i.test(name)?await file.text():null});}
  }
 }
 if(cfg?.handle)await walk(cfg.handle);
 return {config:cfg?{...cfg,handle:undefined}:null,notes:await db.all('notes'),assets:(await db.all('assets')).map(a=>({id:a.id,name:a.name,type:a.type})),files:files.sort((a,b)=>a.path.localeCompare(b.path))};
});
async function mirrored(text,p=page){
 const started=Date.now();
 while(Date.now()-started<20000){
  const saved=await p.evaluate(async text=>{
  const {openStore}=await import('./store.js'),db=await openStore(false),cfg=await db.get('meta','folder-mirror-v1');
  if(!cfg?.handle||!cfg.lastAt)return false;
  for(const note of await db.all('notes')){
   if(!note.body.includes(text))continue;
   const name=cfg.manifest?.notes?.[note.id]?.path;if(!name)continue;
   try{let d=cfg.handle;const bits=name.split('/');for(const part of bits.slice(0,-1))d=await d.getDirectoryHandle(part);if((await(await(await d.getFileHandle(bits.at(-1))).getFile()).text()).includes(text))return true;}catch{}
  }
  return false;
  },text);
  if(saved)return;
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 throw Error('Timed out waiting for saved Markdown: '+text);
}
const noteFile=(s,id)=>s.files.find(f=>f.path===s.config.manifest.notes[id].path);
const replaceFile=(file,text)=>page.evaluate(async({file,text})=>{
 const {openStore}=await import('./store.js'),db=await openStore(false),cfg=await db.get('meta','folder-mirror-v1');
 let d=cfg.handle;const bits=file.split('/');for(const part of bits.slice(0,-1))d=await d.getDirectoryHandle(part);
 const handle=await d.getFileHandle(bits.at(-1)),writer=await handle.createWritable();await writer.write(text);await writer.close();
},{file,text});
const edit=async()=>{await close();if(!await page.locator('#edit-body').count())await action('edit');await page.locator('#edit-body').waitFor();};
const save=async text=>{await edit();await page.locator('#edit-body').fill(text);await page.locator('.doc-actions [data-action="save"]').click();await page.locator('.prose').waitFor();};
const holdMirror=async()=>{
 await page.evaluate(()=>{window.mirrorLockReady=false;void navigator.locks.request('pkos-folder-mirror-pkem-real-personal-v1',async()=>{window.mirrorLockReady=true;await new Promise(resolve=>window.releaseMirrorTestLock=resolve);});});
 await page.waitForFunction(()=>window.mirrorLockReady);
};
const releaseMirror=()=>page.evaluate(()=>window.releaseMirrorTestLock());
const mirrorBusy=()=>page.waitForFunction(()=>[...document.querySelectorAll('[data-mirror-status]')].some(e=>e.textContent==='로컬 폴더 저장 중'));
async function check(name,fn){
 try{await fn();results.push({name,pass:true});console.log('OK',name);}
 catch(e){results.push({name,pass:false,error:e.stack||e.message});console.error('FAIL',name,e.message);await screenshot('failure-'+results.length);await writeFile(path.join(out,'failure-state.json'),JSON.stringify(await state(),null,2));throw e;}
}
let noteId,originalNotePath;
const wav=Buffer.from('524946462800000057415645666d74201000000001000100401f0000803e000002001000646174610400000000000100','hex');
const webm=Buffer.from([0x1a,0x45,0xdf,0xa3,0x9f,0x42,0x86,0x81,0x01,0x42,0xf7,0x81,0x01,0,1,2,250,255]);
try{
 await page.goto(BASE);await page.locator('.welcome').waitFor();
 await check('first connection flushes the draft and creates readable Markdown plus exact WAV/WebM bytes in a dedicated folder',async()=>{
  await action('new');await page.locator('#edit-title').fill('가상 강의 받아쓰기 시험');await page.locator('#edit-body').fill('첨부 전 임시 글');
  await action('attach');await page.locator('#file-input').setInputFiles([{name:'가상 녹음.wav',mimeType:'audio/wav',buffer:wav},{name:'가상 녹음.webm',mimeType:'audio/webm',buffer:webm}]);
  await page.waitForFunction(()=>document.querySelectorAll('.editing-files>div').length===2);
  await page.locator('#edit-body').fill('최초 연결할 때 편집 중이던 받아쓴 글입니다.');
  await open();await command('choose').click();await mirrored('최초 연결할 때 편집 중이던 받아쓴 글입니다.');await ready();
  const s=await state();noteId=s.notes[0].id;originalNotePath=s.config.manifest.notes[noteId].path;
  assert.equal(s.config.enabled,true);assert.equal(s.notes.length,1);assert.equal(s.config.manifest.version,1);
  assert.ok(originalNotePath.includes('가상 강의 받아쓰기 시험'));assert.match(noteFile(s,noteId).text,/# 가상 강의 받아쓰기 시험/);
  for(const [name,expected]of [['가상 녹음.wav',wav],['가상 녹음.webm',webm]]){
   const a=s.assets.find(a=>a.name===name),entry=s.config.manifest.assets[a.id],file=s.files.find(f=>f.path===entry.path);
   assert.deepEqual(file.bytes,[...expected]);assert.ok(noteFile(s,noteId).text.includes(encodeURI(entry.path))||noteFile(s,noteId).text.includes(entry.path)||noteFile(s,noteId).text.includes(encodeURIComponent(path.posix.basename(entry.path))));
  }
  assert.equal(await page.evaluate(()=>window.mirrorPickerMode),'readwrite');
  assert.equal(await page.evaluate(async dir=>{const d=await(await navigator.storage.getDirectory()).getDirectoryHandle(dir);return(await(await d.getFileHandle('기존 사용자 파일.txt')).getFile()).text();},dir),'원래 폴더의 파일을 보존합니다.');
  assert.ok((await modal().innerText()).includes(s.config.folderName));await screenshot('desktop-connected');
 });
 await check('saving an unchanged record produces no duplicate files or writes',async()=>{
  const before=await state(),writes=await page.evaluate(()=>window.mirrorWriteCalls);await command('now').click();await ready();
  assert.deepEqual((await state()).files,before.files);assert.equal(await page.evaluate(()=>window.mirrorWriteCalls),writes);
 });
 await check('the editor Save button updates the linked Markdown file automatically',async()=>{
  await save('저장 버튼으로 보낸 수정 본문입니다.');await mirrored('저장 버튼으로 보낸 수정 본문입니다.');
  const s=await state();assert.equal(s.config.manifest.notes[noteId].path,originalNotePath);assert.equal(s.notes[0].body,'저장 버튼으로 보낸 수정 본문입니다.');
  assert.ok(await page.locator('[data-mirror-status]:visible').count());await screenshot('desktop-save-status');
 });
 await check('typing autosave also reaches the folder while the editor remains open',async()=>{
  await edit();await page.locator('#edit-body').fill('버튼을 누르지 않아도 자동 저장되는 글입니다.');await mirrored('버튼을 누르지 않아도 자동 저장되는 글입니다.');
  assert.equal(await page.locator('#edit-body').inputValue(),'버튼을 누르지 않아도 자동 저장되는 글입니다.');assert.ok(await page.locator('#edit-body').isVisible());
 });
 await check('typing during a clean Save waiting on the folder is committed before the editor closes',async()=>{
  await holdMirror();await page.locator('.doc-actions [data-action="save"]').click();await mirrorBusy();
  const latest='느린 폴더 저장을 기다리는 동안 새로 입력한 글도 남습니다.';await page.locator('#edit-body').fill(latest);await releaseMirror();
  await page.locator('.prose').waitFor();await mirrored(latest);assert.equal((await state()).notes.find(n=>n.id===noteId).body,latest);assert.ok((await page.locator('.prose').innerText()).includes(latest));
 });
 await check('navigation waits for edits typed during an earlier slow folder save instead of discarding the newer draft',async()=>{
  await edit();await holdMirror();await page.locator('#edit-body').fill('다른 메뉴를 열기 전에 저장할 첫 번째 글');await page.locator('.sidebar [data-view="favorites"]').click();await mirrorBusy();
  const latest='메뉴 이동의 저장을 기다리다가 더 쓴 마지막 문장입니다.';await page.locator('#edit-body').fill(latest);await releaseMirror();
  await page.waitForFunction(()=>document.querySelector('.sidebar [data-view="favorites"]').getAttribute('aria-current')==='page');
  await mirrored(latest);assert.equal((await state()).notes.find(n=>n.id===noteId).body,latest);
  await page.locator('.sidebar [data-view="all"]').click();await page.locator('.note-row').first().click();await edit();
 });
 await check('renaming a record creates the new title path and preserves the previous saved copy',async()=>{
  const previous=await state(),old=noteFile(previous,noteId);await page.locator('#edit-title').fill('이름을 바꾼 가상 강의');await page.locator('#edit-body').fill('제목을 바꾼 후의 본문입니다.');
  await page.locator('.doc-actions [data-action="save"]').click();await mirrored('제목을 바꾼 후의 본문입니다.');
  const s=await state();assert.notEqual(s.config.manifest.notes[noteId].path,old.path);assert.ok(s.config.manifest.notes[noteId].path.includes('이름을 바꾼 가상 강의'));assert.deepEqual(s.files.find(f=>f.path===old.path),old);
 });
 await check('an externally edited Markdown file is preserved and a conflict-free new copy receives the next save',async()=>{
  const previous=await state(),oldPath=previous.config.manifest.notes[noteId].path;await replaceFile(oldPath,'외부 편집기에서 쓴 소중한 원문');
  await save('외부 수정 후 앱에서 저장한 새 본문입니다.');await mirrored('외부 수정 후 앱에서 저장한 새 본문입니다.');
  const s=await state();assert.equal(s.files.find(f=>f.path===oldPath).text,'외부 편집기에서 쓴 소중한 원문');assert.notEqual(s.config.manifest.notes[noteId].path,oldPath);
 });
 await check('folder write failure is visible while browser data and prior file remain intact; retry saves the draft',async()=>{
  const previous=await state(),last=noteFile(previous,noteId);await page.evaluate(()=>window.mirrorFailWrite=true);await save('폴더 쓰기가 실패해도 브라우저에 남는 글입니다.');
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-mirror-status]')].some(e=>e.classList.contains('error')&&e.title.includes('저장 공간 부족')));
  let s=await state();assert.equal(s.notes.find(n=>n.id===noteId).body,'폴더 쓰기가 실패해도 브라우저에 남는 글입니다.');assert.equal(s.files.find(f=>f.path===last.path).text,last.text);assert.equal(s.config.lastAt,previous.config.lastAt);
  await open();await screenshot('desktop-write-failure');await page.evaluate(()=>window.mirrorFailWrite=false);await command('now').click();await mirrored('폴더 쓰기가 실패해도 브라우저에 남는 글입니다.');await ready();
 });
 await check('revoked write permission pauses folder saving with a visible recovery action and does not prompt automatically',async()=>{
  await page.evaluate(()=>window.mirrorPermissionDenied=true);const requested=await page.evaluate(()=>window.mirrorRequestCalls);await save('권한을 다시 허용하면 저장할 본문입니다.');
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-mirror-status]')].some(e=>e.classList.contains('error')&&e.title.includes('권한')));
  assert.equal(await page.evaluate(()=>window.mirrorRequestCalls),requested);assert.equal((await state()).notes.find(n=>n.id===noteId).body,'권한을 다시 허용하면 저장할 본문입니다.');
  await open();await command('now').click();await ready();assert.ok(await page.evaluate(()=>window.mirrorRequestCalls)>requested);
  await page.evaluate(()=>window.mirrorPermissionDenied=false);await command('now').click();await mirrored('권한을 다시 허용하면 저장할 본문입니다.');await ready();
 });
 await check('automatic folder saving can be switched off and resumed without deleting files',async()=>{
  await command('toggle').click();await ready();assert.equal((await state()).config.enabled,false);const previous=await state();
  await save('폴더 저장을 껐을 때 브라우저에만 저장한 글입니다.');
  await page.waitForFunction(()=>document.querySelector('.prose')?.textContent.includes('폴더 저장을 껐을 때 브라우저에만 저장한 글입니다.'));
  assert.deepEqual((await state()).files,previous.files);await open();
 });
 await check('manual folder Save protects an in-progress write from page unload even when automatic saving is off',async()=>{
  assert.equal((await state()).config.enabled,false);await holdMirror();await command('now').click();await mirrorBusy();
  assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),true);
  await releaseMirror();await ready();await mirrored('폴더 저장을 껐을 때 브라우저에만 저장한 글입니다.');assert.equal((await state()).config.enabled,false);
  await command('toggle').click();await page.waitForFunction(()=>document.querySelector('[data-mirror-command="toggle"]').textContent==='자동 저장 끄기');await ready();assert.equal((await state()).config.enabled,true);
 });
 await check('canceling folder selection preserves the existing connection and saved files',async()=>{
  const before=await state(),calls=await page.evaluate(()=>window.mirrorPickerCalls);await page.evaluate(()=>window.mirrorCancelPicker=true);await command('choose').click();
  await page.waitForFunction(calls=>window.mirrorPickerCalls>calls,calls);await ready();const after=await state();assert.equal(after.config.connection,before.config.connection);assert.equal(after.config.folderName,before.config.folderName);assert.deepEqual(after.files,before.files);await page.evaluate(()=>window.mirrorCancelPicker=false);
 });
 await check('the persisted folder handle survives reload and subsequent Save works without choosing again',async()=>{
  const before=await state();await page.reload();await page.locator('.page-title').waitFor();await open();await ready();const after=await state();assert.equal(after.config.connection,before.config.connection);assert.equal(after.config.folderName,before.config.folderName);
  await save('새로고침 후에도 같은 로컬 폴더에 저장합니다.');await mirrored('새로고침 후에도 같은 로컬 폴더에 저장합니다.');assert.equal(await page.evaluate(()=>window.mirrorPickerCalls),0);
 });
 await check('two tabs save the same committed snapshot without duplicate or conflicting copies',async()=>{
  const second=await context.newPage();observe(second);await second.goto(BASE);await second.locator('.page-title').waitFor();await open();await open(second);await ready();await ready(second);const before=await state();
  await holdMirror();
  await Promise.all([command('now').click(),command('now',second).click()]);
  await page.waitForFunction(()=>document.querySelector('[data-mirror-command="now"]').disabled);
  await second.waitForFunction(()=>document.querySelector('[data-mirror-command="now"]').disabled);
  assert.deepEqual((await state()).files,before.files);await releaseMirror();
  await ready();await ready(second);assert.deepEqual((await state()).files,before.files);assert.equal((await state(second)).config.connection,before.config.connection);await second.close();
 });
 await check('deleting a record in the browser never deletes already saved local files',async()=>{
  const before=await state();await page.evaluate(async id=>{const {openStore}=await import('./store.js'),db=await openStore(false),n=await db.get('notes',id);await db.save({...n,deleted:true},n.revision);},noteId);
  await command('now').click();await ready();assert.deepEqual((await state()).files,before.files);
 });
 await check('connection controls remain usable in a narrow mobile viewport',async()=>{
  await page.setViewportSize({width:390,height:844});assert.ok(await modal().evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
  for(const name of ['choose','now','toggle'])await command(name).click({trial:true});await screenshot('mobile-connected');
 });
 await check('unsupported browsers offer a clear manual export fallback and disable folder selection',async()=>{
  const other=await browser.newContext({viewport:{width:1100,height:800},serviceWorkers:'block'});await other.addInitScript(()=>{localStorage.setItem('pkos-guide-v1','done');window.showDirectoryPicker=undefined;});await stubGoogle(other);
  const q=await other.newPage();observe(q);await q.goto(BASE);await q.locator('.welcome').waitFor();await open(q);assert.equal(await command('choose',q).isDisabled(),true);assert.match(await modal(q).innerText(),/이 브라우저|지원하지/);assert.match(await modal(q).innerText(),/내보내기|묶음|Markdown/);await q.screenshot({path:path.join(out,'unsupported-browser.png')});await other.close();
 });
 await check('no uncaught JavaScript exceptions occur throughout saving and recovery',async()=>assert.deepEqual(errors,[]));
}catch(e){process.exitCode=1;console.error(e.stack||e);}
finally{
 await writeFile(path.join(out,'verification.json'),JSON.stringify({base:BASE,isolatedStorage:'Disposable browser profile and OPFS only',results,errors,consoleErrors},null,2));await browser.close();console.log(`${results.filter(r=>r.pass).length}/${results.length} passed`);
}
