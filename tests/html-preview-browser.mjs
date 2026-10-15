// Fictional HTML files in an isolated browser profile. No imported asset may contact a server.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser} from './browser-runtime.mjs';

const base=process.env.PKOS_TEST_URL||'http://127.0.0.1:8915/';
const out='test-results/html-preview-20261015';
await fs.mkdir(out,{recursive:true});
const origin=new URL(base).origin;
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZAAAAABJRU5ErkJggg==';
const source=`\uFEFF<!doctype html>\r\n<html lang="ko"><head><meta charset="utf-8"><title>가상 수업 자료</title><style>body{margin:0;padding:18px;font-family:sans-serif}#lesson-title{color:rgb(21,85,121)}.lesson-card{background:rgb(232,243,246);padding:20px;border-radius:12px;max-width:640px}</style></head><body><article class="lesson-card"><h1 id="lesson-title">끌어 놓은 HTML 수업 자료</h1><a id="internal-link" href="#lesson-copy">문서 안 설명으로 이동</a><p id="lesson-copy" style="font-weight:700">색과 글을 보존한 가상 미리보기입니다.</p><img id="embedded-image" alt="문서에 포함된 그림" src="${pixel}" width="64" height="64"></article></body></html>\r\n`;
const first={name:'가상 수업 자료.html',mimeType:'text/html',buffer:Buffer.from(source)};
const upper={name:'대문자 확장자.HTM',mimeType:'application/octet-stream',buffer:Buffer.from('<!doctype html><html><body><h1 id="uppercase-title">대문자 HTM 문서</h1><p>파일 이름으로 찾은 자료입니다.</p></body></html>')};
const mime={name:'확장자 없는 웹문서',mimeType:'text/html',buffer:Buffer.from('<!doctype html><html><body><h1 id="mime-title">MIME으로 찾은 HTML</h1><p>확장자가 없어도 미리 봅니다.</p></body></html>')};
const textFile={name:'함께 넣은 메모.txt',mimeType:'text/plain',buffer:Buffer.from('HTML 선택 목록에 들어가면 안 되는 가상 텍스트 파일')};
const remote='https://html-preview-probe.invalid/__html_preview_probe';
const local=new URL('__html_preview_probe',base).href;
const hostile={name:'격리 확인.html',mimeType:'text/html',buffer:Buffer.from(`<!doctype html><html><head>
<meta http-equiv="refresh" content="0;url=${remote}/refresh"><base href="${remote}/">
<link rel="stylesheet" href="${remote}/sheet.css"><link rel="preload" as="image" href="${remote}/preload.png">
<style>@import url('${remote}/import.css');@font-face{font-family:Probe;src:url('${remote}/font.woff2')}#hostile-title{color:rgb(75,35,99);font-family:Probe,sans-serif;background-image:url('${remote}/background.png')}</style>
<script>document.body.dataset.scriptRan='yes';top.document.body.dataset.htmlPreviewEscaped='yes';fetch('${remote}/fetch')</script>
<script src="${local}/script.js"></script></head><body onload="top.document.body.dataset.htmlPreviewEscaped='yes'">
<h1 id="hostile-title">격리된 문서의 읽을 수 있는 내용</h1><img src="${remote}/image.png" onerror="top.document.body.dataset.htmlPreviewEscaped='yes'">
<img srcset="${remote}/srcset.png 1x, ${remote}/srcset-2x.png 2x" src="${local}/image.png">
<iframe src="${remote}/iframe"></iframe><object data="${remote}/object"></object><embed src="${remote}/embed">
<video poster="${remote}/poster.png" src="${remote}/movie.mp4" autoplay></video><audio src="${remote}/audio.mp3" autoplay></audio>
<form action="${remote}/submit" target="_top"><input name="value" value="fictional"><button type="submit">보내기</button></form>
<p style="background-image:url('${local}/inline.png')">안전한 본문은 읽을 수 있습니다.</p></body></html>`)};
const allFiles=[first,textFile,upper,mime,hostile];
const title='HTML을 보면서 작성하는 가상 기록';
const draft='미리보기를 닫아도 남아야 하는 내 초안\n\n한글과 **서식**, 작성 중인 생각을 그대로 보존합니다.';
const checks=[],errors=[],probeRequests=[],externalRequests=[],dispatchedProbes=[],requestFailures=[],measurements=[];
let passed=false,failure;
const browser=await launchBrowser();
const ctx=await browser.newContext({viewport:{width:1366,height:900},acceptDownloads:true});
await ctx.addInitScript(()=>{if(window===top){localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');}});
await ctx.route('**/*',route=>{
 const url=route.request().url();
 if(url.includes('__html_preview_probe')||(/^https?:/.test(url)&&new URL(url).origin!==origin)){dispatchedProbes.push(url);return route.abort();}
 return route.continue();
});
ctx.on('request',request=>{const url=request.url();if(url.includes('__html_preview_probe'))probeRequests.push(url);if(/^https?:/.test(url)&&new URL(url).origin!==origin)externalRequests.push(url);});
ctx.on('requestfailed',request=>{if(request.url().includes('__html_preview_probe'))requestFailures.push({url:request.url(),failure:request.failure()?.errorText});});
const p=await ctx.newPage();
p.setDefaultTimeout(15000);
p.on('pageerror',error=>errors.push(error.message));
const action=name=>p.locator(`[data-action="${name}"]:visible`).first().click();
const frame=()=>p.frameLocator('#dialog iframe.html-preview-frame');
const close=()=>action('dialog-close');
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function previewReady(selector){
 await p.locator('#dialog[open] iframe.html-preview-frame').waitFor();
 await frame().locator(selector).waitFor();
 assert.equal(await p.locator('#dialog iframe.html-preview-frame').getAttribute('sandbox'),'','HTML frame has no sandbox permissions');
}
async function drop(files){
 const prevented=await p.evaluate(items=>{
  const transfer=new DataTransfer();
  for(const item of items){const bytes=Uint8Array.from(atob(item.data),c=>c.charCodeAt(0));transfer.items.add(new File([bytes],item.name,{type:item.type}));}
  const over=new DragEvent('dragover',{dataTransfer:transfer,bubbles:true,cancelable:true});document.dispatchEvent(over);
  const event=new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true});document.dispatchEvent(event);
  return {dragover:over.defaultPrevented,drop:event.defaultPrevented};
 },files.map(file=>({name:file.name,type:file.mimeType,data:file.buffer.toString('base64')})));
 assert.deepEqual(prevented,{dragover:true,drop:true},'dropping never navigates away from the app');
}
async function downloadOriginal(file){
 assert.equal(await p.locator('#dialog [data-html-download]').getAttribute('download'),file.name);
 const downloadPromise=p.waitForEvent('download');await p.locator('#dialog [data-html-download]').click();const download=await downloadPromise;
 // Chromium may add .htm to extensionless text/html downloads; the supplied name and bytes remain original.
 if(/\.[^./]+$/.test(file.name))assert.equal(download.suggestedFilename(),file.name);
 else assert.ok([file.name,file.name+'.htm',file.name+'.html'].includes(download.suggestedFilename()));
 assert.ok((await fs.readFile(await download.path())).equals(file.buffer),file.name+' original bytes, including BOM and line endings, are unchanged');
}
async function sameDraft(){assert.equal(await p.locator('#edit-title').inputValue(),title);assert.equal(await p.locator('#edit-body').inputValue(),draft);}
async function reopen(file,mode,selector){
 const row=p.locator(mode==='editor'?'.editing-files>div':'.attachment-card').filter({hasText:file.name});
 await row.locator('[data-action="preview-html"]').click();await previewReady(selector);
}
try{
 await p.goto(base);await p.locator('.welcome').waitFor();
 await check('reader drop immediately opens rendered HTML with inline CSS, embedded image and unchanged original download',async()=>{
  await drop([first]);await previewReady('#lesson-title');
  assert.equal(await frame().locator('#lesson-title').innerText(),'끌어 놓은 HTML 수업 자료');
  assert.equal(await frame().locator('#lesson-title').evaluate(el=>getComputedStyle(el).color),'rgb(21, 85, 121)');
  assert.equal(await frame().locator('#lesson-copy').evaluate(el=>getComputedStyle(el).fontWeight),'700');
  assert.equal(await frame().locator('.lesson-card').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(232, 243, 246)');
  await frame().locator('#embedded-image').evaluate(el=>el.decode());
  assert.equal(await frame().locator('#embedded-image').evaluate(el=>el.naturalWidth),1);
  const appUrl=p.url();await frame().locator('#internal-link').click();await previewReady('#lesson-copy');
  assert.equal(p.url(),appUrl,'internal document links retain the app location');
  assert.equal(await frame().locator('#lesson-title').innerText(),'끌어 놓은 HTML 수업 자료','internal navigation keeps the HTML document');
  assert.equal(await p.locator('#dialog [data-html-select]').count(),0,'one HTML file needs no selector');
  await downloadOriginal(first);await p.screenshot({path:path.join(out,'reader-auto-preview.png')});await close();
  await p.locator('.attachment-card [data-action="preview-html"]').waitFor();
 });
 await action('edit');await p.locator('#edit-title').fill(title);await p.locator('#edit-body').fill(draft);
 await check('editor drop detects uppercase HTM and MIME-only HTML, opens first HTML and switches the batch without losing the draft',async()=>{
  await drop([textFile,upper,mime]);await previewReady('#uppercase-title');
  const selector=p.locator('#dialog [data-html-select]');
  assert.deepEqual(await selector.locator('option').allTextContents(),[upper.name,mime.name],'only HTML files from this import appear, in import order');
  await selector.selectOption({label:mime.name});await previewReady('#mime-title');await downloadOriginal(mime);
  await selector.selectOption({label:upper.name});await previewReady('#uppercase-title');await downloadOriginal(upper);
  await p.screenshot({path:path.join(out,'editor-batch-preview.png')});await close();await sameDraft();
  assert.equal(await p.locator('.editing-files>div').count(),4);
  await reopen(first,'editor','#lesson-title');await close();await sameDraft();
 });
 await check('file picker automatically previews HTML while scripts, remote resources, forms and parent access remain isolated',async()=>{
  const existingPages=ctx.pages().length;
  await action('attach');await p.locator('#file-input').setInputFiles(hostile);await previewReady('#hostile-title');
  assert.equal(await frame().locator('#hostile-title').innerText(),'격리된 문서의 읽을 수 있는 내용');
  assert.equal(await frame().locator('#hostile-title').evaluate(el=>getComputedStyle(el).color),'rgb(75, 35, 99)');
  const sandbox=await frame().locator('body').evaluate(el=>{
   let parentBlocked=false;try{void parent.document.body;}catch(error){parentBlocked=error.name==='SecurityError';}
   for(const form of document.forms)form.requestSubmit();
   return {parentBlocked,scriptRan:el.dataset.scriptRan||null};
  });
  assert.deepEqual(sandbox,{parentBlocked:true,scriptRan:null});
  // Give refresh, resource loading and blocked form submission a chance to report requests.
  await p.waitForTimeout(350);
  assert.equal(await p.locator('body').getAttribute('data-html-preview-escaped'),null);
  assert.equal(new URL(p.url()).origin,origin);assert.deepEqual(dispatchedProbes,[],'CSP prevents network dispatch before the defensive route interceptor');
  assert.equal(ctx.pages().length,existingPages,'HTML cannot create additional tabs');
  await downloadOriginal(hostile);await p.screenshot({path:path.join(out,'isolated-preview.png')});await close();await sameDraft();
 });
 await check('saving and reader previews retain all original files and the written draft',async()=>{
  await p.keyboard.press('Control+e');await p.locator('#markdown').waitFor();
  assert.match(await p.locator('#markdown').innerText(),/미리보기를 닫아도 남아야 하는 내 초안/);
  assert.equal(await p.locator('.attachment-card').count(),allFiles.length);
  for(const [file,selector]of [[first,'#lesson-title'],[upper,'#uppercase-title'],[mime,'#mime-title'],[hostile,'#hostile-title']]){await reopen(file,'reader',selector);await close();}
  const backup=await p.evaluate(async()=>{const {openStore}=await import('./store.js');return(await openStore(false)).backup();});
  assert.equal(backup.notes.length,1);assert.equal(backup.notes[0].title,title);assert.equal(backup.notes[0].body,draft);
  assert.equal(backup.assets.length,allFiles.length);
  for(const file of allFiles)assert.equal(backup.assets.find(asset=>asset.name===file.name)?.data,file.buffer.toString('base64'),file.name+' persisted unchanged');
 });
 await check('reload rebuilds reader and editor preview buttons from saved attachments',async()=>{
  await p.reload();await p.locator('.attachment-card [data-action="preview-html"]').first().waitFor();
  assert.equal(await p.locator('.attachment-card [data-action="preview-html"]').count(),4);
  await reopen(first,'reader','#lesson-title');await downloadOriginal(first);await close();
  await action('edit');await sameDraft();assert.equal(await p.locator('.editing-files [data-action="preview-html"]').count(),4);
  await reopen(mime,'editor','#mime-title');await close();await sameDraft();
 });
 await check('390px dialog, iframe and readable document fit the mobile viewport',async()=>{
  await p.setViewportSize({width:390,height:844});await reopen(first,'editor','#lesson-title');
  const geometry=await p.locator('#dialog').evaluate(el=>{const frame=el.querySelector('iframe'),r=el.getBoundingClientRect(),f=frame.getBoundingClientRect();return {viewport:innerWidth,dialogLeft:r.left,dialogRight:r.right,dialogOverflow:el.scrollWidth-el.clientWidth,frameLeft:f.left,frameRight:f.right,pageOverflow:document.documentElement.scrollWidth-innerWidth};});
  measurements.push(geometry);assert.ok(geometry.dialogLeft>=-1&&geometry.dialogRight<=391,JSON.stringify(geometry));
  assert.ok(geometry.frameLeft>=-1&&geometry.frameRight<=391,JSON.stringify(geometry));
  assert.ok(geometry.dialogOverflow<=1&&geometry.pageOverflow<=1,JSON.stringify(geometry));
  assert.equal(await frame().locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await p.screenshot({path:path.join(out,'mobile-390-preview.png')});await close();await sameDraft();
 });
 await check('mixed PDF and HTML import finishes the conversion dialog before opening HTML',async()=>{
  await p.setViewportSize({width:1366,height:900});
  const pdf={name:'함께 넣은 문서.pdf',mimeType:'application/pdf',buffer:await fs.readFile(new URL('./fixtures/document-pages.pdf',import.meta.url))};
  const mixed={name:'변환 뒤에 보는 HTML.html',mimeType:'text/html',buffer:Buffer.from('<!doctype html><h1 id="mixed-title">PDF 뒤에 열린 HTML</h1>')};
  await action('attach');await p.locator('#file-input').setInputFiles([pdf,mixed]);
  await p.locator('[data-page-conversion="close"]:not([disabled])').waitFor({timeout:120000});
  assert.equal(await p.locator('dialog[open]').count(),1,'only the conversion dialog is open');
  assert.equal(await p.locator('#dialog[open] iframe.html-preview-frame').count(),0,'HTML waits while conversion results remain open');
  await p.locator('[data-page-conversion="close"]').click();await previewReady('#mixed-title');await downloadOriginal(mixed);await close();await sameDraft();
 });
 await check('saved HTML reopens after an offline reload using the cached app',async()=>{
  await p.keyboard.press('Control+e');await p.locator('#markdown').waitFor();
  await p.waitForFunction(()=>!!navigator.serviceWorker.controller,{},{timeout:30000});
  await ctx.setOffline(true);
  try{await p.reload();await p.locator('.attachment-card [data-action="preview-html"]').first().waitFor();await reopen(first,'reader','#lesson-title');await downloadOriginal(first);await close();}
  finally{await ctx.setOffline(false);}
 });
 assert.deepEqual(errors,[]);assert.deepEqual(dispatchedProbes,[]);
 checks.push('no uncaught browser errors or imported HTML requests reaching the network');passed=true;
 await fs.rm(path.join(out,'failure.png'),{force:true});
}catch(error){failure=error.stack||String(error);await p.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({base,passed,checks,measurements,errors,probeRequests,externalRequests,dispatchedProbes,requestFailures,...(failure?{failure}:{})},null,2));await browser.close();}
console.log(checks.length+' checks passed');
