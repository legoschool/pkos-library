// 게시 전 개인정보 검사와 ai-dx 임시저장 시험. ai-dx(Supabase) 호출은 같은 규칙으로 답하는 가짜 서버로 받는다.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {launchBrowser} from './browser-runtime.mjs';
const base=process.env.PKOS_TEST_URL||'http://127.0.0.1:8793/';
const b=await launchBrowser(),checks=[],errors=[],picture='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNwS1nwHwAEiAJKsIGz7AAAAABJRU5ErkJggg==';
try{
 const context=await b.newContext({viewport:{width:1380,height:1000},serviceWorkers:'block'});
 await context.addInitScript(()=>{localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');localStorage.setItem('pkos-aidx-link','1');});
 const ID='11111111-2222-3333-4444-555555555555',TOKEN='a'.repeat(48),server={rev:0,review:'pending',note:''},sent=[];
 await context.route('https://oawbzsdjkzucxlcyhgdr.supabase.co/rest/v1/rpc/*',async route=>{
  const fn=route.request().url().split('/').pop(),body=JSON.parse(route.request().postData()||'{}');sent.push({fn,body});let out={ok:false};
  if(fn==='dx_kirok_save'){
   if(body.p_pin!=='right-pin')out={ok:false,error:'pin'};
   else if(body.p_id&&(body.p_id!==ID||body.p_token!==TOKEN))out={ok:false,error:'missing'};
   else{server.rev++;server.review='pending';server.note='';out={ok:true,id:ID,rev:server.rev,review:'pending',visible:false,...(body.p_id?{}:{token:TOKEN})};}
  }
  if(fn==='dx_kirok_status')out={ok:true,items:body.p_items?.[0]?.token===TOKEN?[{id:ID,rev:server.rev,live_rev:null,review:server.review,review_note:server.note,visible:false}]:[]};
  return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(out)});
 });
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base);await p.locator('.welcome').waitFor();
 await p.evaluate(async base64=>{
  const {openStore}=await import('./store.js'),{makeNote}=await import('./core.js'),db=await openStore(false);
  const a=makeNote({id:'pii-note',title:'3월 학급 기록',body:'작성자: 박서연\n\n연락처 010-2222-3333 으로 알려 주세요.\n\n오늘 박서연 선생님과 함께 발표를 준비했다.\n\n이운희 선생님 반 이야기.',attachments:['pii-photo'],revision:1});
  await db.batch({notes:[a],assets:[{id:'pii-photo',name:'교실 사진.png',type:'image/png',blob:new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'image/png'})}]});
 },picture);
 await p.reload();await p.locator('.page-title').waitFor();await p.locator('[data-action=settings]:visible').first().click();await p.locator('#dialog [data-action=export-reading]').click();
 const d=p.locator('.reading-export-dialog'),frame=p.frameLocator('.reading-export-dialog iframe'),control=name=>d.locator('[data-reading='+name+']');
 const preview=async()=>{await control('preview').click();await p.waitForFunction(()=>!document.querySelector('[data-reading=download]').disabled);};
 await d.locator('[data-reading-note=pii-note]').check();await preview();
 assert.equal(await d.locator('[data-reading-privacy]').isVisible(),true);assert.equal(await d.locator('[data-reading-dest]').isVisible(),true);
 assert.match(await d.locator('[data-privacy-summary]').innerText(),/3가지를 찾았어요/);
 await d.locator('[data-reading=privacy-allow][data-privacy-name="이운희"]').click();await p.waitForFunction(()=>document.querySelectorAll('[data-privacy-list] [data-privacy-key]').length===2);
 assert.match(await d.locator('[data-privacy-summary]').innerText(),/2가지를 찾았어요/);
 assert.equal(await p.evaluate(()=>localStorage.getItem('pkos-privacy-allow-names')),'["이운희"]');
 checks.push('a name marked as public is remembered and skipped');
 assert.deepEqual(await d.locator('[data-privacy-list] [data-privacy-key]').evaluateAll(els=>els.map(e=>e.dataset.privacyKey)),['이름|박서연','전화번호|010-2222-3333']);
 await d.locator('[data-aidx-area]').selectOption('grow');
 assert.equal(await control('aidx-send').isDisabled(),true);assert.equal(await d.locator('[data-aidx-title]').inputValue(),'3월 학급 기록');
 checks.push('preview scans selected record, lists name and phone, and blocks ai-dx sending until they are handled');

 await d.locator('[data-privacy-list] button[data-reading=privacy-allow]').waitFor();
 await d.locator('[data-privacy-key="전화번호|010-2222-3333"]').uncheck();await control('privacy-apply').click();await p.waitForFunction(()=>!document.querySelector('[data-reading=download]').disabled&&!document.querySelector('[data-reading-privacy] [data-privacy-key]:not([data-reading])'));
 const text=await frame.locator('article').innerText();assert.ok(text.includes('박**')&&!text.includes('박서연'),'name masked in preview');assert.ok(text.includes('010-2222-3333'),'kept phone stays');
 assert.match(await d.locator('[data-privacy-kept] summary').innerText(),/이대로 두기로 한 항목 1가지/);
 checks.push('checked name is masked in the shared copy only; unchecked phone is kept and listed');

 const original=await p.evaluate(async()=>{const {openStore}=await import('./store.js'),db=await openStore(false);return (await db.all('notes')).find(n=>n.id==='pii-note')?.body||'';}).catch(()=>null);
 if(original!==null)assert.ok(original.includes('박서연'),'library record is unchanged');

 await d.locator('details:has([data-reading-assets]) > summary').click();await d.locator('[data-reading-asset=pii-photo]').check();await preview();
 assert.equal(await d.locator('[data-privacy-photo]').isVisible(),true);assert.equal(await control('aidx-send').isDisabled(),true);
 await d.locator('[data-privacy-photo-ok]').check();assert.equal(await control('aidx-send').isDisabled(),true,'password still needed');await d.locator('[data-aidx-pin]').fill('wrong-pin');assert.equal(await control('aidx-send').isEnabled(),true);
 checks.push('picture attachment requires an explicit face and name-tag check before sending');

 await control('aidx-send').click();await p.waitForFunction(()=>/비밀번호가 맞지 않아요/.test(document.querySelector('[data-reading-status]').textContent));
 assert.equal(await d.locator('[data-aidx-pin-row]').isVisible(),true);
 await d.locator('[data-aidx-pin]').fill('right-pin');await control('aidx-send').click();await p.waitForFunction(()=>/임시저장했어요\(1판\)/.test(document.querySelector('[data-reading-status]').textContent));
 const req=sent.filter(x=>x.fn==='dx_kirok_save').at(-1);assert.equal(req.body.p_id,null);assert.equal(req.body.p_area,'grow');assert.equal(req.body.p_title,'3월 학급 기록');
 for(const doc of [req.body.p_html,req.body.p_markdown]){assert.ok(!doc.includes('박서연'));assert.ok(doc.includes('박**'));}
 assert.ok(!req.body.p_html.includes('attachments/'),'attachments are not sent to ai-dx');assert.deepEqual(req.body.p_privacy.kept.map(k=>k.kind),['전화번호']);assert.equal(req.body.p_privacy.picturesChecked,true);
 assert.equal(await d.locator('[data-aidx-review]').getAttribute('href'),'https://ai-dx-map.vercel.app/?kirok=11111111-2222-3333-4444-555555555555');
 assert.equal(await control('aidx-send').isDisabled(),true);assert.equal(await control('aidx-send').innerText(),'임시저장했어요');assert.equal(await d.locator('[data-aidx-pin-row]').isVisible(),false);
 assert.equal(await p.evaluate(()=>sessionStorage.getItem('pkos-aidx-pin')),'right-pin');
 const post=await p.evaluate(()=>JSON.parse(localStorage.getItem('pkos-aidx-posts'))['pii-note']);
 assert.deepEqual([post.id,post.token,post.rev,post.area,post.title],[ID,TOKEN,1,'grow','3월 학급 기록']);assert.deepEqual(post.decisions.masked,['이름|박서연']);assert.ok(post.decisions.kept.includes('전화번호|010-2222-3333'));
 await d.locator('[data-aidx-state]').waitFor({state:'visible'});assert.match(await d.locator('[data-aidx-state-text]').innerText(),/임시저장 1판이 확인을 기다리고 있어요/);
 checks.push('wrong password is reported; correct password saves a draft (not public) with masked text only, no attachments, privacy record; the post id, key and masking choices are remembered');

 await d.locator('[data-privacy-kept] summary').click();await d.locator('[data-reading=privacy-unkeep]').click();assert.match(await d.locator('[data-privacy-summary]').innerText(),/1가지를 찾았어요/);assert.equal(await control('aidx-send').isDisabled(),true);
 checks.push('a kept item can be put back for review, which blocks sending again');

 await p.setViewportSize({width:390,height:844});assert.ok(await d.evaluate(el=>el.getBoundingClientRect().right<=innerWidth+1&&el.scrollWidth<=el.clientWidth+1));
 await d.locator('[data-reading-privacy]').scrollIntoViewIfNeeded();await p.screenshot({path:'test-results/privacy-publish-mobile.png'});
 checks.push('privacy and ai-dx panels fit phone width');
 await p.setViewportSize({width:1380,height:1000});await d.locator('[data-reading=close]').click();
 await p.locator('[data-action=note-menu]:visible').first().click();await p.locator('#dialog [data-action=aidx-note]').click();
 await d.locator('[data-reading-privacy]').waitFor({state:'visible'});assert.equal(await d.locator('[data-reading-note]:checked').count(),1);assert.equal(await d.locator('[data-aidx-pin-row]').isVisible(),false);
 checks.push('note menu 「ai-dx에 임시저장」 opens with the record selected and the privacy check already run');
 await d.locator('[data-aidx-note]').waitFor({state:'hidden'}).catch(()=>{});
 await d.locator('[data-reading=close]').click();server.review='changes';server.note='셋째 문단을 다시 봐 주세요';
 await p.locator('[data-action=note-menu]:visible').first().click();await p.locator('#dialog [data-action=aidx-note]').click();
 await d.locator('[data-aidx-note]').waitFor({state:'visible'});assert.equal(await d.locator('[data-aidx-note]').innerText(),'보완 요청: 셋째 문단을 다시 봐 주세요');assert.match(await d.locator('[data-aidx-state-text]').innerText(),/보완 요청을 받았어요/);
 assert.match(await d.locator('[data-reading-status]').innerText(),/지난번 임시저장 때 정한 대로 1가지를 가렸어요/);assert.match(await d.locator('[data-privacy-summary]').innerText(),/모두 이대로 두기로 했어요/);
 assert.equal(await d.locator('[data-aidx-area]').inputValue(),'grow');assert.equal(await control('aidx-send').innerText(),'고친 판 임시저장');
 assert.ok((await frame.locator('article').innerText()).includes('박**'));
 checks.push('reopening shows the reviewer note, reapplies earlier masking and keep choices, and offers 「고친 판 임시저장」');
 await control('aidx-send').click();await p.waitForFunction(()=>/임시저장했어요\(2판\)/.test(document.querySelector('[data-reading-status]').textContent));
 const req2=sent.filter(x=>x.fn==='dx_kirok_save').at(-1);assert.deepEqual([req2.body.p_id,req2.body.p_token],[ID,TOKEN]);assert.ok(!req2.body.p_html.includes('박서연'));
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('pkos-aidx-posts'))['pii-note'].rev),2);
 checks.push('saving again updates the same post as revision 2 with its key');
 await d.locator('[data-reading=close]').click();
 await p.evaluate(()=>{localStorage.removeItem('pkos-aidx-link');localStorage.removeItem('pkos-aidx-site');});await context.clearCookies();
 const fresh=await context.newPage();await fresh.addInitScript(()=>{});await fresh.goto(base+'#aidx='+encodeURIComponent('http://127.0.0.1:5181'));await fresh.locator('.welcome, .page-title').first().waitFor();
 assert.deepEqual(await fresh.evaluate(()=>[localStorage.getItem('pkos-aidx-link'),localStorage.getItem('pkos-aidx-site'),location.hash.includes('aidx')]),['1','http://127.0.0.1:5181',false]);
 await fresh.goto(base+'#aidx='+encodeURIComponent('https://evil.example'));await fresh.locator('.welcome, .page-title').first().waitFor();
 assert.equal(await fresh.evaluate(()=>localStorage.getItem('pkos-aidx-site')),'http://127.0.0.1:5181');
 checks.push('opening from ai-dx (#aidx=…) turns the link on, remembers only allowed ai-dx addresses and removes the marker from the address');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,errors},null,2));
}finally{await fs.writeFile('test-results/privacy-publish-results.json',JSON.stringify({checks,errors},null,2));await b.close();}
