// Fictional notes in an isolated browser profile; remote thumbnails/frames and link destinations are stubbed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser,stubGoogle} from './browser-runtime.mjs';

const base=process.env.PKOS_TEST_URL||'http://127.0.0.1:8899/';
const out=process.env.PKOS_LINKS_TEST_OUT||'test-results/body-links-20261013';
await fs.mkdir(out,{recursive:true});
const browser=await launchBrowser(),ctx=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});
await ctx.addInitScript(()=>{localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');});
await stubGoogle(ctx);
// A valid image fixture exercises thumbnail layout; the generic stub's minimal GIF can trigger an image error.
await ctx.route(/^https:\/\/i\.ytimg\.com\//,route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="#dbeafe"/><rect x="22" y="26" width="276" height="128" rx="9" fill="#1e40af"/><path d="M145 62L189 90L145 118Z" fill="white"/></svg>'}));
const requests=[];
ctx.on('request',request=>requests.push(request.url()));
await ctx.route('https://example.org/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>가상 링크 목적지</title><p id="destination">격리된 링크 열기 검증</p>'}));
const p=await ctx.newPage(),checks=[],errors=[],measurements=[];
p.on('pageerror',error=>errors.push(error.message));
p.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const title='가상 수업 자료 링크 검증',secondTitle='가상 두 번째 자료';
const youtube='https://www.youtube.com/watch?v=dQw4w9WgXcQ',secondYoutube='https://youtu.be/aqz-KE-bpKQ';
const generic='https://example.org/lesson?unit=1',labeled='https://example.org/notes',edited='https://example.org/revised';
const content=[
 `오늘 본 영상은 ${youtube} 입니다.`,
 `참고 자료: ${generic}`,
 `[수업 메모](${labeled})`,
 `같은 영상 다시 연결: ${youtube}`,
 '`https://example.org/inline-code`',
 '```text\nhttps://example.org/fenced-code\n```',
 '[실행하지 않는 예시](javascript:alert(1))',
 'ftp://example.org/not-http'
].join('\n\n');
const body=()=>p.locator('#edit-body'),host=()=>p.locator('#body-link-previews');
const action=name=>p.locator(`[data-action="${name}"]:visible`).first().click();
const card=url=>host().locator('article.body-link-card').filter({has:p.locator(`a.body-link-open[href="${url}"]`)});
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function waitCards(expected){
 await p.waitForFunction(urls=>{const cards=[...document.querySelectorAll('#body-link-previews article.body-link-card')];return cards.length===urls.length&&urls.every(url=>cards.some(el=>el.dataset.url===url));},expected);
}
async function sameDraft(expected){
 assert.equal(await body().inputValue(),expected);
 assert.equal(await p.evaluate(()=>document.querySelector('#edit-body')===window.originalBody),true,'body input node retained');
 assert.equal(await p.locator('#edit-title').inputValue(),title);
}
async function screenshot(name){
 await host().scrollIntoViewIfNeeded();
 measurements.push({name,...await p.evaluate(()=>{const r=document.querySelector('#body-link-previews').getBoundingClientRect();return {width:innerWidth,hostX:r.x,hostRight:r.right,overflow:document.documentElement.scrollWidth>innerWidth,cards:document.querySelectorAll('#body-link-previews article').length,frames:document.querySelectorAll('#body-link-previews iframe').length};})});
 await p.screenshot({path:path.join(out,name+'.png')});
}
try{
 await p.goto(base);await p.locator('.welcome').waitFor();await action('new');await p.locator('#edit-title').fill(title);
 await p.waitForFunction(()=>!!document.querySelector('#body-link-previews'));
 assert.equal(await host().isVisible(),false,'empty preview host is hidden');
 await body().fill(content);await body().evaluate(el=>{window.originalBody=el;el.setSelectionRange(12,18);});
 await check('pasted bare and labeled URLs produce deduplicated safe cards while code and non-HTTP URLs are ignored',async()=>{
  await waitCards([youtube,generic,labeled]);await sameDraft(content);
  assert.deepEqual(await body().evaluate(el=>[el.selectionStart,el.selectionEnd]),[12,18]);
  const links=await host().locator('a.body-link-open').evaluateAll(elements=>elements.map(el=>({href:el.href,target:el.target,rel:el.rel})));
  assert.equal(links.length,3);assert.ok(links.every(link=>link.target==='_blank'&&link.rel.split(/\s+/).includes('noopener')&&link.rel.split(/\s+/).includes('noreferrer')));
  const thumbnail=card(youtube).locator('img.body-link-thumbnail');assert.equal(await thumbnail.count(),1);
  await thumbnail.scrollIntoViewIfNeeded();await thumbnail.evaluate(el=>el.decode());assert.equal(await thumbnail.isVisible(),true);
  assert.ok(await thumbnail.evaluate(el=>el.naturalWidth>0),'valid thumbnail rendered');
  assert.equal(await host().locator('iframe').count(),0,'no iframe before explicit play');
  assert.equal(requests.filter(url=>url.startsWith('https://example.org/')).length,0,'generic cards never request metadata');
  await screenshot('desktop-editor-links');
 });
 await check('URL edits and removal update cards without replacing the input or retaining stale links',async()=>{
  const revised=content.replace(generic,edited);await body().fill(revised);await waitCards([youtube,edited,labeled]);await sameDraft(revised);
  await body().fill('링크 없는 생각만 남깁니다.');await waitCards([]);assert.equal(await host().isVisible(),false);
  await body().fill(content);await waitCards([youtube,generic,labeled]);await sameDraft(content);
 });
 await check('IME composition defers preview updates until the Korean composition completes',async()=>{
  await body().evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})));
  const composed=content+'\n\n추가 자료 '+edited;await body().fill(composed);await p.waitForTimeout(350);
  assert.equal(await host().locator('article.body-link-card').count(),3,'composition does not rerender cards');
  await body().evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
  await waitCards([youtube,generic,labeled,edited]);await sameDraft(composed);
  await body().fill(content);await waitCards([youtube,generic,labeled]);
 });
 await check('YouTube loads only on request, remains mounted while typing and allows one active player',async()=>{
  const play=card(youtube).locator('[data-link-preview]');assert.equal(await play.getAttribute('aria-expanded'),'false');
  const before=requests.filter(url=>url.includes('youtube-nocookie.com')).length;assert.equal(before,0);
  await play.click();await card(youtube).locator('iframe').waitFor();
  assert.match(await card(youtube).locator('iframe').getAttribute('src'),/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.equal(await play.getAttribute('aria-expanded'),'true');assert.equal(await host().locator('iframe').count(),1);
  await card(youtube).locator('iframe').evaluate(el=>window.activeFrame=el);
  const changed=content+'\n\n영상에서 배운 점을 더 적습니다.\n\n다른 영상 '+secondYoutube;
  await body().fill(changed);await body().evaluate(el=>el.setSelectionRange(17,23));await waitCards([youtube,generic,labeled,secondYoutube]);await sameDraft(changed);
  assert.equal(await card(youtube).locator('iframe').evaluate(el=>el===window.activeFrame),true,'playing iframe survives unrelated typing');
  assert.deepEqual(await body().evaluate(el=>[el.selectionStart,el.selectionEnd]),[17,23]);
  await card(secondYoutube).locator('[data-link-preview]').click();await card(secondYoutube).locator('iframe').waitFor();
  assert.equal(await host().locator('iframe').count(),1);assert.equal(await card(youtube).locator('iframe').count(),0);assert.equal(await play.getAttribute('aria-expanded'),'false');
  await card(secondYoutube).locator('[data-link-preview]').click();assert.equal(await host().locator('iframe').count(),0,'play button closes the active frame');
  await card(secondYoutube).locator('[data-link-preview]').click();await card(secondYoutube).locator('iframe').waitFor();
  await body().fill(content);await waitCards([youtube,generic,labeled]);assert.equal(await host().locator('iframe').count(),0,'removing a URL removes its active frame');
  assert.equal(requests.filter(url=>url.startsWith('https://example.org/')).length,0);
 });
 await check('saving retains the draft and reader links and cards open a deliberate new tab',async()=>{
  await body().focus();await body().evaluate(el=>el.setSelectionRange(12,18));await p.keyboard.press('Control+s');await sameDraft(content);
  assert.equal(await body().evaluate(el=>document.activeElement===el),true);assert.deepEqual(await body().evaluate(el=>[el.selectionStart,el.selectionEnd]),[12,18]);
  await p.keyboard.press('Control+e');await p.locator('#markdown').waitFor();await waitCards([youtube,generic,labeled]);assert.equal(await host().locator('iframe').count(),0);
  assert.ok(await p.locator(`#markdown a[href="${generic}"]`).count()>0,'reader keeps bare URL hyperlink');
  assert.equal(await p.locator(`#markdown a[href="${labeled}"]`).innerText(),'수업 메모');
  const popupPromise=p.waitForEvent('popup');await card(generic).locator('a.body-link-open').click();const popup=await popupPromise;
  await popup.locator('#destination').waitFor();assert.equal(popup.url(),generic);await popup.close();
  assert.equal(requests.filter(url=>url.startsWith(generic)).length,1,'generic destination requested only after clicking');
  await screenshot('desktop-reader-links');
 });
 await check('320px and 390px editor and reader previews fit without document overflow',async()=>{
  for(const mobileWidth of [390,320]){
   await p.setViewportSize({width:mobileWidth,height:844});await waitCards([youtube,generic,labeled]);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await screenshot(`mobile-${mobileWidth}-reader-links`);
   await p.keyboard.press('Control+e');await body().waitFor();await waitCards([youtube,generic,labeled]);
   await card(youtube).locator('[data-link-preview]').click();await card(youtube).locator('iframe').waitFor();
   const frame=await card(youtube).locator('iframe').boundingBox();assert.ok(frame.x>=0&&frame.x+frame.width<=mobileWidth+1,'video fits mobile viewport');
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await screenshot(`mobile-${mobileWidth}-editor-video`);
   await p.keyboard.press('Control+e');await p.locator('#markdown').waitFor();
  }
 });
 await check('reload and switching notes rebuild the correct cards with no stale player or altered Markdown',async()=>{
  await p.setViewportSize({width:1366,height:768});await card(youtube).locator('[data-link-preview]').click();await card(youtube).locator('iframe').waitFor();
  await p.reload();await p.locator('#markdown').waitFor();await waitCards([youtube,generic,labeled]);assert.equal(await host().locator('iframe').count(),0);
  await action('new');await p.locator('#edit-title').fill(secondTitle);await body().fill('별도의 자료 '+edited);await waitCards([edited]);await p.keyboard.press('Control+s');await p.keyboard.press('Control+e');await p.locator('#markdown').waitFor();
  await p.locator('.note-row').filter({hasText:title}).click();await waitCards([youtube,generic,labeled]);assert.equal(await host().locator('iframe').count(),0);
  await card(youtube).locator('[data-link-preview]').click();await card(youtube).locator('iframe').waitFor();
  await p.locator('.note-row').filter({hasText:secondTitle}).click();await waitCards([edited]);assert.equal(await host().locator('iframe').count(),0);
  await p.reload();await p.locator('#markdown').waitFor();await waitCards([edited]);
  await p.locator('.note-row').filter({hasText:title}).click();await waitCards([youtube,generic,labeled]);await action('edit');assert.equal(await body().inputValue(),content);
 });
 assert.deepEqual(errors,[]);await fs.rm(path.join(out,'failure.png'),{force:true});
}catch(error){await p.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({base,checks,measurements,errors,requests},null,2));await browser.close();}
console.log(checks.length+' checks passed');
