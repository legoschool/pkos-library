// Isolated browser/fictional fixtures only. Exports full pages, never user's files.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {launchBrowser} from './browser-runtime.mjs';
const BASE=process.argv[2]||'http://127.0.0.1:8917/';
const out='test-results/document-page-renderer-20261009';await fs.mkdir(out,{recursive:true});
const fixture=name=>fs.readFile(new URL('./fixtures/'+name,import.meta.url));
const sourcePdf=await fixture('document-pages.pdf'),sourcePptx=await fixture('document-pages.pptx');
const pdfFixtures={'locked.pdf':await fixture('locked.pdf'),'too-many.pdf':await fixture('too-many.pdf')};
const b=await launchBrowser(),results=[],errors=[],external=[];
// Playwright's serviceWorkers:'block' injection itself throws inside opaque frames.
// A fresh disposable browser keeps this test isolated without that injection.
const context=await b.newContext({viewport:{width:1440,height:1000}}),p=await context.newPage();
p.on('pageerror',error=>errors.push(error.message));
p.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith(BASE))external.push(request.url());});
await context.addInitScript(()=>{if(window===top)localStorage.setItem('pkos-guide-v1','done');});
async function check(name,fn){try{await fn();results.push({name,pass:true});console.log('OK',name);}catch(error){results.push({name,pass:false,error:error.stack});throw error;}}
const render=async(name,buffer,options={})=>p.evaluate(async({name,data,options})=>{
 const {renderDocumentPages}=await import('./document-page-renderer.js'),controller=new AbortController(),pages=[],progress=[];let active=0,maxActive=0;
 const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
 if(options.beforeAbort)controller.abort();
 try{
  const result=await renderDocumentPages({name,blob:new Blob([options.large?new Uint8Array(20*1024*1024+1):bytes])},{signal:controller.signal,onProgress:value=>progress.push(value),onPage:async page=>{
   active++;maxActive=Math.max(active,maxActive);const image=await createImageBitmap(page.blob),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const c=canvas.getContext('2d');c.drawImage(image,0,0);
   const pixels=c.getImageData(0,0,image.width,image.height).data;let darkTop=0;
   for(let y=0;y<Math.floor(image.height*.35);y++)for(let x=0;x<image.width;x++){const at=(y*image.width+x)*4;if(pixels[at]<100&&pixels[at+1]<100&&pixels[at+2]<100)darkTop++;}
   const at=(x,y)=>[...c.getImageData(Math.floor(image.width*x),Math.floor(image.height*y),1,1).data];
   pages.push({number:page.number,width:page.width,height:page.height,text:page.text,png:canvas.toDataURL('image/png').split(',')[1],imagePixel:at(.2,.6),backgroundPixel:at(.9,.9),darkTop});
   image.close();canvas.width=0;canvas.height=0;await new Promise(resolve=>setTimeout(resolve,30));active--;
   if(options.abortFirst)controller.abort();if(options.rejectPage)throw Error('시험 페이지 저장 실패');
  }});
  return {result,pages,progress,maxActive,frames:document.querySelectorAll('[data-document-page-renderer]').length};
 }catch(error){return {error:{name:error.name,message:error.message},pages,progress,maxActive,frames:document.querySelectorAll('[data-document-page-renderer]').length};}
},{name,data:buffer.toString('base64'),options});
try{
 await p.goto(BASE);await p.locator('.welcome').waitFor();
 await check('PDF exports every full page with text, painted pixels, PNG dimensions and sequential callbacks',async()=>{
  const r=await render('lesson.PDF',sourcePdf);assert.equal(r.error,undefined);assert.equal(r.result.count,2);assert.equal(r.pages.length,2);assert.equal(r.maxActive,1);
  assert.match(r.pages[0].text,/PKOS attachment test/);assert.match(r.pages[1].text,/한글 PDF 첨부 검사/);
  for(const page of r.pages){assert.ok(page.width>500&&page.height>500&&page.width<=2000&&page.height<=2000);assert.ok(page.darkTop>100);await fs.writeFile(out+'/pdf-'+page.number+'.png',Buffer.from(page.png,'base64'));}
 });
 await check('PPTX exports all three complete slides with original text, background and correctly placed red/green/blue pictures',async()=>{
  const r=await render('lesson.pptx',sourcePptx);assert.equal(r.error,undefined,JSON.stringify(r.error));assert.equal(r.result.count,3);assert.equal(r.pages.length,3);assert.equal(r.maxActive,1);assert.equal(r.frames,0);
  for(const [index,title]of ['First lesson','두 번째 수업','Third reflection'].entries()){
   const page=r.pages[index];assert.match(page.text,new RegExp(title));assert.ok(page.darkTop>100,'full text should be painted');assert.deepEqual(page.backgroundPixel,[245,242,255,255]);assert.deepEqual(page.imagePixel,[[255,0,0,255],[0,128,0,255],[0,0,255,255]][index]);assert.ok(Math.abs(page.width/page.height-12/6.75)<.01);
   await fs.writeFile(out+'/pptx-'+page.number+'.png',Buffer.from(page.png,'base64'));
  }
 });
 await check('legacy PPT, damaged files and password-protected PDF give explicit errors and no generated pages',async()=>{
  for(const [name,data,expected]of [['old.ppt',Buffer.from('legacy'),/\.pptx|PDF/],['broken.pdf',Buffer.from('broken'),/PDF.*못/],['broken.pptx',Buffer.from('broken'),/PPTX.*못/],['locked.pdf',pdfFixtures['locked.pdf'],/암호/]]){
   const r=await render(name,data);assert.match(r.error.message,expected);assert.equal(r.pages.length,0);assert.equal(r.frames,0);
  }
 });
 await check('page count and input-size limits reject the complete job explicitly before output rather than silently truncating',async()=>{
  const many=await render('too-many.pdf',pdfFixtures['too-many.pdf']);assert.match(many.error.message,/200쪽/);assert.equal(many.pages.length,0);
  const large=await render('large.pptx',sourcePptx,{large:true});assert.match(large.error.message,/20MB/);assert.equal(large.pages.length,0);
 });
 await check('pre-abort and abort after first delivered page stop both formats and dispose the sandbox frame',async()=>{
  for(const [name,buffer]of [['lesson.pdf',sourcePdf],['lesson.pptx',sourcePptx]])for(const option of [{beforeAbort:true},{abortFirst:true}]){
   const r=await render(name,buffer,option);assert.equal(r.error.name,'AbortError');assert.equal(r.pages.length,option.beforeAbort?0:1);assert.equal(r.frames,0);
  }
 });
 await check('consumer persistence failure propagates without rendering subsequent pages or leaving an iframe',async()=>{
  for(const [name,buffer]of [['lesson.pdf',sourcePdf],['lesson.pptx',sourcePptx]]){const r=await render(name,buffer,{rejectPage:true});assert.match(r.error.message,/시험 페이지 저장 실패/);assert.equal(r.pages.length,1);assert.equal(r.frames,0);}
 });
 await check('the existing sandboxed PPTX preview still displays all slides and navigation after export support is added',async()=>{
  await p.evaluate(async data=>{const {showPptx}=await import('./pptx-viewer.js'),dialog=document.createElement('dialog'),host=document.createElement('div');dialog.id='renderer-preview-regression';dialog.style.width='1000px';dialog.append(host);document.body.append(dialog);dialog.showModal();await showPptx(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))]),host);},sourcePptx.toString('base64'));
  const frame=p.frameLocator('#renderer-preview-regression iframe');await frame.locator('#pages[data-rendered="1"]').waitFor();assert.match(await frame.locator('.document-page').innerText(),/First lesson/);
  await frame.locator('[data-page="2"]').click();await frame.locator('#pages[data-rendered="2"]').waitFor();assert.match(await frame.locator('.document-page').innerText(),/두 번째 수업/);assert.equal(await frame.locator('.page-thumbnails button').count(),3);
  assert.equal(await p.locator('#renderer-preview-regression iframe').getAttribute('sandbox'),'allow-scripts');await p.screenshot({path:out+'/existing-pptx-preview.png'});
  await p.evaluate(()=>{const d=document.querySelector('#renderer-preview-regression');d.close();d.remove();});
 });
 await check('no document data is requested from external services and no uncaught page errors occur',async()=>{assert.deepEqual(external,[]);assert.deepEqual(errors,[]);});
}catch(error){process.exitCode=1;console.error(error.stack||error);}
finally{await fs.writeFile(out+'/verification.json',JSON.stringify({base:BASE,results,errors,external},null,2));await b.close();console.log(results.filter(r=>r.pass).length+'/'+results.length+' passed');}
