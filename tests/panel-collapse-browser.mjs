// Panel toggles use a disposable browser profile and fictional demo records only.
// Usage: node tests/panel-collapse-browser.mjs [http://127.0.0.1:8898/]
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {launchBrowser, stubGoogle} from './browser-runtime.mjs';

const BASE=process.argv[2]||'http://127.0.0.1:8898/';
const out=fileURLToPath(new URL('../test-results/panel-collapse-20261008/',import.meta.url));
await mkdir(out,{recursive:true});
const browser=await launchBrowser();
const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
await context.addInitScript(()=>{localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');});
await stubGoogle(context);
const page=await context.newPage(),errors=[],consoleErrors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
const nav=()=>page.locator('.topbar [data-action="nav"]');
const list=()=>page.locator('.topbar [data-action="list-toggle"]');
const action=name=>page.locator(`[data-action="${name}"]:visible`).first().click();
const tools=async(open=true)=>{const toggle=page.locator('[data-action="editor-tools"]');if((await toggle.getAttribute('aria-expanded')==='true')!==open)await toggle.click();};
const readSaved=async()=>{await action('save');assert.ok(await page.locator('#edit-body').isVisible(),'Save keeps the writing surface open');await page.keyboard.press('Control+e');await page.locator('#markdown.prose').waitFor();};
const screenshot=name=>page.screenshot({path:path.join(out,name+'.png'),fullPage:false});
const viewport=async(width,height)=>{await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
const visible=selector=>page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth;});
const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
async function panels(sidebar,records){
 assert.equal(await visible('#library-sidebar'),sidebar,'sidebar visible');
 assert.equal(await visible('#record-panel'),records,'record list visible');
 assert.equal(await nav().getAttribute('aria-expanded'),String(sidebar),'sidebar aria-expanded');
 assert.equal(await list().getAttribute('aria-expanded'),String(records),'list aria-expanded');
 await noOverflow();
}
async function check(name,fn){
 try{await fn();results.push({name,pass:true});console.log('OK',name);}
 catch(e){results.push({name,pass:false,error:e.stack||e.message});console.error('FAIL',name,e.message);await screenshot('failure-'+results.length);throw e;}
}
try{
 await page.goto(new URL('?demo=1',BASE).href);
 await page.locator('#record-panel .note-row').first().waitFor();
 await check('desktop panel buttons expose controls and initial expanded state',async()=>{
  assert.equal(await nav().getAttribute('aria-controls'),'library-sidebar');
  assert.equal(await list().getAttribute('aria-controls'),'record-panel');
  assert.equal(await nav().getAttribute('aria-label'),'메뉴 접기');
  assert.equal(await list().getAttribute('aria-label'),'기록 목록 접기');
  await panels(true,true);await screenshot('desktop-before');
 });
 await check('both panels collapse independently and restore from persistent topbar buttons',async()=>{
  await nav().click();await panels(false,true);
  assert.equal(await nav().getAttribute('aria-label'),'메뉴 펼치기');
  await list().click();await panels(false,false);
  assert.equal(await list().getAttribute('aria-label'),'기록 목록 펼치기');
  assert.equal(await visible('.document'),true);await screenshot('desktop-both-collapsed');
  await nav().click();await panels(true,false);
  await list().click();await panels(true,true);
 });
 await check('panel header arrows collapse each panel and folder icons have a solid yellow fill',async()=>{
  await page.locator('#library-sidebar [data-action="nav-collapse"]').click();await panels(false,true);
  await nav().click();await panels(true,true);
  await page.locator('#record-panel .list-collapse').click();await panels(true,false);
  await list().click();await panels(true,true);
  const folder=page.locator('.folder-list .folder-icon').first();assert.ok(await folder.isVisible());
  const artwork=await folder.evaluate(svg=>{
   const view=svg.viewBox.baseVal,bounds=svg.getBBox(),style=getComputedStyle(svg);
   const surfaces=[...svg.querySelectorAll('path')].map(path=>{
    const computed=getComputedStyle(path),rgb=computed.fill.match(/[\d.]+/g)?.map(Number),box=path.getBBox();
    if(!rgb||rgb.length<3)return null;
    const [r,g,b]=rgb.map(n=>n/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min,light=(max+min)/2;
    let hue=0;if(delta)hue=(max===r?(g-b)/delta+(g<b?6:0):max===g?(b-r)/delta+2:(r-g)/delta+4)*60;
    const saturation=delta?delta/(1-Math.abs(2*light-1)):0;
    return {hue,saturation,opacity:Number(computed.opacity)*Number(computed.fillOpacity)*(rgb[3]??1),area:box.width*box.height};
   }).filter(Boolean);
   return {width:bounds.width/view.width,height:bounds.height/view.height,opacity:Number(style.opacity),surfaces};
  });
  assert.ok(artwork.width>=.7&&artwork.height>=.55,'folder silhouette fills the icon with a visible tab and body');
  assert.ok(artwork.opacity>=.9,'folder artwork remains opaque');
  assert.ok(artwork.surfaces.filter(s=>s.area>0&&s.opacity>=.9&&s.hue>=25&&s.hue<=65&&s.saturation>=.35).length>=2,'folder has multiple opaque yellow surfaces');
  await screenshot('visible-collapse-yellow-folders');
 });
 await check('panel preferences persist across reload without changing selected record',async()=>{
  const title=await page.locator('.page-title').innerText();
  await nav().click();await list().click();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('pkos-panels-v1'))),{sidebarCollapsed:true,listCollapsed:true});
  await page.reload();await nav().waitFor();await panels(false,false);
  assert.equal(await page.locator('.page-title').innerText(),title);
 });
 await check('global search reopens a collapsed list and focuses its search input',async()=>{
  await page.keyboard.press('Control+k');await page.locator('#search').waitFor();
  await panels(false,true);assert.equal(await page.locator('#search').evaluate(e=>e===document.activeElement),true);
  await page.locator('#search').fill('질문');assert.ok(await page.locator('.note-row').count()>0);
  await page.locator('#search').fill('');await page.locator('.note-row').first().click();
 });
 await check('editor nodes, draft text, selection, and scroll survive panel toggles',async()=>{
  await action('edit');await page.locator('#edit-body').waitFor();
  const body='접기 시험용 가상 기록입니다.\n'.repeat(100);
  await page.locator('#edit-body').fill(body);
  await page.waitForFunction(()=>{const e=document.querySelector('#edit-body');return e.scrollHeight<=e.clientHeight+1;});
  await page.locator('#edit-body').evaluate(e=>{window.panelEditor=e;window.panelTitle=document.querySelector('#edit-title');e.setSelectionRange(7,25);document.querySelector('.document').scrollTop=180;window.panelScroll={body:e.scrollTop,document:document.querySelector('.document').scrollTop};});
  await list().click();await nav().click();await list().click();await nav().click();
  const result=await page.evaluate(()=>({sameBody:window.panelEditor===document.querySelector('#edit-body'),sameTitle:window.panelTitle===document.querySelector('#edit-title'),text:window.panelEditor.value,start:window.panelEditor.selectionStart,end:window.panelEditor.selectionEnd,bodyScroll:window.panelEditor.scrollTop,documentScroll:document.querySelector('.document').scrollTop,previous:window.panelScroll}));
  assert.equal(result.sameBody,true);assert.equal(result.sameTitle,true);assert.equal(result.text,body);
  assert.equal(result.start,7);assert.equal(result.end,25);assert.equal(result.bodyScroll,0,'the textarea has no separate scroll position');assert.equal(result.documentScroll,result.previous.document);
  await readSaved();
 });
 await check('card view remains useful when its record panel is collapsed',async()=>{
  await action('layout');assert.equal(await visible('.document'),false);
  await list().click();await panels(false,false);assert.equal(await visible('.document'),true);
  await screenshot('gallery-collapsed');await list().click();await panels(false,true);
  assert.equal(await page.locator('.notes.cards').isVisible(),true);
  await page.locator('.note-row').first().click();assert.equal(await visible('.document'),true);
 });
 await check('tablet drawer opens and Escape closes it while list collapse works independently',async()=>{
  await viewport(900,900);await noOverflow();
  assert.equal(await visible('#library-sidebar'),false);
  await nav().click();assert.equal(await visible('#library-sidebar'),true);assert.equal(await nav().getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');assert.equal(await visible('#library-sidebar'),false);assert.equal(await nav().getAttribute('aria-expanded'),'false');
  await list().click();await panels(false,false);await list().click();await panels(false,true);
  await screenshot('tablet-restored');
 });
 await check('desktop collapse preference cannot hide the phone list or strand its menu',async()=>{
  await viewport(1440,1000);await list().click();await panels(false,false);
  await viewport(390,844);
  assert.equal(await list().isVisible(),false);assert.equal(await visible('.document'),true);
  await action('back');assert.equal(await visible('#record-panel'),true);await noOverflow();
  await nav().click();assert.equal(await visible('#library-sidebar'),true);
  await page.keyboard.press('Escape');assert.equal(await visible('#library-sidebar'),false);
  await nav().click();await page.locator('.sidebar [data-view="all"]').click();
  assert.equal(await visible('#library-sidebar'),false);assert.equal(await visible('#record-panel'),true);
  await screenshot('mobile-list');await page.locator('.note-row').first().click();assert.equal(await visible('.document'),true);
 });
 await check('resizing across drawer breakpoint preserves accessible panel recovery',async()=>{
  await viewport(1100,900);await nav().click();assert.equal(await visible('#library-sidebar'),true);
  await viewport(1101,900);assert.equal(await visible('#library-sidebar'),false);
  await nav().click();assert.equal(await visible('#library-sidebar'),true);await noOverflow();
  await viewport(1440,1000);
  if(await list().getAttribute('aria-expanded')==='false')await list().click();
  await panels(true,true);await screenshot('desktop-restored');
 });
 for(const [width,height,label] of [[1440,1000,'desktop'],[390,844,'mobile']]){
  await check(`${label} editor title and complete format toolbar stay fixed during real document scrolling`,async()=>{
   await viewport(width,height);await action('edit');await page.locator('.editor-header').waitFor();
   const longBody=Array.from({length:45},(_,i)=>`가상 편집 기록 ${i+1}. 제목과 편집 메뉴를 고정한 채 본문을 계속 씁니다.`).join('\n\n');
   await page.locator('#edit-body').fill(longBody);
   assert.ok(await page.locator('#edit-body').evaluate((e,h)=>e.getBoundingClientRect().height>=h*.5,height),'writing area remains tall');
   const formatButtons=page.locator('.editor-header .format-bar button');
   assert.equal(await formatButtons.count(),14,'all formatting, media, linked-record and block controls remain in the fixed header');
   assert.equal(await page.locator('.editor-tools-main button').count(),6,'the common toolbar stays compact');
   await tools(true);
   await page.getByRole('button',{name:'블록으로 편집',exact:true}).click();
   await tools(false);
   assert.equal(await page.locator('.block-row').count(),45);
   await page.locator('.document').evaluate(e=>e.scrollTop=0);
   const before=await page.locator('.editor-header').evaluate(e=>({top:e.getBoundingClientRect().top,title:document.querySelector('#edit-title').getBoundingClientRect().top,toolbar:document.querySelector('.editor-header .format-bar').getBoundingClientRect().top,height:e.getBoundingClientRect().height}));
   assert.ok(before.height<260,`closed editor header fits compactly (${before.height}px)`);
   const doc=await page.locator('.document').boundingBox();
   await page.mouse.move(doc.x+doc.width-28,doc.y+doc.height-80);await page.mouse.wheel(0,750);
   await page.waitForFunction(()=>document.querySelector('.document').scrollTop>300);
   const after=await page.locator('.editor-header').evaluate(e=>({top:e.getBoundingClientRect().top,title:document.querySelector('#edit-title').getBoundingClientRect().top,toolbar:document.querySelector('.editor-header .format-bar').getBoundingClientRect().top}));
   assert.ok(Math.abs(after.top-before.top)<=1,'header top remains fixed');
   assert.ok(Math.abs(after.title-before.title)<=1,'title remains fixed');
   assert.ok(Math.abs(after.toolbar-before.toolbar)<=1,'format toolbar remains fixed');
   await screenshot(`editor-${label}-scrolled`);
   await tools(true);
   for(let i=0;i<await formatButtons.count();i++)await formatButtons.nth(i).click({trial:true});
   await tools(false);
   await noOverflow();
   await page.locator('.editor-header .properties summary').click();
   await page.locator('#edit-tags').fill('고정 메뉴 시험');
   const expanded=await page.locator('.editor-header').evaluate(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,documentBottom:document.querySelector('.document').getBoundingClientRect().bottom}));
   assert.ok(Math.abs(expanded.top-before.top)<=1,'open properties retain fixed header');
   assert.ok(expanded.documentBottom-expanded.bottom>=150,'open properties leave usable writing space');
   await noOverflow();await screenshot(`editor-${label}-properties`);
   await page.locator('.editor-header .properties summary').click();
   await tools(true);await page.getByRole('button',{name:'Markdown으로 편집',exact:true}).click();await tools(false);
   assert.equal(await page.locator('#edit-body').inputValue(),longBody);
   await readSaved();
  });
 }
 await check('fictional demo stays isolated and no page or console errors occur',async()=>{
  assert.equal(await page.locator('.demo-banner').isVisible(),true);
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
 });
}catch(e){process.exitCode=1;console.error(e.stack||e);}
finally{
 await writeFile(path.join(out,'verification.json'),JSON.stringify({base:BASE,results,errors,consoleErrors},null,2));
 await browser.close();
 console.log(`${results.filter(r=>r.pass).length}/${results.length} passed`);
}
