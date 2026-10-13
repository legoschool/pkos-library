import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser} from './browser-runtime.mjs';

const base=(process.env.PKOS_TEST_URL||'http://127.0.0.1:8899/').replace(/\/?$/,'/');
const output=process.env.PKOS_TEST_OUTPUT||'test-results/share-reader';
await fs.mkdir(output,{recursive:true});
const browser=await launchBrowser(),context=await browser.newContext(),page=await context.newPage();
page.on('console',m=>{if(m.type()==='error')console.log('BROWSER',m.text());});
const checks=[];const id='a'.repeat(32);let mode='ok';
try{
 await page.goto(base+'share.html');
 const fixture=await page.evaluate(async()=>{
  const {buildReadingBundle}=await import('./reading-export.js'),{makeNote}=await import('./core.js'),{zipSync}=await import('./vendor/fflate.js');
  const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const png=Uint8Array.from(atob(canvas.toDataURL().split(',')[1]),c=>c.charCodeAt(0));
  const image={id:'image',name:'공유 그림.png',type:'image/png',blob:new Blob([png],{type:'image/png'})};
  const large={id:'large',name:'선택자료.bin',type:'application/octet-stream',blob:new Blob([new Uint8Array(1)])};
  const note={...makeNote(),id:'PRIVATE_INTERNAL_ID',title:'함께 읽는 가상 기록',body:'공유하는 내용입니다.\n\n[참고 링크](https://example.com/lesson)\n\n<script>parent.document.body.dataset.pwned="yes"</script>',folder:'PRIVATE_FOLDER',tags:['PRIVATE_TAG'],attachments:['image','large'],links:[]};
  const bundle=await buildReadingBundle([note],[image,large],{attachmentIds:['image','large'],title:'가상 공유 시험'});
  const zip=zipSync(bundle.files,{level:0});
  // Deliberately add hostile HTML to exercise the reader's second sanitation layer.
  const html=bundle.html.replace('</body>','<img src="https://example.com/track" onerror="parent.document.body.dataset.pwned=1"><iframe src="https://example.com/embed"></iframe><a href="javascript:alert(1)">금지 링크</a></body>');
  const hostile=zipSync({...bundle.files,'index.html':new TextEncoder().encode(html)},{level:0});
  return {zip:Array.from(zip),hostile:Array.from(hostile)};
 });
 const {unzipSync,zipSync}=await import('../vendor/fflate.js');
 const enlarge=data=>{const files=unzipSync(Uint8Array.from(data));const name=Object.keys(files).find(n=>n.endsWith('.bin'));files[name]=new Uint8Array(6*1024*1024);return Buffer.from(zipSync(files,{level:0}));};
 const archive=enlarge(fixture.zip),hostile=enlarge(fixture.hostile);assert.ok(archive.length>4.5*1024*1024);
 let external=0;
 await page.route('https://example.com/**',route=>{external++;return route.abort();});
 await page.route('https://pkos-library.vercel.app/api/reading-shares**',route=>{
  if(mode==='removed')return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:'removed'})});
  const url=new URL(route.request().url());
  return route.fulfill(url.searchParams.get('op')==='archive'?{status:200,contentType:'application/zip',body:mode==='hostile'?hostile:archive}:{status:200,contentType:'application/json',body:JSON.stringify({id,title:'가상 공유 시험'})});
 });
 await page.goto(base+'share.html?id='+id);
 const frame=page.frameLocator('#share-document');
 await frame.locator('article').waitFor();
 assert.match(await frame.locator('body').innerText(),/공유하는 내용입니다/);
 assert.doesNotMatch(await frame.locator('body').innerText(),/PRIVATE_FOLDER|PRIVATE_TAG|PRIVATE_INTERNAL_ID/);
 await page.waitForFunction(()=>document.querySelector('#share-document').getAttribute('sandbox').includes('allow-downloads'));
 const sandbox=await page.locator('#share-document').getAttribute('sandbox');assert.ok(!sandbox.includes('allow-scripts'));
 const img=frame.locator('img').first();await img.waitFor();await img.evaluate(el=>el.decode());assert.equal(await img.evaluate(el=>el.naturalWidth),1);
 assert.equal(await frame.getByRole('link',{name:'참고 링크'}).getAttribute('target'),'_blank');
 const [download]=await Promise.all([page.waitForEvent('download'),frame.getByRole('link',{name:'선택자료.bin 다운로드'}).click()]);
 const file=await download.path();assert.equal((await fs.stat(file)).size,6*1024*1024);
 checks.push('별도 독자 브라우저 · 6MB ZIP · 이미지 · 첨부 다운로드 · 메타데이터 제외');
 await page.screenshot({path:path.join(output,'reader-desktop.png')});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:path.join(output,'reader-mobile.png')});checks.push('모바일 너비/읽기 화면');
 mode='hostile';await page.reload();await frame.locator('article').waitFor();
 assert.equal(await frame.locator('script,iframe,object,embed').count(),0);
 assert.equal(await frame.locator('[onerror],[onclick]').count(),0);
 assert.equal(await frame.getByRole('link',{name:'금지 링크'}).count(),0);
 assert.equal(await page.evaluate(()=>document.body.dataset.pwned||''),'');assert.equal(external,0);checks.push('읽기 문서 sandbox · 스크립트/프레임/외부 추적 차단');
 mode='removed';await page.reload();await page.getByText('게시가 취소되었거나 찾을 수 없는 공유 주소입니다.').waitFor();assert.equal(await page.locator('#share-document').isVisible(),false);checks.push('게시 취소/없는 주소 안내');
 await page.goto(base+'share.html?id=../private');await page.getByText('공유 주소가 올바르지 않습니다.').waitFor();checks.push('잘못된 주소 거부');
 await fs.writeFile(path.join(output,'verification.json'),JSON.stringify({base,checks,passed:checks.length},null,2));console.log(JSON.stringify({passed:checks.length,checks}));
}finally{await context.close();await browser.close();}
