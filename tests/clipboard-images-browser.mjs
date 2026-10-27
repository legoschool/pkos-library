// Fictional fixtures in an isolated library and OPFS mirror. Native clipboard tests
// require an explicit opt-in; synthetic paste coverage never changes the OS clipboard.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser,stubGoogle} from './browser-runtime.mjs';

const base=process.env.PKOS_TEST_URL||'http://127.0.0.1:8915/';
const out=process.env.PKOS_CLIPBOARD_TEST_OUT||'test-results/clipboard-images-20261015';
await fs.mkdir(out,{recursive:true});
const browser=await launchBrowser(),checks=[],errors=[],skips=[];
const context=await browser.newContext({viewport:{width:1366,height:900}});
await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:new URL(base).origin});
await context.addInitScript(()=>{
 if(window!==top)return;
 localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');
 window.showDirectoryPicker=async()=>(await navigator.storage.getDirectory()).getDirectoryHandle('isolated-clipboard-images-test',{create:true});
 const put=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);if(window.rejectClipboardSave&&this.name==='assets'){const transaction=this.transaction;queueMicrotask(()=>transaction.abort());}return request;};
 document.addEventListener('paste',event=>{if(window.__captureNativeClipboard){const files=[...event.clipboardData.items].filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter(Boolean);window.__nativePastedImages=Promise.all(files.map(async f=>({type:f.type,data:btoa(String.fromCharCode(...new Uint8Array(await f.arrayBuffer())))})));}},true);
});
await stubGoogle(context);
const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
const action=name=>page.locator(`[data-action="${name}"]:visible`).first().click();
const groups=()=>page.locator('#image-groups .image-group');
async function check(name,run){if(await run()===false){console.log('SKIP '+name);return;}checks.push(name);console.log('PASS '+name);}
async function state(){return page.evaluate(async()=>{const {openStore}=await import('./store.js'),{created,...backup}=await(await openStore(false)).backup();return backup;});}
async function waitState(predicate){for(let i=0;i<150;i++){const value=await state();if(predicate(value))return value;await page.waitForTimeout(100);}throw Error('Timed out waiting for saved clipboard image');}
async function mirrored(){return page.evaluate(async()=>{
 const {openStore}=await import('./store.js'),db=await openStore(false);
 return navigator.locks.request('pkos-folder-mirror-'+db.db.name,async()=>{
  const config=await db.get('meta','folder-mirror-v1'),files=[];
  async function walk(directory,prefix=''){for await(const [name,entry] of directory.entries()){if(entry.kind==='directory')await walk(entry,prefix+name+'/');else{const file=await entry.getFile();files.push({path:prefix+name,data:btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer()))),text:name.endsWith('.md')?await file.text():null});}}}
  if(config?.handle)await walk(config.handle);return {files,manifest:config?.manifest};
 });
});}
async function paste(selector,files=[],{text='',filesOnly=false,nonImageItems=false}={}){
 return page.evaluate(({selector,files,text,filesOnly,nonImageItems})=>{
  const target=document.querySelector(selector);if(!target)throw Error('Missing paste target: '+selector);
  const transfer=new DataTransfer();for(const file of files)transfer.items.add(new File([Uint8Array.from(atob(file.data),c=>c.charCodeAt(0))],file.name,{type:file.type}));if(text)transfer.setData('text/plain',text);
  const event=new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true});
  if(filesOnly||nonImageItems)Object.defineProperty(event,'clipboardData',{value:{items:nonImageItems?[{kind:'file',getAsFile:()=>new File(['capture metadata'],'capture.txt',{type:'text/plain'})}]:[],files:transfer.files,getData:type=>transfer.getData(type)}});
  target.dispatchEvent(event);return event.defaultPrevented;
 },{selector,files,text,filesOnly,nonImageItems});
}
async function clipboardSnapshot(){
 return page.evaluate(async()=>{
  if(!navigator.clipboard?.read||!navigator.clipboard?.write||!window.ClipboardItem)return false;
  try{const items=await navigator.clipboard.read();if(items.some(i=>i.types.some(t=>!['text/plain','text/html','image/png'].includes(t))))return false;
   window.__savedClipboard=await Promise.all(items.filter(item=>item.types.length).map(async item=>Object.fromEntries(await Promise.all(item.types.map(async type=>[type,await item.getType(type)])))));return true;
  }catch{return false;}
 });
}
async function clipboardRestore(){
 await page.evaluate(async()=>{
  if(!window.__savedClipboard)return;
  await navigator.clipboard.write(window.__savedClipboard.map(item=>new ClipboardItem(item)));
  const hash=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).join(',');
  const expected=await Promise.all(window.__savedClipboard.map(async item=>Promise.all(Object.entries(item).map(async([type,blob])=>[type,await hash(blob)]))));
  const actual=await Promise.all((await navigator.clipboard.read()).filter(item=>item.types.length).map(async item=>Promise.all(item.types.map(async type=>[type,await hash(await item.getType(type))]))));
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Clipboard restoration did not preserve its prior items');delete window.__savedClipboard;
 });
}
let photos,firstId,draftId,draftBody='붙여 넣기 전에 적어 둔 생각\n\n**마크다운**과 기존 내용을 유지합니다.',nativeClipboard='not-tested';
const own=s=>s.notes.find(n=>n.id===draftId);

try{
 await page.goto(base);await page.locator('.welcome').waitFor();
 photos=await page.evaluate(()=>['#447cc3','#ca684d'].map((color,i)=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,640,360);ctx.fillStyle='#fff';ctx.font='36px sans-serif';ctx.fillText('Fictional clipboard '+(i+1),35,185);return{name:'클립보드 가상 사진 '+(i+1)+'.png',type:'image/png',data:canvas.toDataURL('image/png').split(',')[1]};}));
 await action('folder-mirror');await page.locator('[data-mirror-command="choose"]').click();await page.locator('[data-mirror-command="now"]:not([disabled])').waitFor();await page.locator('[data-mirror-close]').click();
 await check('synthetic multi-image paste directly creates one photo record with original PNG bytes and no choice dialog',async()=>{
  assert.equal(await paste('.workspace',photos),true);await groups().locator('.image-group-expanded img').first().waitFor();
  const data=await waitState(s=>s.notes.length===1&&s.notes[0].imageGroups?.length===1),n=data.notes[0];firstId=n.id;
  assert.equal(n.attachments.length,2);assert.equal(n.imageGroups[0].mode,'expanded');assert.equal(data.assets.length,2);assert.equal(await page.locator('.media-choice-dialog').count(),0);
  for(let i=0;i<2;i++)assert.equal(data.assets.find(a=>a.id===n.imageGroups[0].assetIds[i]).data,photos[i].data);
  await groups().locator('[data-image-group-mode="slides"]').click();await waitState(s=>s.notes[0].imageGroups[0].mode==='slides');
  await groups().locator('[data-image-step="1"]').click();assert.match(await groups().locator('.image-group-count').innerText(),/2 \/ 2/);
 });
 await action('new');await page.locator('#edit-title').fill('이미지 붙여 넣기 가상 기록');await page.locator('#edit-body').fill(draftBody);
 draftId=(await waitState(s=>s.notes.some(n=>n.title==='이미지 붙여 넣기 가상 기록'&&n.body===draftBody))).notes.find(n=>n.title==='이미지 붙여 넣기 가상 기록').id;
 await check('native ClipboardItem PNG and Ctrl+V attach to the current draft; plain text keeps normal paste behavior',async()=>{
  if(process.env.PKOS_TEST_NATIVE_CLIPBOARD!=='1'){nativeClipboard='not-requested';skips.push('Native OS clipboard test requires PKOS_TEST_NATIVE_CLIPBOARD=1; synthetic paste coverage is enabled.');return false;}
  await page.bringToFront();if(!await clipboardSnapshot()){nativeClipboard='unavailable';skips.push('Native clipboard read/write could not be preserved safely; synthetic paste tests still run.');return false;}
  try{
   await page.evaluate(async data=>{window.__captureNativeClipboard=true;await navigator.clipboard.write([new ClipboardItem({'image/png':new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'image/png'})})]);},photos[0].data);
   await page.locator('#edit-body').focus();await page.keyboard.press('Control+v');await groups().locator('img').first().waitFor();
   const incoming=await page.evaluate(()=>window.__nativePastedImages);assert.equal(incoming.length,1);assert.equal(incoming[0].type,'image/png');
   const data=await waitState(s=>own(s).attachments.length===1);assert.equal(data.assets.find(a=>a.id===own(data).attachments[0]).data,incoming[0].data);assert.equal(own(data).body,draftBody);
   assert.match(data.assets.find(a=>a.id===own(data).attachments[0]).name,/\.png$/);await groups().locator('img').evaluate(el=>el.decode());
   await page.evaluate(async()=>{window.__captureNativeClipboard=false;await navigator.clipboard.writeText('\n일반 텍스트 붙여넣기');});await page.locator('#edit-body').focus();await page.locator('#edit-body').press('Control+End');await page.keyboard.press('Control+v');draftBody+='\n일반 텍스트 붙여넣기';
   assert.equal(await page.locator('#edit-body').inputValue(),draftBody);assert.equal(await page.locator('.media-choice-dialog').count(),0);await waitState(s=>own(s).body===draftBody);
  }finally{await clipboardRestore();}
  nativeClipboard='passed-restored';
 });
 await check('screenshot paste stays responsive during folder saving, attaches once, preserves drafts and mirrors exact PNG bytes',async()=>{
  const before=await state(),count=own(before).attachments.length;
  const groupCount=await groups().count();
  await page.evaluate(()=>{window.__heldMirror=navigator.locks.request('pkos-folder-mirror-pkem-real-personal-v1',async()=>{window.__mirrorHeld=true;await new Promise(resolve=>window.__releaseMirror=resolve);});});
  await page.waitForFunction(()=>window.__mirrorHeld);
  try{
   await page.locator('#edit-title').fill('캡처와 생각을 함께 저장');draftBody+='\n\n캡처 직전에 적은 의견';await page.locator('#edit-body').fill(draftBody);
   assert.equal(await paste('#edit-body',[{...photos[1],name:'image.png'}]),true);
   await page.waitForFunction(expected=>document.querySelectorAll('#image-groups .image-group').length===expected,groupCount+1,{timeout:2000});
   assert.equal((await state()).notes.find(note=>note.id===draftId).attachments.length,count+1);
  }finally{await page.evaluate(async()=>{window.__releaseMirror?.();await window.__heldMirror;delete window.__mirrorHeld;});}
  const data=await waitState(s=>own(s).attachments.length===count+1),saved=own(data),asset=data.assets.find(a=>a.id===saved.attachments.at(-1));
  assert.equal(saved.title,'캡처와 생각을 함께 저장');assert.equal(saved.body,draftBody);assert.equal(await page.locator('#edit-body').inputValue(),draftBody);
  assert.match(asset.name,/^붙여넣은-이미지-.*\.png$/);assert.equal(asset.data,photos[1].data);assert.equal(await page.locator('.media-choice-dialog').count(),0);
  let mirror;for(let i=0;i<150;i++){mirror=await mirrored();if(mirror.manifest?.assets[asset.id]&&mirror.files.some(file=>file.text?.includes(asset.name)))break;await page.waitForTimeout(100);}
  const entry=mirror.manifest.assets[asset.id],file=mirror.files.find(file=>file.path===entry.path);assert.equal(file.data,asset.data);
  assert.ok(mirror.files.some(file=>file.text?.includes(draftBody)&&file.text.includes(asset.name)));
 });
 await check('a pasted capture after long text is decoded and visible immediately; click and keyboard open a full preview without downloading',async()=>{
  const shortBody=draftBody,before=await state(),count=own(before).attachments.length;
  const earlierAssetId=own(before).attachments.at(-1);
  // A cold earlier thumbnail can expand after the pasted capture is revealed.
  // Delay its actual source, not the viewport assertion, to exercise that shift.
  await page.evaluate(id=>{
   const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');window.__restoreImageSource=()=>Object.defineProperty(HTMLImageElement.prototype,'src',descriptor);
   Object.defineProperty(HTMLImageElement.prototype,'src',{...descriptor,set(value){
    if(this.dataset.imageAsset===id&&!window.__earlierImageDelayed){window.__earlierImageDelayed=true;const image=this;setTimeout(()=>{descriptor.set.call(image,value);window.__earlierImageReleased=true;},500);}
    else descriptor.set.call(this,value);
   }});
  },earlierAssetId);
  draftBody+='\n\n'+Array.from({length:45},(_,index)=>(index+1)+'번째 긴 수업 기록: 사진을 붙여 넣은 위치에서도 새 이미지를 바로 확인합니다.').join('\n');
  await page.locator('#edit-body').fill(draftBody);assert.equal(await paste('#edit-body',[photos[0]]),true);
  const data=await waitState(s=>own(s).attachments.length===count+1),asset=data.assets.find(a=>a.id===own(data).attachments.at(-1));
  assert.equal(own(data).body,draftBody);assert.equal(await page.locator('#edit-body').inputValue(),draftBody);assert.equal(asset.data,photos[0].data);
  const image=page.locator('img[data-image-asset="'+asset.id+'"]'),button=page.locator('[data-image-preview-asset="'+asset.id+'"]');
  await page.waitForFunction(({id,earlierId})=>{
   const earlier=document.querySelector('img[data-image-asset="'+earlierId+'"]');if(!window.__earlierImageReleased||!earlier?.complete||!earlier.naturalWidth)return false;
   const image=document.querySelector('img[data-image-asset="'+id+'"]');if(!image?.complete||!image.naturalWidth)return false;
   const rect=image.getBoundingClientRect(),surface=image.closest('.document').getBoundingClientRect(),header=document.querySelector('.editor-header').getBoundingClientRect();
   return rect.width>0&&rect.height>0&&rect.top>=header.bottom-1&&rect.bottom<=surface.bottom+1;
  },{id:asset.id,earlierId:earlierAssetId},{timeout:5000});
  await page.evaluate(()=>{window.__restoreImageSource();delete window.__restoreImageSource;});
  await page.screenshot({path:path.join(out,'clipboard-preview-visible.png')});
  let downloads=0;const downloaded=()=>downloads++;page.on('download',downloaded);
  try{
   await button.click();const preview=page.locator('.image-preview-dialog[open]');await preview.locator('img').evaluate(el=>el.decode());
   assert.equal(await preview.locator('img').getAttribute('alt'),asset.name);assert.equal(await preview.locator('[data-image-preview-download]').getAttribute('download'),asset.name);
   assert.ok(await preview.locator('img').evaluate(el=>{const image=el.getBoundingClientRect(),stage=el.parentElement.getBoundingClientRect();return image.width>0&&image.height>0&&image.left>=stage.left&&image.right<=stage.right+1&&image.top>=stage.top&&image.bottom<=stage.bottom+1;}));
   await page.screenshot({path:path.join(out,'clipboard-preview-large.png')});await preview.locator('[data-image-preview-close]').click();await preview.waitFor({state:'detached'});
   await button.focus();await page.keyboard.press('Enter');await preview.locator('img').evaluate(el=>el.decode());await page.keyboard.press('Escape');await preview.waitFor({state:'detached'});
   await page.setViewportSize({width:390,height:844});await button.click();await preview.locator('img').evaluate(el=>el.decode());
   assert.ok(await preview.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}));
   await page.screenshot({path:path.join(out,'clipboard-preview-mobile.png')});await preview.locator('[data-image-preview-close]').click();await preview.waitFor({state:'detached'});
   assert.equal(downloads,0);assert.deepEqual(await state(),data);
  }finally{page.off('download',downloaded);await page.setViewportSize({width:1366,height:900});}
  draftBody=shortBody;await page.locator('#edit-body').fill(draftBody);await waitState(s=>own(s).body===draftBody);
 });
 await check('title, search, other editable fields, modal content and non-image text are not intercepted',async()=>{
  const before=await state();for(const selector of ['#edit-title','#search','#edit-tags'])assert.equal(await paste(selector,[photos[0]],{text:'가상 텍스트'}),false);
  assert.equal(await paste('#edit-body',[],{text:'가상 일반 텍스트'}),false);
  await page.evaluate(()=>{const el=document.createElement('div');el.contentEditable='true';el.id='clipboard-unrelated-editable';document.body.append(el);});assert.equal(await paste('#clipboard-unrelated-editable',[photos[0]]),false);await page.locator('#clipboard-unrelated-editable').evaluate(el=>el.remove());
  await action('settings');await page.locator('#dialog[open]').waitFor();assert.equal(await paste('#dialog',[photos[0]]),false);assert.equal(await paste('#edit-body',[photos[0]]),false);assert.equal(await page.locator('.media-choice-dialog').count(),0);await action('dialog-close');assert.deepEqual(await state(),before);
 });
 await check('clipboard files fallback and multi-image items append image groups without changing the body',async()=>{
  const before=await state(),count=own(before).attachments.length;assert.equal(await paste('#edit-body',[photos[0]],{filesOnly:true}),true);await waitState(s=>own(s).attachments.length===count+1);
  assert.equal(await paste('#edit-body',[photos[1]],{nonImageItems:true}),true);await waitState(s=>own(s).attachments.length===count+2);
  assert.equal(await paste('#edit-body',photos),true);const data=await waitState(s=>own(s).attachments.length===count+4),group=own(data).imageGroups.at(-1);
  assert.equal(group.assetIds.length,2);for(let i=0;i<2;i++)assert.equal(data.assets.find(a=>a.id===group.assetIds[i]).data,photos[i].data);assert.equal(own(data).body,draftBody);
  assert.equal(own(data).imageGroups.at(-2).mode,'expanded');assert.equal(group.mode,'expanded');await groups().last().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'clipboard-images-editor.png')});
 });
 await check('failed clipboard image storage leaves the complete prior note and PNG set available for retry',async()=>{
  const before=await state();await page.evaluate(()=>window.rejectClipboardSave=true);assert.equal(await paste('#edit-body',[photos[0]]),true);await page.waitForFunction(()=>/실패|오류|완료하지|저장하지/.test(document.querySelector('#toast').textContent));
  assert.deepEqual(await state(),before);assert.equal(await page.locator('#edit-body').inputValue(),draftBody);await page.evaluate(()=>window.rejectClipboardSave=false);
  assert.equal(await paste('#edit-body',[photos[0]]),true);await waitState(s=>own(s).attachments.length===own(before).attachments.length+1);
 });
 await check('rich and raw block editors accept images before the text-only paste handler without inserting clipboard text',async()=>{
  if(await page.locator('[data-action="editor-tools"]').getAttribute('aria-expanded')!=='true')await action('editor-tools');await page.getByRole('button',{name:'블록으로 편집',exact:true}).click();await page.locator('.block-rich').first().waitFor();
  let before=await state();assert.equal(await paste('.block-rich',[photos[0]],{text:'이 텍스트는 이미지와 중복 삽입하지 않습니다'}),true);let data=await waitState(s=>own(s).attachments.length===own(before).attachments.length+1);assert.equal(own(data).body,draftBody);
  if(await page.getByRole('button',{name:'블록으로 편집',exact:true}).count())await page.getByRole('button',{name:'블록으로 편집',exact:true}).click();
  const row=page.locator('.block-row').first();await row.locator('.block-menu summary').click();await row.locator('[data-block-action="raw"]').click();await page.locator('.block-raw').first().waitFor();
  before=await state();assert.equal(await paste('.block-raw',[photos[1]]),true);data=await waitState(s=>own(s).attachments.length===own(before).attachments.length+1);assert.equal(own(data).body,draftBody);
  await page.keyboard.press('Control+e');await page.locator('#markdown').waitFor();
 });
 await check('pasting while reading creates a separate record and reload keeps every prior image and text',async()=>{
  const before=await state();assert.equal(await paste('.document',[photos[1]]),true);const data=await waitState(s=>s.notes.length===before.notes.length+1);
  for(const n of before.notes)assert.deepEqual(data.notes.find(row=>row.id===n.id),n);const created=data.notes.find(n=>!before.notes.some(row=>row.id===n.id));assert.equal(created.attachments.length,1);assert.equal(data.assets.find(a=>a.id===created.attachments[0]).data,photos[1].data);
  await page.reload();await groups().locator('img').first().waitFor();await groups().locator('img').first().evaluate(el=>el.decode());assert.deepEqual(await state(),data);
  await page.goto(base+'#n='+draftId);await page.locator('#markdown').waitFor();assert.equal((await state()).notes.find(n=>n.id===draftId).body,draftBody);assert.equal((await state()).notes.find(n=>n.id===firstId).attachments.length,2);
 });
 await check('an older ungrouped image attachment renders in both reading and editing and opens the same preview',async()=>{
  const before=await state(),asset=before.assets.find(a=>a.id===own(before).attachments[0]);
  const legacyId=await page.evaluate(async assetId=>{const {openStore}=await import('./store.js'),{makeNote}=await import('./core.js'),db=await openStore(false);return (await db.save(makeNote({title:'이전 방식으로 첨부한 가상 사진',body:'기존 첨부도 사진으로 미리 봅니다.',attachments:[assetId]}),0)).id;},asset.id);
  await page.goto(base+'#n='+legacyId);await page.reload();await page.locator('#markdown').waitFor();const reader=page.locator('#attachments img[data-image-asset="'+asset.id+'"]');await reader.scrollIntoViewIfNeeded();await reader.evaluate(el=>el.decode());
  await reader.click();await page.locator('.image-preview-dialog[open] img').evaluate(el=>el.decode());await page.keyboard.press('Escape');await page.locator('.image-preview-dialog').waitFor({state:'detached'});
  await action('edit');const editor=page.locator('.editing-files .editing-image img[data-image-asset="'+asset.id+'"]');await editor.scrollIntoViewIfNeeded();await editor.evaluate(el=>el.decode());assert.equal(await groups().count(),0);
  const saved=await state();await editor.click();await page.locator('.image-preview-dialog[open] img').evaluate(el=>el.decode());await page.locator('[data-image-preview-close]').click();await page.locator('.image-preview-dialog').waitFor({state:'detached'});
  assert.deepEqual(await state(),saved);assert.equal(saved.assets.find(a=>a.id===asset.id).data,asset.data);await page.screenshot({path:path.join(out,'legacy-image-editor-preview.png')});
 });
 assert.deepEqual(errors,[]);await Promise.all(['failure.txt','failure.png'].map(file=>fs.rm(path.join(out,file),{force:true})));
}catch(error){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(out,'failure.txt'),error.stack);throw error;}
finally{await clipboardRestore().catch(error=>errors.push(error.message));await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({base,checks,errors,skips,nativeClipboard},null,2));await browser.close();}
console.log(checks.length+' checks passed; native clipboard: '+nativeClipboard);
