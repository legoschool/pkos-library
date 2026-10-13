// Isolated synthetic writing records; never reads user folders or a real browser profile.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser,stubGoogle} from './browser-runtime.mjs';

const baseline=process.argv.includes('--baseline');
const base=process.env.PKOS_TEST_URL||'http://127.0.0.1:8899/';
const out=process.env.PKOS_COMPACT_TEST_OUT||'test-results/editor-compact-20261013';
await fs.mkdir(out,{recursive:true});
const previousMeasurements=await fs.readFile(path.join(out,'baseline.json'),'utf8').then(text=>JSON.parse(text).measurements).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
const browser=await launchBrowser();
const ctx=await browser.newContext({viewport:{width:2048,height:1008},serviceWorkers:'block'});
await ctx.addInitScript(()=>{localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');});
await stubGoogle(ctx);
const p=await ctx.newPage(),checks=[],measurements=[],errors=[];
p.on('pageerror',e=>errors.push(e.message));
p.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const action=name=>p.locator(`[data-action="${name}"]:visible`).first().click();
const frames=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const title='가상대 경험하며 배우기';
const content=Array.from({length:25},(_,i)=>`${i+1}. 수업에서 배운 점과 내 생각을 기록합니다.\n\n`).join('');
async function tools(open){const button=p.locator('[data-action="editor-tools"]');if((await button.getAttribute('aria-expanded')==='true')!==open)await button.click();await frames();}
async function focus(open){if((await p.locator('.shell.writing-focus').count()>0)!==open)await action('writing-focus');await frames();}
async function width(wide){if(await p.evaluate(()=>document.documentElement.dataset.pageWidth)===(wide?'wide':'readable'))return;await action('note-menu');await action('page-width');await frames();}
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function section(kind,open){
 const button=p.locator(`[data-action="editor-${kind}-toggle"]`),panel=p.locator(`#editor-${kind}`);
 assert.equal(await button.getAttribute('aria-controls'),`editor-${kind}`);
 if((await button.getAttribute('aria-expanded')==='true')!==open)await button.click();
 await frames();assert.equal(await button.getAttribute('aria-expanded'),String(open));
 assert.equal(await panel.isVisible(),open,`${kind} visibility`);
}
async function rememberInputs(){await p.evaluate(()=>{
 window.originalBody=document.querySelector('#edit-body');window.originalTitle=document.querySelector('#edit-title');
 window.originalProperties=['#edit-folder','#edit-status','#edit-tags','#edit-review'].map(selector=>({selector,node:document.querySelector(selector),value:document.querySelector(selector).value}));
});}
async function sameProperties(){assert.equal(await p.evaluate(()=>window.originalProperties.every(({selector,node,value})=>document.querySelector(selector)===node&&node.value===value)),true,'metadata values and DOM preserved');}
async function togglesReachable(){
 const viewport=p.viewportSize();
 for(const kind of ['meta','toolbar']){
  const button=p.locator(`[data-action="editor-${kind}-toggle"]`),b=await button.boundingBox();
  assert.ok(b&&b.x>=0&&b.x+b.width<=viewport.width+1&&b.y>=0&&b.y+b.height<=viewport.height,`${kind} reopening control fits viewport`);
  assert.ok(await button.getAttribute('aria-label')||await button.getAttribute('title')||await button.innerText(),`${kind} toggle has accessible label`);
  assert.equal(await button.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,`${kind} toggle is not covered`);
 }
}
async function sameDraft(expectedTitle=title){
 assert.equal(await p.locator('#edit-title').inputValue(),expectedTitle);
 assert.equal(await p.locator('#edit-body').inputValue(),content);
 assert.equal(await p.evaluate(()=>document.querySelector('#edit-body')===window.originalBody),true,'body DOM preserved');
 assert.equal(await p.evaluate(()=>document.querySelector('#edit-title')===window.originalTitle),true,'title DOM preserved');
}
async function singleRow(){
 const boxes=await p.locator('.format-bar button:visible').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent.trim(),y:r.y,height:r.height};}));
 assert.ok(boxes.length>=14,'all expanded editor actions remain available');
 // A thin scrollbar may move the pinned toggle by a few pixels without creating another row.
 assert.ok(Math.max(...boxes.map(b=>b.y))-Math.min(...boxes.map(b=>b.y))<=6,JSON.stringify(boxes));
 assert.ok(Math.max(...boxes.map(b=>b.y))<Math.min(...boxes.map(b=>b.y+b.height)),JSON.stringify(boxes));
}
async function layoutSafe(){
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no page horizontal overflow');
 const boxes=await p.evaluate(()=>{
  const b=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  return {title:b('#edit-title'),actions:b('.editor-header .doc-actions'),header:b('.editor-header')};
 });
 assert.ok(boxes.title.x>=0&&boxes.title.right<=(await p.viewportSize()).width+1,'title fits viewport');
 assert.ok(boxes.title.width>=70,'title has usable width');
 assert.ok(boxes.title.bottom<=boxes.actions.y+1||boxes.actions.bottom<=boxes.title.y+1||boxes.title.right<=boxes.actions.x+1||boxes.actions.right<=boxes.title.x+1,'title and action buttons do not overlap');
 assert.ok(boxes.title.y-boxes.header.y<=16,'title starts near top of editor');
}
async function measure(name){
 await p.locator('.document').evaluate(el=>el.scrollTop=0);
 await frames();
 const layout=await p.evaluate(()=>{
  const box=selector=>{const el=document.querySelector(selector),r=el?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}:null;};
  return {header:box('.editor-header'),title:box('#edit-title'),body:box('#edit-body'),toolbar:box('.format-bar'),document:box('.document'),tools:[...document.querySelectorAll('.format-bar button')].filter(e=>e.getClientRects().length).map(e=>({text:e.textContent.trim(),y:e.getBoundingClientRect().y,height:e.getBoundingClientRect().height})),overflow:document.documentElement.scrollWidth>innerWidth};
 });
 measurements.push({name,...layout});
 await p.screenshot({path:path.join(out,`${baseline?'before':'after'}-${name}.png`)});
 return layout;
}
try{
 await p.goto(base);await p.locator('.welcome').waitFor();await action('new');
 await p.locator('#edit-title').fill(title);await p.locator('#edit-body').fill(content);await tools(true);
 await p.evaluate(()=>{window.originalBody=document.querySelector('#edit-body');window.originalTitle=document.querySelector('#edit-title');});
 await measure('2048-normal-readable');
 await action('writing-focus');await measure('2048-focus-readable');
 await action('note-menu');await action('page-width');await measure('2048-focus-wide');
 await action('writing-focus');await measure('2048-normal-wide');
 if(!baseline){
  await check('title uses the upper row and expanded tools share one row in normal and focus modes',async()=>{
   for(const viewport of [{width:2048,height:1008},{width:1366,height:768}]){
    await p.setViewportSize(viewport);
    for(const focused of [false,true])for(const wide of [false,true]){
     await focus(focused);await width(wide);await tools(true);
     await singleRow();await layoutSafe();await sameDraft();
     const after=await measure(`${viewport.width}-${focused?'focus':'normal'}-${wide?'wide':'readable'}`);
     assert.ok(after.header.height<170,'compact expanded header: '+after.header.height);
     if(viewport.width===2048){
      const old=previousMeasurements.find(m=>m.name===after.name);
      if(old)assert.ok(old.header.height-after.header.height>=50,'at least 50px more room for the record');
     }
    }
   }
  });
  await check('expanding tools keeps the same header height and every command remains reachable',async()=>{
   await p.setViewportSize({width:1366,height:768});await focus(false);await width(false);
   await tools(false);const closed=await p.locator('.editor-header').boundingBox();
   await tools(true);const opened=await p.locator('.editor-header').boundingBox();
   assert.ok(Math.abs(closed.height-opened.height)<=2,JSON.stringify({closed,opened}));
   await p.locator('[data-editor-tool="commands"]').click();await p.locator('#editor-command-menu:not([hidden])').waitFor();
   assert.ok(await p.locator('#editor-command-menu [role="option"]').count()>0);
   await p.keyboard.press('Escape');await tools(true);
   await p.getByRole('button',{name:'블록으로 편집',exact:true}).click();await p.locator('.block-rich:visible').first().waitFor();
   await p.getByRole('button',{name:'Markdown으로 편집',exact:true}).click();await sameDraft();
  });
  await check('long title does not cover Save, focus, or menu and title/body values stay intact',async()=>{
   const longTitle='가상대 경험하며 배우기 — 수업에서 배운 점을 돌아보고 다음 실천으로 연결하는 생각과 질문 '.repeat(5);
   await p.locator('#edit-title').fill(longTitle);
   for(const focused of [false,true]){await focus(focused);await layoutSafe();await sameDraft(longTitle);await measure(`1366-${focused?'focus':'normal'}-long-title`);}
   for(const name of ['save','writing-focus','note-menu'])assert.ok(await p.locator(`.editor-header [data-action="${name}"]`).isVisible());
   await p.locator('#edit-title').fill(title);
  });
  await check('320px and 390px keep a single tool row, no document overflow, and reachable toggle and commands',async()=>{
   for(const mobileWidth of [390,320]){
    await p.setViewportSize({width:mobileWidth,height:844});
    for(const focused of [false,true]){
     await focus(focused);await tools(false);const closed=await p.locator('.editor-header').boundingBox();
     await tools(true);await singleRow();await layoutSafe();await sameDraft();
     const opened=await p.locator('.editor-header').boundingBox();assert.ok(Math.abs(closed.height-opened.height)<=2,'mobile expansion stays one row');
     const toggle=await p.locator('[data-action="editor-tools"]').boundingBox();
     assert.ok(toggle.x>=0&&toggle.x+toggle.width<=mobileWidth+1,'toggle reachable without horizontal document scrolling');
     await p.getByRole('button',{name:'블록으로 편집',exact:true}).click();await p.locator('.block-rich:visible').first().waitFor();
     await p.getByRole('button',{name:'Markdown으로 편집',exact:true}).click();await sameDraft();
     await p.locator('[data-editor-tool="commands"]').click();await p.locator('#editor-command-menu:not([hidden])').waitFor();
     const menu=await p.locator('#editor-command-menu').boundingBox();assert.ok(menu.x>=0&&menu.x+menu.width<=mobileWidth+1,'command menu fits mobile');
     await p.keyboard.press('Escape');await tools(true);await singleRow();
     await measure(`${mobileWidth}-${focused?'focus':'normal'}-expanded`);
    }
   }
  });
  await check('metadata, input identity, selection and focus survive saving and layout changes',async()=>{
   await p.setViewportSize({width:1366,height:768});await focus(false);await tools(false);
   await p.locator('.properties summary').click();await p.locator('#edit-tags').fill('가상 시험, 여백');await p.locator('#edit-status').selectOption('정리 중');await p.locator('#edit-review').fill('2026-10-20');
   await p.locator('.properties summary').click();
   await p.locator('#edit-body').focus();await p.locator('#edit-body').evaluate(el=>el.setSelectionRange(15,28));
   await p.keyboard.press('Control+s');await sameDraft();
   assert.equal(await p.locator('#edit-body').evaluate(el=>document.activeElement===el),true,'keyboard save preserves body focus');
   assert.deepEqual(await p.locator('#edit-body').evaluate(el=>[el.selectionStart,el.selectionEnd]),[15,28]);
   await focus(true);await tools(true);await tools(false);await focus(false);await action('save');await sameDraft();
   assert.deepEqual(await p.locator('#edit-body').evaluate(el=>[el.selectionStart,el.selectionEnd]),[15,28]);
   assert.equal(await p.locator('#edit-tags').inputValue(),'가상 시험, 여백');assert.equal(await p.locator('#edit-status').inputValue(),'정리 중');assert.equal(await p.locator('#edit-review').inputValue(),'2026-10-20');
   await p.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='저장됨');
   await p.reload();await p.locator('#markdown').waitFor();assert.equal(await p.locator('#markdown li').count(),25);
   await action('edit');assert.equal(await p.locator('#edit-title').inputValue(),title);assert.equal(await p.locator('#edit-body').inputValue(),content);
   assert.equal(await p.locator('#edit-tags').inputValue(),'가상 시험, 여백');assert.equal(await p.locator('#edit-status').inputValue(),'정리 중');assert.equal(await p.locator('#edit-review').inputValue(),'2026-10-20');
  });
  await check('metadata and complete toolbar hide independently without replacing inputs or losing their values',async()=>{
   await rememberInputs();await section('meta',true);await section('toolbar',true);await tools(true);
   const full=(await p.locator('.editor-header').boundingBox()).height;
   await section('meta',false);assert.equal(await p.locator('#editor-toolbar').isVisible(),true);
   const withoutMeta=(await p.locator('.editor-header').boundingBox()).height;assert.ok(withoutMeta<full-10,'hiding metadata gives space back');
   await section('meta',true);await section('toolbar',false);assert.equal(await p.locator('#editor-meta').isVisible(),true);
   const withoutTools=(await p.locator('.editor-header').boundingBox()).height;assert.ok(withoutTools<full-30,'hiding toolbar gives space back');
   await section('meta',false);const bothHidden=(await p.locator('.editor-header').boundingBox()).height;
   assert.ok(bothHidden<Math.min(withoutMeta,withoutTools)-10,'hiding both leaves only title controls');
   await sameDraft();await sameProperties();await togglesReachable();
   for(const focused of [true,false]){
    await focus(focused);assert.equal(await p.locator('#editor-meta').isVisible(),false);assert.equal(await p.locator('#editor-toolbar').isVisible(),false);
    await sameDraft();await sameProperties();await togglesReachable();await measure(`1366-${focused?'focus':'normal'}-sections-hidden`);
   }
   await p.locator('#edit-body').focus();await p.keyboard.press('Control+s');await sameDraft();await sameProperties();
   assert.equal(await p.locator('#edit-body').evaluate(el=>document.activeElement===el),true,'saving with both sections hidden preserves focus');
   assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('pkos-editor-sections-v1'))),{metaHidden:true,toolbarHidden:true});
  });
  await check('mobile section reopening buttons stay reachable with either or both rows hidden',async()=>{
   for(const mobileWidth of [390,320]){
    await p.setViewportSize({width:mobileWidth,height:844});
    for(const focused of [false,true]){
     await focus(focused);await section('meta',false);await section('toolbar',false);await togglesReachable();await layoutSafe();
     const hiddenLayout=await measure(`${mobileWidth}-${focused?'focus':'normal'}-sections-hidden`);
     assert.ok(hiddenLayout.header.height<110,'mobile title and actions use two compact rows when sections are hidden');
     // Reopen each independently using keyboard and pointer controls in the persistent title row.
     await p.locator('[data-action="editor-meta-toggle"]').focus();await p.keyboard.press('Enter');await frames();
     assert.equal(await p.locator('#editor-meta').isVisible(),true);assert.equal(await p.locator('#editor-toolbar').isVisible(),false);
     await section('meta',false);await section('toolbar',true);
     assert.equal(await p.locator('#editor-meta').isVisible(),false);await singleRow();await togglesReachable();
     await section('meta',true);await singleRow();await layoutSafe();await sameDraft();await sameProperties();
     await measure(`${mobileWidth}-${focused?'focus':'normal'}-sections-reopened`);
    }
   }
  });
  await check('each section preference survives reload and reopened metadata retains saved values',async()=>{
   await p.setViewportSize({width:1366,height:768});await focus(false);
   for(const preferences of [{metaHidden:true,toolbarHidden:true},{metaHidden:true,toolbarHidden:false},{metaHidden:false,toolbarHidden:true}]){
    await section('meta',!preferences.metaHidden);await section('toolbar',!preferences.toolbarHidden);
    assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('pkos-editor-sections-v1'))),preferences);
    await p.reload();await p.locator('#markdown').waitFor();await action('edit');
    assert.equal(await p.locator('#editor-meta').isVisible(),!preferences.metaHidden);assert.equal(await p.locator('#editor-toolbar').isVisible(),!preferences.toolbarHidden);
    for(const [kind,hidden] of [['meta',preferences.metaHidden],['toolbar',preferences.toolbarHidden]])assert.equal(await p.locator(`[data-action="editor-${kind}-toggle"]`).getAttribute('aria-expanded'),String(!hidden));
    await togglesReachable();assert.equal(await p.locator('#edit-title').inputValue(),title);assert.equal(await p.locator('#edit-body').inputValue(),content);
    assert.equal(await p.locator('#edit-tags').inputValue(),'가상 시험, 여백');assert.equal(await p.locator('#edit-status').inputValue(),'정리 중');assert.equal(await p.locator('#edit-review').inputValue(),'2026-10-20');
   }
   await section('meta',true);await section('toolbar',true);await rememberInputs();await tools(true);await singleRow();await sameDraft();await sameProperties();
  });
 }
 assert.deepEqual(errors,[]);
 await fs.rm(path.join(out,`${baseline?'before':'after'}-failure.png`),{force:true});
}catch(error){await p.screenshot({path:path.join(out,`${baseline?'before':'after'}-failure.png`)}).catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(out,`${baseline?'baseline':'verification'}.json`),JSON.stringify({base,checks,measurements,errors},null,2));await browser.close();}
console.log(JSON.stringify({checks,measurements:measurements.map(m=>({name:m.name,headerHeight:m.header.height,titleY:m.title.y,bodyY:m.body.y,toolbarHeight:m.toolbar.height}))},null,2));
