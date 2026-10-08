import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser} from './browser-runtime.mjs';
const base=process.argv[2]||'http://127.0.0.1:8899/';
const out=process.env.PKOS_PAGES_TEST_OUT||'test-results/document-pages-20261009';await fs.mkdir(out,{recursive:true});
const pdf=await fs.readFile('tests/fixtures/document-pages.pdf');
const pptx=await fs.readFile('tests/fixtures/document-pages.pptx');
const browser=await launchBrowser(),checks=[],errors=[],consoleErrors=[];
const context=await browser.newContext({viewport:{width:1460,height:1000}});
await context.addInitScript(()=>{
 if(window!==top)return;
 localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');
 window.pickerCalls=0;
 window.showDirectoryPicker=async()=>{window.pickerCalls++;return (await navigator.storage.getDirectory()).getDirectoryHandle('isolated-page-images-test',{create:true});};
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
const click=action=>page.locator(`[data-action="${action}"]:visible`).first().click();
async function state(){return page.evaluate(async()=>{
 const {openStore}=await import('./store.js'),db=await openStore(false),config=await db.get('meta','folder-mirror-v1'),notes=await db.all('notes'),assets=await db.all('assets');
 const digest=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
 const files=[];const walk=async(dir,prefix='')=>{for await(const [name,entry]of dir.entries()){if(entry.kind==='directory')await walk(entry,prefix+name+'/');else{const f=await entry.getFile();files.push({path:prefix+name,hash:await digest(f),text:name.endsWith('.md')?await f.text():undefined});}}};
 if(config?.handle)await walk(config.handle);
 return {config:config?{...config,handle:undefined}:null,notes,assets:await Promise.all(assets.map(async a=>({id:a.id,name:a.name,type:a.type,size:a.blob.size,hash:await digest(a.blob)}))),files};
});}
async function waitState(predicate){for(let i=0;i<100;i++){const s=await state();if(predicate(s))return s;await page.waitForTimeout(100);}throw Error('Timed out waiting for page files');}
async function finished(){await page.locator('[data-page-conversion="close"]:not([disabled])').waitFor({timeout:120000});const status=await page.locator('.page-conversion-jobs').innerText();assert.match(status,/확인 완료/);await page.locator('[data-page-conversion="close"]').click();}
async function drop(name,mime,buffer){await page.evaluate(({name,mime,bytes})=>{const transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array(bytes)],name,{type:mime}));document.querySelector('.workspace').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));},{name,mime,bytes:[...buffer]});}
async function check(name,fn){await fn();checks.push(name);console.log('OK',name);}
try{
 await page.goto(base);await page.locator('.welcome').waitFor();
 await click('folder-mirror');await page.locator('[data-mirror-command="choose"]').click();await page.locator('[data-mirror-command="now"]:not([disabled])').waitFor();await page.locator('[data-mirror-close]').click();
 let noteId,sourceId,pageOne,pageTwo;
 await check('PDF drop saves two complete PNG pages and exact original in connected folder',async()=>{
  await drop('가상 수업.pdf','application/pdf',pdf);await finished();
  assert.equal(await page.locator('.document-page-card').count(),2);
  const s=await waitState(s=>s.files.filter(f=>f.path.endsWith('.png')).length===2);
  const note=s.notes[0];noteId=note.id;[pageOne,pageTwo]=note.documentPages;sourceId=pageOne.sourceAssetId;
  assert.equal(note.attachments.length,3);
  for(const asset of s.assets)assert.ok(s.files.some(f=>f.hash===asset.hash));
  const source=s.assets.find(a=>a.id===sourceId);assert.equal(source.size,pdf.length);
  assert.ok(s.assets.filter(a=>a.type==='image/png').every(a=>a.size>1000&&/00[12]\.png$/.test(a.name)));
  await page.screenshot({path:path.join(out,'pdf-page-images.png')});
 });
 await check('page opinions autosave separately and appear beside image links in local Markdown',async()=>{
  await page.locator('[data-action="page-edit"]').first().click();
  await page.locator('[data-page-comment]').first().fill('첫 페이지에 남긴 내 의견');await page.locator('[data-page-comment]').nth(1).fill('두 번째 페이지 질문');
  await page.locator('.doc-actions [data-action="save"]').click();await page.locator('#markdown').waitFor();
  const s=await waitState(s=>s.files.some(f=>f.text?.includes('두 번째 페이지 질문')));
  const md=s.files.find(f=>f.text?.includes('두 번째 페이지 질문')).text;assert.match(md,/!\[1페이지\]/);assert.match(md,/첫 페이지에 남긴 내 의견/);
  assert.deepEqual(s.notes[0].documentPages.map(p=>p.comment),['첫 페이지에 남긴 내 의견','두 번째 페이지 질문']);
 });
 await check('explicit page deletion removes only its local PNG; source and other page stay byte-identical',async()=>{
  const before=await state();const onePath=before.config.manifest.assets[pageOne.assetId].path;
  await page.locator('[data-action="page-delete"]').first().click();await click('ask-ok');
  const after=await waitState(s=>!s.files.some(f=>f.path===onePath));
  assert.equal(after.notes[0].documentPages[0].deleted,true);assert.equal(await page.locator('.document-page-card').count(),1);
  for(const id of [sourceId,pageTwo.assetId]){const f=before.files.find(f=>f.path===before.config.manifest.assets[id].path);assert.deepEqual(after.files.find(x=>x.path===f.path),f);}
  assert.ok(!after.files.find(f=>f.path.endsWith('.md')).text.includes('첫 페이지에 남긴 내 의견'));
 });
 await check('retry never resurrects deleted pages and reload reconnects saved folder without picker',async()=>{
  await click('page-convert');await finished();assert.equal(await page.locator('.document-page-card').count(),1);
  await page.reload();await page.locator('.document-page-card').waitFor();assert.equal(await page.evaluate(()=>window.pickerCalls),0);
  const s=await state();assert.equal(s.notes[0].documentPages.length,2);assert.equal(s.files.filter(f=>f.path.endsWith('.png')).length,1);
 });
 await check('restore recreates exact PNG and restores its own opinion',async()=>{
  await page.locator('.deleted-pages summary').click();await click('page-restore');
  const s=await waitState(s=>s.files.filter(f=>f.path.endsWith('.png')).length===2);
  assert.equal(s.notes[0].documentPages[0].comment,'첫 페이지에 남긴 내 의견');assert.equal(await page.locator('.document-page-card').count(),2);
  assert.ok(s.files.some(f=>f.hash===s.assets.find(a=>a.id===pageOne.assetId).hash));
 });
 await check('PPTX drop onto draft adds three independent slide PNGs while preserving draft text',async()=>{
  await click('edit');await page.locator('#edit-body').fill('슬라이드 넣기 전 적은 글');await drop('가상 슬라이드.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation',pptx);await finished();
  assert.equal(await page.locator('#edit-body').inputValue(),'슬라이드 넣기 전 적은 글');assert.equal(await page.locator('.document-page-card').count(),5);
  const s=await waitState(s=>s.files.filter(f=>f.path.endsWith('.png')).length===5);
  assert.equal(s.notes.length,1);assert.equal(s.notes[0].id,noteId);
  const slides=s.assets.filter(a=>a.name.startsWith('가상 슬라이드-'));assert.equal(slides.length,3);assert.equal(new Set(slides.map(a=>a.hash)).size,3);
  for(const asset of slides)assert.ok(s.files.some(f=>f.hash===asset.hash));
  await page.locator('.document-page-card').nth(2).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'slide-image-and-opinion.png')});
 });
 await check('mobile page layout and backup retain image identity, opinions, and deletion state',async()=>{
  await page.setViewportSize({width:390,height:844});await page.locator('.document-page-card').first().scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,'mobile-page-image.png')});
  const data=await page.evaluate(async()=>{const {openStore}=await import('./store.js'),{validateBackup}=await import('./core.js');return validateBackup(await(await openStore(false)).backup());});
  assert.equal(data.notes[0].documentPages.length,5);assert.equal(data.notes[0].documentPages[0].comment,'첫 페이지에 남긴 내 의견');
 });
 await check('reading export includes each opinion with its own selected PNG',async()=>{
  const html=await page.evaluate(async()=>{const {openStore}=await import('./store.js'),{buildReadingBundle}=await import('./reading-export.js');const db=await openStore(false),notes=await db.all('notes'),assets=await db.all('assets');return (await buildReadingBundle(notes,assets,{attachmentIds:notes.flatMap(n=>n.attachments)})).html;});
  assert.match(html,/첫 페이지에 남긴 내 의견/);assert.match(html,/두 번째 페이지 질문/);assert.equal((html.match(/<img /g)||[]).length,5);
 });
 await check('legacy PPT yields an actionable local-conversion message and keeps original',async()=>{
  await drop('옛자료.ppt','application/vnd.ms-powerpoint',Buffer.from('legacy'));
  await page.locator('[data-page-conversion="close"]:not([disabled])').waitFor();assert.match(await page.locator('.page-conversion-jobs').innerText(),/PPTX|pptx|PDF/);await page.locator('[data-page-conversion="close"]').click();
  const s=await state();assert.ok(s.assets.some(a=>a.name==='옛자료.ppt'));assert.equal(s.notes[0].documentPages.length,5);
 });
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
}catch(error){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(out,'failure.txt'),error.stack);throw error;}
finally{await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({base,checks,errors,consoleErrors},null,2));await browser.close();}
console.log(checks.length+' checks passed');
