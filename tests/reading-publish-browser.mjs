// Fictional notes and keys. The real publishing client runs against intercepted API responses; no document is published.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {unzipSync,strFromU8} from '../vendor/fflate.js';
import {launchBrowser} from './browser-runtime.mjs';

const base=process.env.PKOS_TEST_URL||'http://127.0.0.1:8899/';
const out=process.env.PKOS_PUBLISH_TEST_OUT||'test-results/reading-publish-20261013';
await fs.mkdir(out,{recursive:true});
const browser=await launchBrowser(),ctx=await browser.newContext({viewport:{width:1366,height:960},serviceWorkers:'block',acceptDownloads:true});
await ctx.addInitScript(()=>{
 localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');
 window.mockUploads=[];window.mockCopied=[];window.mockHoldUpload=false;
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>window.mockCopied.push(value)}});
});
const goodKey='mock-publisher-key-'+('a'.repeat(48)),badKey='mock-publisher-key-'+('b'.repeat(48));
const originalId='1'.repeat(32),otherId='2'.repeat(32);
let shares=[{id:originalId,title:'가상 기존 문서',url:'https://pkos-library.vercel.app/share.html?id='+originalId,updatedAt:'2026-10-12T10:00:00.000Z'},{id:otherId,title:'가상 다른 문서',url:'https://pkos-library.vercel.app/share.html?id='+otherId,updatedAt:'2026-10-12T09:00:00.000Z'}];
const requests=[],checks=[],errors=[],consoleErrors=[];let failPublish=true,failList=false,failDelete=false;
await ctx.route('**/vendor/reading-blob-client.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:"export async function upload(path,blob,options){window.mockUploads.push({path,bytes:Array.from(new Uint8Array(await blob.arrayBuffer())),payload:JSON.parse(options.clientPayload)});options.onUploadProgress?.({percentage:50});if(window.mockHoldUpload)await new Promise(resolve=>window.mockReleaseUpload=resolve);return {url:'https://fixture.invalid/uploaded.zip'};}"}));
await ctx.route('https://pkos-library.vercel.app/api/reading-shares**',async route=>{
 const request=route.request(),url=new URL(request.url()),op=url.searchParams.get('op');
 const headers={'Access-Control-Allow-Origin':new URL(base).origin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Content-Type':'application/json'};
 if(request.method()==='OPTIONS')return route.fulfill({status:204,headers,body:''});
 const body=request.postDataJSON();requests.push({op,method:request.method(),id:body?.id||url.searchParams.get('id'),title:body?.title});
 const answer=(status,value)=>route.fulfill({status,headers,body:JSON.stringify(value)});
 if(request.headers().authorization!=='Bearer '+goodKey)return answer(401,{error:'시험용 게시 키를 확인해 주세요.'});
 if(op==='status')return answer(200,{configured:true});
 if(op==='list')return failList?answer(503,{error:'시험용 목록 오류입니다.'}):answer(200,{shares});
 if(op==='publish'){
  if(failPublish)return answer(503,{error:'시험용 게시 실패입니다. 다시 시도해 주세요.'});
  const result={id:body.id,title:body.title,url:'https://pkos-library.vercel.app/share.html?id='+body.id,updatedAt:'2026-10-13T10:00:00.000Z'};
  shares=[result,...shares.filter(share=>share.id!==result.id)];return answer(200,result);
 }
 if(op==='delete'){
  if(failDelete)return answer(503,{error:'시험용 삭제 오류입니다.'});
  shares=shares.filter(share=>share.id!==url.searchParams.get('id'));return answer(200,{ok:true});
 }
 if(op==='discard')return answer(200,{ok:true});
 return answer(400,{error:'지원하지 않는 시험 요청입니다.'});
});
await ctx.route('https://pkos-library.vercel.app/share.html?*',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>가상 공유 문서</title><p id="shared-fixture">가상 공유 주소 열기 검증</p>'}));
const p=await ctx.newPage();p.on('pageerror',error=>errors.push(error.message));p.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
const d=()=>p.locator('.reading-export-dialog'),control=name=>d().locator('[data-reading="'+name+'"]');
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function preview(){await control('preview').click();await p.waitForFunction(()=>document.querySelector('.reading-export-dialog')?.getAttribute('aria-busy')==='false'&&!document.querySelector('[data-reading=download]').disabled);}
async function idle(){await p.waitForFunction(()=>document.querySelector('.reading-export-dialog')?.getAttribute('aria-busy')==='false');}
async function showManager(){if(!await d().locator('[data-reading-manager]').evaluate(el=>el.open))await d().locator('[data-reading-manager]>summary').click();await idle();}
try{
 await p.goto(base);await p.locator('.welcome').waitFor();
 await p.evaluate(async()=>{
  const {openStore}=await import('./store.js'),{makeNote}=await import('./core.js'),db=await openStore(false);
  const first=makeNote({id:'publish-fixture-a',title:'가상 공유 자료',body:'# 선택한 본문\n\n이 글만 함께 읽습니다.\n\n[다른 기록](#note=private-fixture)\n\n<script>window.unwanted=1</script>',folder:'PRIVATE_FOLDER_MARKER',tags:['PRIVATE_TAG_MARKER'],folderSource:{path:'PRIVATE_SOURCE_PATH_MARKER'},attachments:['fixture-selected-file','fixture-private-file'],links:['private-fixture'],revision:1});
  const privateNote=makeNote({id:'private-fixture',title:'PRIVATE_TITLE_MARKER',body:'PRIVATE_BODY_MARKER',revision:1});
  await db.batch({notes:[first,privateNote],assets:[{id:'fixture-selected-file',name:'가상 선택 첨부.txt',type:'text/plain',blob:new Blob(['SELECTED_ATTACHMENT_BYTES'])},{id:'fixture-private-file',name:'제외할 첨부.txt',type:'text/plain',blob:new Blob(['PRIVATE_ATTACHMENT_BYTES'])}]});
 });
 await p.reload();await p.locator('.page-title').waitFor();await p.locator('[data-action=settings]:visible').first().click();await p.locator('#dialog [data-action=export-reading]').click();
 await check('unconfigured sharing requires a preview and keeps metadata and attachments excluded by default',async()=>{
  assert.equal(await d().locator('h2').innerText(),'웹으로 공유하기');assert.match(await d().locator('.reading-audience').innerText(),/링크를 아는 사람은 누구나 읽을 수 있습니다/);
  assert.equal(await d().locator('[data-reading-meta]').isChecked(),false);assert.equal(await d().locator('[data-reading-note]:checked').count(),0);assert.equal(await control('publish').isDisabled(),true);assert.equal(await control('download').isDisabled(),true);
  await d().locator('[data-reading-note="publish-fixture-a"]').check();await d().locator('[data-reading-title]').fill('가상 공유 제목');await preview();
  assert.equal(await control('download').isEnabled(),true);assert.equal(await control('publish').isDisabled(),true);assert.equal(await d().locator('[data-reading-asset]:checked').count(),0);
  await d().screenshot({path:path.join(out,'unconfigured-preview.png')});
 });
 await check('configuration errors preserve the preview and selection; a valid mocked key enables publication',async()=>{
  const source=await d().locator('iframe').getAttribute('srcdoc');await d().locator('[data-reading-key]').fill(badKey);await control('configure').click();await idle();
  assert.match(await d().locator('[data-reading-status]').innerText(),/시험용 게시 키/);assert.equal(await d().locator('iframe').getAttribute('srcdoc'),source);assert.equal(await d().locator('[data-reading-note]:checked').count(),1);assert.equal(await control('publish').isDisabled(),true);
  await d().locator('[data-reading-key]').fill(goodKey);await control('configure').click();await idle();assert.equal(await control('publish').isEnabled(),true);assert.equal(await d().locator('[data-reading-key]').inputValue(),'');assert.equal(await d().locator('iframe').getAttribute('srcdoc'),source);
 });
 await check('changing the reviewed selection disables publication until a new preview',async()=>{
  await d().locator('[data-reading-title]').fill('가상 최종 공유 제목');assert.equal(await control('publish').isDisabled(),true);assert.equal(await control('download').isDisabled(),true);await preview();
  await d().locator('[data-reading-note="private-fixture"]').check();assert.equal(await control('publish').isDisabled(),true);await d().locator('[data-reading-note="private-fixture"]').uncheck();await preview();
 });
 await check('publication failure keeps the exact preview and selection, and uploaded files exclude private data',async()=>{
  const source=await d().locator('iframe').getAttribute('srcdoc');await control('publish').click();await idle();assert.match(await d().locator('[data-reading-status]').innerText(),/시험용 게시 실패/);
  assert.equal(await d().locator('iframe').getAttribute('srcdoc'),source);assert.equal(await d().locator('[data-reading-note]:checked').count(),1);assert.equal(await control('publish').isEnabled(),true);assert.equal(await d().locator('[data-reading-result]').isVisible(),false);
  const upload=await p.evaluate(()=>window.mockUploads.at(-1)),files=unzipSync(Uint8Array.from(upload.bytes)),html=strFromU8(files['index.html']);
  assert.equal(Object.keys(files).length,2);assert.match(html,/선택한 본문/);
  for(const secret of ['PRIVATE_BODY_MARKER','PRIVATE_TITLE_MARKER','PRIVATE_SOURCE_PATH_MARKER','PRIVATE_FOLDER_MARKER','PRIVATE_TAG_MARKER','PRIVATE_ATTACHMENT_BYTES','publish-fixture-a','private-fixture','<script>'])assert.equal(html.includes(secret),false,secret+' is excluded');
  assert.ok(requests.some(request=>request.op==='discard'),'failed publication discards only its uncommitted version');
 });
 await check('duplicate publication clicks are blocked and successful addresses can be copied and opened',async()=>{
  failPublish=false;await p.evaluate(()=>window.mockHoldUpload=true);const count=await p.evaluate(()=>window.mockUploads.length);await control('publish').click();await p.waitForFunction(()=>!!window.mockReleaseUpload);
  assert.equal(await control('publish').isDisabled(),true);assert.equal(await d().locator('[data-reading-title]').isDisabled(),true);
  await control('publish').evaluate(button=>button.dispatchEvent(new MouseEvent('click',{bubbles:true})));assert.equal(await p.evaluate(()=>window.mockUploads.length),count+1);
  await p.evaluate(()=>{window.mockHoldUpload=false;window.mockReleaseUpload();window.mockReleaseUpload=null;});await idle();
  const url=await d().locator('[data-reading-url]').inputValue();assert.match(url,/^https:\/\/pkos-library\.vercel\.app\/share\.html\?id=[a-f0-9]{32}$/);assert.equal(await d().locator('[data-reading-url]').getAttribute('readonly'),'');
  await control('copy-url').click();assert.equal(await p.evaluate(()=>window.mockCopied.at(-1)),url);
  const popupPromise=p.waitForEvent('popup');await d().locator('[data-reading-open]').click();const popup=await popupPromise;await popup.locator('#shared-fixture').waitFor();assert.equal(popup.url(),url);await popup.close();
  await d().screenshot({path:path.join(out,'published-address.png')});
 });
 await check('choosing a listed document updates its same ID and explicit new publication creates a different ID',async()=>{
  await showManager();await p.waitForFunction(()=>document.querySelectorAll('.reading-share-row').length===3);
  await d().locator('[data-reading=update-share][data-reading-share-id="'+originalId+'"]').click();assert.match(await d().locator('[data-reading-target-label]').innerText(),/가상 기존 문서/);
  await control('publish').click();await idle();assert.equal(requests.filter(request=>request.op==='publish').at(-1).id,originalId);assert.ok((await d().locator('[data-reading-url]').inputValue()).endsWith(originalId));
  await control('new-share').click();assert.equal(await d().locator('[data-reading-result]').isVisible(),false);await control('publish').click();await idle();assert.notEqual(requests.filter(request=>request.op==='publish').at(-1).id,originalId);
 });
 await check('list and deletion failures keep existing documents and confirmed deletion removes only the selected share',async()=>{
  await showManager();failList=true;const count=await d().locator('.reading-share-row').count();await control('refresh-shares').click();await idle();assert.match(await d().locator('[data-reading-shares-status]').innerText(),/시험용 목록 오류/);assert.equal(await d().locator('.reading-share-row').count(),count);failList=false;
  const deleting=d().locator('[data-reading=delete-share][data-reading-share-id="'+otherId+'"]');p.once('dialog',dialog=>dialog.dismiss());await deleting.click();assert.equal(await d().locator('.reading-share-row').count(),count);
  failDelete=true;p.once('dialog',dialog=>dialog.accept());await deleting.click();await idle();assert.match(await d().locator('[data-reading-status]').innerText(),/시험용 삭제 오류/);assert.equal(await d().locator('.reading-share-row').count(),count);
  failDelete=false;p.once('dialog',dialog=>dialog.accept());await deleting.click();await idle();assert.equal(await d().locator('.reading-share-row').count(),count-1);assert.equal(await deleting.count(),0);
 });
 await check('explicit attachment selection is preserved in ZIP publication and mobile controls fit',async()=>{
  await d().locator('details:has([data-reading-assets]) > summary').click();await d().locator('[data-reading-asset="fixture-selected-file"]').check();assert.equal(await control('publish').isDisabled(),true);await preview();await control('publish').click();await idle();
  const upload=await p.evaluate(()=>window.mockUploads.at(-1)),files=unzipSync(Uint8Array.from(upload.bytes)),attachment=Object.entries(files).filter(([name])=>name.startsWith('attachments/'));assert.equal(attachment.length,1);assert.equal(strFromU8(attachment[0][1]),'SELECTED_ATTACHMENT_BYTES');assert.equal(Object.values(files).some(bytes=>strFromU8(bytes).includes('PRIVATE_ATTACHMENT_BYTES')),false);
  for(const width of [390,320]){await p.setViewportSize({width,height:844});assert.equal(await d().evaluate(el=>{const r=el.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth+1&&el.scrollWidth<=el.clientWidth+1;}),true);await d().evaluate(el=>el.scrollTop=el.scrollHeight);await p.screenshot({path:path.join(out,'mobile-'+width+'-management.png')});}
 });
 assert.deepEqual(errors,[]);assert.ok(consoleErrors.every(message=>/Failed to load resource: the server responded with a status of (401|503)/.test(message)),consoleErrors.join('\n'));
 await fs.rm(path.join(out,'failure.png'),{force:true});
}catch(error){await p.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({base,checks,errors,expectedFailureConsoleMessages:consoleErrors,requests},null,2));await browser.close();}
console.log(checks.length+' checks passed');
