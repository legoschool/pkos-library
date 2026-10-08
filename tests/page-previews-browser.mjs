import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser} from './browser-runtime.mjs';
const out='test-results/page-previews-20261007';await fs.mkdir(out,{recursive:true});
const buffer=await fs.readFile(new URL('./fixtures/document-pages.pptx',import.meta.url)),pdf=await fs.readFile(new URL('./fixtures/document-pages.pdf',import.meta.url));
const pptx=buffer.toString('base64');
await fs.writeFile(path.join(out,'preview-fixture.pptx'),buffer);
const browser=await launchBrowser(),checks=[],errors=[],external=[];
try{
 const p=await browser.newPage({viewport:{width:1380,height:960},acceptDownloads:true});
 p.on('pageerror',e=>errors.push(e.message));
 p.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(process.env.PREVIEW_URL||'http://127.0.0.1:8793/'))external.push(r.url());});
 await p.addInitScript(()=>{if(window!==top)return;localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');});
 await p.goto(process.env.PREVIEW_URL||'http://127.0.0.1:8793/');await p.locator('.welcome').waitFor();
 const click=async a=>p.locator(`[data-action="${a}"]:visible`).first().click();
 await click('new');await p.locator('#edit-title').fill('페이지 미리보기 시험');await p.locator('#edit-body').fill('미리보기를 열어도 유지할 나의 생각');await click('attach');
 await p.locator('#file-input').setInputFiles([
  {name:'lesson.PDF',mimeType:'application/octet-stream',buffer:pdf},
  {name:'lesson.pptx',mimeType:'application/octet-stream',buffer},
  {name:'old.ppt',mimeType:'application/vnd.ms-powerpoint',buffer:Buffer.from('legacy')},
  {name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('broken')},
  {name:'broken.pptx',mimeType:'application/octet-stream',buffer:Buffer.from('broken')}
 ]);
 await p.locator('[data-page-conversion="close"]:not([disabled])').waitFor({timeout:120000});await p.locator('[data-page-conversion="close"]').click();
 await p.locator('.editing-files>div').nth(4).waitFor();
 const open=async name=>p.locator('.editing-files>div').filter({has:p.locator('span',{hasText:name})}).getByRole('button',{name:/미리보기/}).click();
 await open('lesson.PDF');await p.locator('.pdf-preview[data-rendered="1"]').waitFor();
 await p.waitForFunction(()=>document.querySelectorAll('.page-thumbnail-image canvas').length===2);
 assert.match(await p.locator('.pdf-text').textContent(),/PKOS attachment test/);
 assert.equal(await p.locator('.document-page canvas').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return d.some((v,i)=>i%4===0&&v<100);}),true);
 await p.locator('[data-page="2"]').click();await p.locator('.pdf-preview[data-rendered="2"]').waitFor();
 assert.match(await p.locator('.pdf-text').textContent(),/한글 PDF 첨부 검사/);
 assert.equal(await p.locator('[data-pdf-step="1"]').isDisabled(),true);
 await p.getByRole('spinbutton',{name:'쪽 번호'}).fill('1');await p.getByRole('spinbutton',{name:'쪽 번호'}).press('Tab');await p.locator('.pdf-preview[data-rendered="1"]').waitFor();
 await p.getByRole('spinbutton',{name:'쪽 번호'}).fill('999');await p.getByRole('spinbutton',{name:'쪽 번호'}).press('Tab');assert.equal(await p.getByRole('spinbutton').inputValue(),'1');
 await p.screenshot({path:path.join(out,'pdf-desktop.png')});
 await p.locator('[data-pages-toggle]').click();assert.equal(await p.locator('.page-thumbnails').isVisible(),false);
 await click('dialog-close');assert.equal(await p.locator('#edit-body').inputValue(),'미리보기를 열어도 유지할 나의 생각');
 checks.push('PDF filename detection, painted thumbnails, page selection/jump/bounds, one-page mode and draft preserved');
 await open('lesson.pptx');const f=p.frameLocator('.pptx-frame');await f.locator('#pages[data-rendered="1"]').waitFor({timeout:45000});
 assert.match(await f.locator('.document-page').textContent(),/First lesson/);
 await f.locator('.page-thumbnail-image img').first().waitFor();
 assert.equal(await p.locator('.pptx-frame').getAttribute('sandbox'),'allow-scripts');
 await f.locator('[data-page="2"]').click();await f.locator('#pages[data-rendered="2"]').waitFor();assert.match(await f.locator('.document-page').textContent(),/두 번째 수업/);
 await f.locator('[data-pdf-step="1"]').click();await f.locator('#pages[data-rendered="3"]').waitFor();assert.match(await f.locator('.document-page').textContent(),/Third reflection/);
 assert.equal(await f.locator('[data-pdf-step="1"]').isDisabled(),true);
 await p.screenshot({path:path.join(out,'pptx-desktop.png')});
 checks.push('PPTX layout and embedded images, Korean second slide, three thumbnails and page navigation in isolated frame');
 await p.setViewportSize({width:390,height:844});await f.locator('[data-page="1"]').click();await f.locator('#pages[data-rendered="1"]').waitFor();
 assert.ok(await f.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+1));
 assert.ok(await p.locator('#dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 await p.screenshot({path:path.join(out,'pptx-mobile.png')});
 await f.locator('[data-pages-toggle]').click();assert.equal(await f.locator('.page-thumbnails').isVisible(),false);
 await click('dialog-close');await open('lesson.PDF');await p.locator('.pdf-preview[data-rendered="1"]').waitFor();
 assert.ok(await p.locator('#dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await p.screenshot({path:path.join(out,'pdf-mobile.png')});
 await click('dialog-close');checks.push('390px mobile PDF/PPTX layouts and single-slide mode without overflow');
 await open('old.ppt');await p.locator('#dialog[open]',{hasText:'바로 미리 볼 수 없습니다'}).waitFor();await click('dialog-close');
 await open('broken.pdf');await p.getByText('PDF를 미리 볼 수 없습니다.',{exact:false}).waitFor();await click('dialog-close');
 await open('broken.pptx');await p.frameLocator('.pptx-frame').getByText('PPTX를 미리 볼 수 없습니다.',{exact:false}).waitFor();await click('dialog-close');
 checks.push('Legacy PPT and corrupt PDF/PPTX give actionable messages');
 await click('preview');await p.locator('.attachment-card').nth(4).waitFor();
 await p.locator('.attachment-card').filter({hasText:'lesson.pptx'}).getByRole('button',{name:'슬라이드 미리보기'}).click();await p.frameLocator('.pptx-frame').locator('#pages[data-rendered="1"]').waitFor();await click('dialog-close');
 await p.reload();await p.locator('.attachment-card').nth(4).waitFor();
 const data=await p.evaluate(async()=>{const {openStore}=await import('./store.js');return (await openStore(false)).backup();});
 assert.equal(data.notes.length,1);assert.equal(data.notes[0].body,'미리보기를 열어도 유지할 나의 생각');
 assert.equal(data.assets.find(a=>a.name==='lesson.pptx').data,pptx);assert.equal(data.assets.find(a=>a.name==='lesson.PDF').data,pdf.toString('base64'));
 checks.push('Reader preview, reload, original attachment bytes and draft persistence');
 await p.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await p.context().setOffline(true);await p.reload();await p.locator('.attachment-card').nth(4).waitFor();
 await p.locator('.attachment-card').filter({hasText:'lesson.pptx'}).getByRole('button',{name:'슬라이드 미리보기'}).click();
 await p.frameLocator('.pptx-frame').locator('#pages[data-rendered="1"]').waitFor({timeout:15000});await click('dialog-close');
 await p.locator('.attachment-card').filter({hasText:'lesson.PDF'}).getByRole('button',{name:'PDF 미리보기'}).click();await p.locator('.pdf-preview[data-rendered="1"]').waitFor();await click('dialog-close');
 await p.context().setOffline(false);checks.push('Cached app and PDF/PPTX viewers work after an offline reload');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 checks.push('No browser exceptions or external requests');
 console.log(JSON.stringify({checks,errors,external},null,2));
}finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify({checks,errors,external},null,2));await browser.close();}
