// 게시 연결 주소 화면 시험: 게시 키가 있는 브라우저에서 주소를 만들고, 다른 브라우저(새 문맥)에서 그 주소로 연결한다.
// 게시 서버는 가짜 응답으로 받는다. 실제 키·Blob 은 쓰지 않는다.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {launchBrowser} from './browser-runtime.mjs';
const base=process.env.PKOS_TEST_URL||'http://127.0.0.1:8793/',KEY='K'.repeat(43),CODE='c'.repeat(43);
const b=await launchBrowser(),checks=[],errors=[],calls=[];
async function mockApi(ctx){
 await ctx.route('https://pkos-library.vercel.app/api/reading-shares?*',async route=>{
  const req=route.request(),url=new URL(req.url()),op=url.searchParams.get('op'),body=req.postData()?JSON.parse(req.postData()):null;calls.push({op,body,auth:req.headers().authorization||''});
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,DELETE,OPTIONS'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  let out={},status=200;
  if(op==='status')out={configured:true};
  if(op==='list')out={shares:[]};
  if(op==='create-connection')out={url:body.origin+'/pkos-library/publisher-connect.html#code='+CODE,expiresAt:Date.now()+3600e3};
  if(op==='connect'){if(body.code!==CODE){status=404;out={error:'연결 주소를 찾을 수 없습니다.'};}else out={key:KEY};}
  if(op==='finish-connection')out={finished:true};
  return route.fulfill({status,contentType:'application/json',headers,body:JSON.stringify(out)});
 });
}
try{
 const owner=await b.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});await mockApi(owner);
 await owner.addInitScript(k=>{localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');localStorage.setItem('pkos-reading-publisher-v1',k);},KEY);
 const p=await owner.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base);await p.locator('.welcome').waitFor();await p.locator('[data-action=settings]:visible').first().click();await p.locator('#dialog [data-action=export-reading]').click();
 const d=p.locator('.reading-export-dialog');await p.waitForFunction(()=>document.querySelector('[data-reading-configured]')?.textContent.includes('연결됨'));
 await d.locator('[data-reading-setup] > summary').click();await d.locator('[data-reading-connect]').waitFor({state:'visible'});
 assert.equal(await d.locator('[data-reading-connect-origin]').inputValue(),'https://legoschool.github.io');
 await d.locator('[data-reading=make-connection]').click();await d.locator('[data-reading-connect-result]').waitFor({state:'visible'});
 assert.equal(await d.locator('[data-reading-connect-url]').inputValue(),'https://legoschool.github.io/pkos-library/publisher-connect.html#code='+CODE);
 const made=calls.find(c=>c.op==='create-connection');assert.deepEqual(made.body,{origin:'https://legoschool.github.io'});assert.equal(made.auth,'Bearer '+KEY);
 assert.match(await d.locator('[data-reading-connect-expiry]').innerText(),/한 번만 쓸 수 있어요/);
 checks.push('configured browser shows 「다른 기기에서도 게시하기」 and makes a one-time link with the owner key');

 const fresh=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await mockApi(fresh);
 const q=await fresh.newPage();q.on('pageerror',e=>errors.push(e.message));
 await q.goto(base+'publisher-connect.html#code='+CODE);await q.locator('#connect-button').waitFor();
 assert.equal(new URL(q.url()).hash,'','code is removed from the address bar at once');
 assert.equal(await q.evaluate(()=>localStorage.getItem('pkos-reading-publisher-v1')),null);
 await q.locator('#connect-button').click();await q.waitForFunction(()=>/연결했습니다/.test(document.querySelector('#connect-status').textContent));
 assert.equal(await q.evaluate(()=>localStorage.getItem('pkos-reading-publisher-v1')),KEY);
 const connect=calls.filter(c=>c.op==='connect').at(-1),finish=calls.filter(c=>c.op==='finish-connection').at(-1);
 assert.equal(connect.body.code,CODE);assert.match(connect.body.claimId,/^[A-Za-z0-9_-]{43}$/);assert.equal(finish.body.claimId,connect.body.claimId);
 assert.equal(await q.locator('#connect-return').isVisible(),true);
 assert.ok(await q.evaluate(()=>document.body.scrollWidth<=innerWidth));
 checks.push('another browser opens the link, connects, stores the key, finishes the link and fits phone width');

 const other=await b.newContext({serviceWorkers:'block'});await mockApi(other);const bad=await other.newPage();
 await bad.goto(base+'publisher-connect.html#code='+'z'.repeat(43));await bad.locator('#connect-button').click();await bad.waitForFunction(()=>document.querySelector('#connect-status').dataset.error==='true');
 assert.match(await bad.locator('#connect-status').innerText(),/찾을 수 없습니다/);assert.equal(await bad.locator('#connect-button').innerText(),'다시 연결');
 checks.push('an unknown link shows the server message and offers to retry');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,errors},null,2));
}finally{await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/publisher-connect-results.json',JSON.stringify({checks,errors},null,2));await b.close();}
