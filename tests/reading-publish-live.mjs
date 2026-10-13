import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser} from './browser-runtime.mjs';

const base=(process.env.PKOS_TEST_URL||'https://pkos-library.vercel.app/').replace(/\/?$/,'/');
const secretFile=process.env.PKOS_PUBLISHER_FILE;if(!secretFile)throw new Error('Set PKOS_PUBLISHER_FILE to the private local publisher configuration.');
const {key}=JSON.parse(await fs.readFile(secretFile,'utf8'));
const output=process.env.PKOS_TEST_OUTPUT||'test-results/reading-publish-live';await fs.mkdir(output,{recursive:true});
const API='https://pkos-library.vercel.app/api/reading-shares',title='공유 기능 가상 시험 '+Date.now(),checks=[];
const browser=await launchBrowser(),author=await browser.newContext(),reader=await browser.newContext();
const page=await author.newPage(),view=await reader.newPage();let id;
page.on('console',m=>{if(m.type()==='error')console.log('BROWSER',m.text());});
page.on('response',r=>{if(r.url().includes('/api/reading-shares'))console.log('API',new URL(r.url()).searchParams.get('op'),r.status());});
try{
 const unauthorized=await fetch(API+'?op=status');assert.equal(unauthorized.status,401);checks.push('미인증 게시 요청 거부');
 await page.goto(base+'?demo=1');await page.locator('[data-action="new"]').first().waitFor();
 const setup=await page.evaluate(async key=>{history.replaceState(null,'',location.pathname+location.search+'#reading-publish-setup='+key);const {consumePublisherSetup,getPublisherStatus}=await import('./reading-publish.js');const result=await consumePublisherSetup();return {ok:result.ok,configured:getPublisherStatus().configured,fragment:location.hash};},key);assert.deepEqual(setup,{ok:true,configured:true,fragment:''});
 await page.evaluate(async title=>{
  const {showReadingExport}=await import('./reading-export.js'),{makeNote}=await import('./core.js');
  const canvas=document.createElement('canvas');canvas.width=480;canvas.height=270;const ctx=canvas.getContext('2d');ctx.fillStyle='#edf3ff';ctx.fillRect(0,0,480,270);ctx.fillStyle='#2457b6';ctx.font='32px sans-serif';ctx.fillText('공유용 가상 페이지',30,100);ctx.strokeStyle='#e34d4d';ctx.lineWidth=8;ctx.strokeRect(30,130,270,80);
  const png=await new Promise(resolve=>canvas.toBlob(resolve));
  const assets=[{id:'synthetic-image',name:'필기 포함 가상 페이지.png',type:'image/png',blob:png},{id:'synthetic-large',name:'가상 첨부 6MB.bin',type:'application/octet-stream',blob:new Blob([new Uint8Array(6*1024*1024)])}];
  const notes=[{...makeNote(),id:'private-live-test-id',title,body:'선택한 기록만 공유하는 가상 시험입니다.\n\n[참고 링크](https://example.com/lesson)',folder:'PRIVATE_FOLDER_DO_NOT_EXPORT',tags:['PRIVATE_TAG_DO_NOT_EXPORT'],attachments:assets.map(a=>a.id),links:[]},{...makeNote(),id:'unselected-live-test',title:'선택하지 않은 기록',body:'UNSELECTED_PRIVATE_BODY_DO_NOT_EXPORT',attachments:[],links:[]}];
  showReadingExport({notes,assets,currentId:notes[0].id,download(){},toast(){}});
 },title);
 await page.locator('[data-reading-title]').fill(title);
 await page.locator('details:has([data-reading-assets]) > summary').click();
 await page.locator('[data-reading-asset="synthetic-image"]').check();await page.locator('[data-reading-asset="synthetic-large"]').check();
 await page.locator('[data-reading="preview"]').click();await page.locator('[data-reading="publish"]').waitFor();
 await page.waitForFunction(()=>!document.querySelector('[data-reading="publish"]').disabled);
 await page.locator('[data-reading="publish"]').click();
 await page.locator('[data-reading-result]').waitFor({state:'visible',timeout:120000}).catch(async e=>{console.log('PUBLISH STATUS',await page.locator('[data-reading-status]').innerText());throw e;});
 const url=await page.locator('[data-reading-url]').inputValue();id=new URL(url).searchParams.get('id');assert.match(id,/^[a-f0-9]{32}$/);assert.ok(!url.includes(key));checks.push('실제 private Blob 업로드 · 공개 주소 발급 · 6MB 첨부');
 await view.goto(url);const frame=view.frameLocator('#share-document');await frame.locator('article').waitFor({timeout:90000});
 const text=await frame.locator('body').innerText();assert.match(text,/선택한 기록만 공유/);assert.doesNotMatch(text,/PRIVATE_FOLDER|PRIVATE_TAG|UNSELECTED_PRIVATE_BODY|private-live-test-id/);
 const img=frame.locator('img').first();await img.evaluate(el=>el.decode());assert.equal(await img.evaluate(el=>el.naturalWidth),480);
 const [download]=await Promise.all([view.waitForEvent('download'),frame.getByRole('link',{name:'가상 첨부 6MB.bin 다운로드'}).click()]);assert.equal((await fs.stat(await download.path())).size,6*1024*1024);
 assert.equal(await view.evaluate(()=>localStorage.getItem('pkos-reading-publisher-v1')),null);checks.push('로그인 없는 독자 · 이미지·첨부 다운로드 · 비공개 범위 제외');
 await view.screenshot({path:path.join(output,'reader-desktop.png')});await view.setViewportSize({width:390,height:844});await view.screenshot({path:path.join(output,'reader-mobile.png')});assert.equal(await view.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);checks.push('독자 모바일 화면');
 await page.locator('[data-reading-asset="synthetic-large"]').uncheck();await page.locator('[data-reading-title]').fill(title+' 수정');await page.locator('[data-reading="preview"]').click();await page.waitForFunction(()=>!document.querySelector('[data-reading="publish"]').disabled);await page.locator('[data-reading="publish"]').click();
 await page.waitForFunction(()=>document.querySelector('[data-reading-status]').textContent.includes('게시했습니다')&&!document.querySelector('[data-reading="publish"]').disabled,{},{timeout:120000});
 assert.equal(await page.locator('[data-reading-url]').inputValue(),url);await view.reload();await frame.getByRole('heading',{name:title+' 수정',exact:true}).waitFor({timeout:90000});assert.equal(await frame.getByRole('link',{name:'가상 첨부 6MB.bin 다운로드'}).count(),0);checks.push('같은 주소로 갱신 · 작은 파일 업로드 · 새 내용 즉시 조회');
 await page.locator('[data-reading-manager] > summary').click();await page.locator('[data-reading="delete-share"][data-reading-share-id="'+id+'"]').waitFor();
 page.once('dialog',d=>d.accept());await page.locator('[data-reading="delete-share"][data-reading-share-id="'+id+'"]').click();await page.getByText('게시를 삭제했습니다.',{exact:true}).waitFor({timeout:60000});
 await view.reload();await view.getByText('게시가 취소되었거나 찾을 수 없는 공유 주소입니다.').waitFor({timeout:60000});checks.push('게시 삭제 · 같은 주소 재조회 차단');
 const res=await fetch(API+'?op=archive&id='+id);assert.equal(res.status,404);assert.match(res.headers.get('cache-control'),/no-store/);checks.push('게시 취소 후 원문 다운로드 차단 · no-store');
 await fs.writeFile(path.join(output,'verification.json'),JSON.stringify({base,checks,passed:checks.length,syntheticShareDeleted:true},null,2));console.log(JSON.stringify({base,passed:checks.length,checks}));
}finally{
 // Only this run's synthetic record is removed, even when a UI assertion fails.
 if(id)await fetch(API+'?id='+id,{method:'DELETE',headers:{Authorization:'Bearer '+key}}).catch(()=>{});
 else{const response=await fetch(API+'?op=list',{headers:{Authorization:'Bearer '+key}}).catch(()=>null);const body=await response?.json().catch(()=>null);for(const row of body?.shares||[])if(row.title===title)await fetch(API+'?id='+row.id,{method:'DELETE',headers:{Authorization:'Bearer '+key}}).catch(()=>{});}
 await author.close();await reader.close();await browser.close();
}
