// Fictional notes in a disposable browser; no user folders or microphone access.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser,stubGoogle} from './browser-runtime.mjs';
const base=process.argv[2]||'http://127.0.0.1:8902/',out=process.env.PKOS_WRITING_TEST_OUT||'test-results/writing-ux-20261009';
await fs.mkdir(out,{recursive:true});
const browser=await launchBrowser(),ctx=await browser.newContext({viewport:{width:1366,height:768}});
await ctx.addInitScript(()=>{if(window!==top)return;localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');});
await stubGoogle(ctx);
const p=await ctx.newPage(),checks=[],errors=[];p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const action=name=>p.locator(`[data-action="${name}"]:visible`).first().click();
const frames=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const content=Array.from({length:70},(_,i)=>`## ${i+1}. 오늘의 관찰\n\n학생들의 질문을 듣고 다음 수업에서 시도할 방법을 적습니다. 쓰던 생각과 의견을 그대로 보존합니다.\n`).join('\n');
const title='수업을 돌아보며 적는 생각과 다음 시간에 시도할 방법';
async function check(name,fn){await fn();checks.push(name);console.log('OK',name);}
async function tools(open){const button=p.locator('[data-action="editor-tools"]');if((await button.getAttribute('aria-expanded')==='true')!==open)await button.click();await frames();}
async function sameDraft(){assert.equal(await p.locator('#edit-body').inputValue(),content);assert.equal(await p.evaluate(()=>document.querySelector('#edit-body')===window.originalBody),true);}
async function singleScroll(){await frames();const info=await p.locator('#edit-body').evaluate(t=>({client:t.clientHeight,scroll:t.scrollHeight,outer:t.closest('.document').scrollHeight,view:t.closest('.document').clientHeight}));assert.ok(info.scroll<=info.client+2,JSON.stringify(info));assert.ok(info.outer>info.view);}
try{
 await p.goto(base);await p.locator('.welcome').waitFor();await action('new');await p.locator('#edit-title').fill(title);await p.locator('#edit-body').fill(content);await frames();
 await p.locator('#edit-body').evaluate(el=>{window.originalBody=el;el.setSelectionRange(15,28);});
 await check('long editor uses a single document scrollbar with a sticky title and tools',async()=>{
  await singleScroll();const before=await p.locator('.editor-header').boundingBox();await p.locator('.document').evaluate(el=>el.scrollTop=800);await frames();const after=await p.locator('.editor-header').boundingBox();assert.ok(Math.abs(before.y-after.y)<2);await sameDraft();
 });
 await check('Save keeps editing, the same input, and selection; Ctrl E explicitly changes view',async()=>{
  await action('save');await sameDraft();assert.deepEqual(await p.locator('#edit-body').evaluate(t=>[t.selectionStart,t.selectionEnd]),[15,28]);
  await p.keyboard.press('Control+e');await p.locator('#markdown').waitFor();assert.match(await p.locator('#markdown').innerText(),/70\. 오늘의 관찰/);
  await p.keyboard.press('Control+e');await p.locator('#edit-body').waitFor();await p.locator('#edit-body').evaluate(el=>window.originalBody=el);
 });
 await check('one-click focus restores each previous panel state and preserves the draft',async()=>{
  await action('nav'); // Sidebar collapsed, list expanded before entering focus.
  const prefs=await p.evaluate(()=>localStorage.getItem('pkos-panels-v1'));
  await action('writing-focus');assert.ok(await p.locator('.shell.writing-focus').count());assert.equal(await p.locator('.topbar').isVisible(),false);assert.equal(await p.locator('#record-panel').isVisible(),false);await sameDraft();
  await action('writing-focus');assert.equal(await p.locator('#library-sidebar').isVisible(),false);assert.equal(await p.locator('#record-panel').isVisible(),true);assert.equal(await p.evaluate(()=>localStorage.getItem('pkos-panels-v1')),prefs);
  await action('nav');await action('writing-focus');await p.keyboard.press('Escape');assert.equal(await p.locator('.shell.writing-focus').count(),0);assert.ok(await p.locator('#library-sidebar').isVisible());await sameDraft();
 });
 await check('readable and wide page widths apply without replacing editor content and persist',async()=>{
  await action('writing-focus');await frames();const normal=(await p.locator('.editor-page').boundingBox()).width;
  await action('note-menu');await action('page-width');await frames();const wide=(await p.locator('.editor-page').boundingBox()).width;assert.ok(wide>normal+200,{normal,wide});await sameDraft();await singleScroll();
  assert.equal(await p.evaluate(()=>localStorage.getItem('pkos-page-width-v1')),'wide');await action('writing-focus');
 });
 await check('extra tools and block mode remain reachable without losing Markdown',async()=>{
  await tools(true);await p.getByRole('button',{name:'블록으로 편집',exact:true}).click();assert.equal(await p.locator('#edit-body').isVisible(),false);assert.ok(await p.locator('.block-rich:visible').count());
  await p.getByRole('button',{name:'Markdown으로 편집',exact:true}).click();await sameDraft();await singleScroll();
  await p.locator('[data-editor-tool="commands"]').click();assert.ok(await p.locator('#editor-command-menu').isVisible());await p.keyboard.press('Escape');await tools(false);
 });
 await check('record, dictation and more tools are visible without horizontal scrolling on mobile',async()=>{
  for(const width of [390,320]){
   await p.setViewportSize({width,height:844});await frames();await singleScroll();
   for(const selector of ['[data-editor-tool="record"]','[data-editor-tool="dictate"]','[data-action="editor-tools"]']){const b=await p.locator(selector).boundingBox();assert.ok(b&&b.x>=0&&b.x+b.width<=width+1&&b.y+b.height<430&&b.height>=40,JSON.stringify(b));}
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await tools(true);assert.ok(await p.getByRole('button',{name:'사진 촬영',exact:true}).isVisible());await tools(false);
  }
  await p.screenshot({path:path.join(out,'mobile-editor.png')});await action('writing-focus');await p.screenshot({path:path.join(out,'mobile-focus.png')});await action('writing-focus');
 });
 await check('reading view starts earlier on mobile and notebook metadata has readable contrast',async()=>{
  await p.setViewportSize({width:390,height:844});await p.keyboard.press('Control+e');await p.locator('#markdown').waitFor();
  const top=(await p.locator('#markdown').boundingBox()).y;assert.ok(top<400,'body starts at '+top);
  const ratio=await p.locator('.page-eyebrow').evaluate(el=>{const color=getComputedStyle(el).color.match(/[\d.]+/g).slice(0,3).map(Number);const l=color.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);return 1.05/(l+.05);});assert.ok(ratio>=4.5);await p.screenshot({path:path.join(out,'mobile-reader.png')});
 });
 await check('reload keeps width choice and every saved paragraph',async()=>{
  await p.reload();await p.locator('#markdown').waitFor();assert.equal(await p.evaluate(()=>document.documentElement.dataset.pageWidth),'wide');assert.match(await p.locator('#markdown').innerText(),/70\. 오늘의 관찰/);
  await p.setViewportSize({width:1366,height:768});await action('edit');await action('writing-focus');await p.screenshot({path:path.join(out,'desktop-focus.png')});
 });
 await check('search exits focus and the editing shortcut ignores overview and graph views',async()=>{
  await p.keyboard.press('Control+k');await p.locator('#search').waitFor();assert.equal(await p.locator('.shell.writing-focus').count(),0);assert.equal(await p.locator('#search').evaluate(el=>document.activeElement===el),true);
  for(const view of ['overview','graph']){await p.locator(`[data-view="${view}"]`).click();await p.keyboard.press('Control+e');assert.equal(await p.locator('#edit-body').count(),0);}
  await p.locator('[data-view="all"]').click();await p.locator('.note-row').first().click();await p.locator('#markdown').waitFor();await action('edit');await action('writing-focus');
 });
 await check('offline reload includes the new layout module and styles',async()=>{
  await p.keyboard.press('Control+e');await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await ctx.setOffline(true);await p.reload();await p.locator('#markdown').waitFor();await action('edit');await action('writing-focus');await singleScroll();await ctx.setOffline(false);
 });
 assert.deepEqual(errors,[]);
}catch(error){await p.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({base,checks,errors},null,2));await browser.close();}
console.log(checks.length+' checks passed');
