import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser} from './browser-runtime.mjs';
const base=process.argv[2]||'http://127.0.0.1:8899/',out=process.env.PKOS_APPEARANCE_TEST_OUT||'test-results/appearance-20261009';await fs.mkdir(out,{recursive:true});
const browser=await launchBrowser(),checks=[],errors=[],consoleErrors=[];
const context=await browser.newContext({viewport:{width:1460,height:1000}});
await context.addInitScript(()=>{if(window!==top)return;localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');});
const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
const action=name=>p.locator(`[data-action="${name}"]:visible`).first().click();
const close=()=>p.locator('#dialog [data-action="dialog-close"]').first().click();
const color=()=>p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
const open=()=>action('appearance');
const contrastRatio=(selector='#dialog footer .primary')=>p.locator(selector).evaluate(el=>{const s=getComputedStyle(el),lum=rgb=>rgb.match(/[\d.]+/g).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);const a=lum(s.color),b=lum(s.backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
async function check(name,fn){await fn();checks.push(name);console.log('OK',name);}
try{
 await p.goto(base);await p.locator('.welcome').waitFor();
 await check('blue default and opaque colored icons across sidebar navigation',async()=>{
  assert.equal(await color(),'#2563eb');
  const icons=await p.locator('.sidebar nav .ui-icon').evaluateAll(items=>items.map(svg=>({name:svg.getAttribute('class'),opaque:[...svg.querySelectorAll('[fill]')].some(shape=>{const c=getComputedStyle(shape);return c.fill!=='none'&&c.fill!=='rgba(0, 0, 0, 0)'&&Number(c.fillOpacity)===1&&Number(c.opacity)===1;})})));
  assert.ok(icons.length>=6);assert.ok(icons.every(i=>i.opaque));
  assert.ok(await p.locator('.brand-mark .icon-brand').count());
 });
 await action('new');await p.locator('#edit-title').fill('테마색 시험 기록');await p.locator('#edit-body').fill('테마를 바꿔도 남아야 하는 의견');
 await check('changing theme updates controls without replacing the editor or draft',async()=>{
  await p.locator('#edit-body').evaluate(el=>{window.originalEditor=el;});
  await open();await p.getByRole('button',{name:'초록',exact:true}).click();assert.equal(await color(),'#238354');
  assert.equal(await p.locator('.doc-actions .primary').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(35, 131, 84)');
  assert.equal(await p.evaluate(()=>window.originalEditor===document.querySelector('#edit-body')),true);
  await close();assert.equal(await p.locator('#edit-body').inputValue(),'테마를 바꿔도 남아야 하는 의견');
  await p.screenshot({path:path.join(out,'green-editor-and-colored-icons.png')});
  await p.locator('.doc-actions [data-action="save"]').click();await p.locator('#markdown').waitFor();
 });
 await check('theme and saved record persist after reload',async()=>{
  await p.reload();await p.locator('#markdown').waitFor();assert.equal(await color(),'#238354');assert.match(await p.locator('#markdown').innerText(),/남아야 하는 의견/);
 });
 await check('custom bright colors keep button text readable including hover',async()=>{
  await open();await p.locator('#theme-color-hex').fill('#FFDD00');assert.equal(await color(),'#ffdd00');
  assert.equal(await p.locator('.brand-mark .icon-glyph').evaluate(el=>getComputedStyle(el).fill),'rgb(0, 0, 0)');
  assert.equal(await p.locator('.side-heading .icon-plus .icon-glyph').evaluate(el=>getComputedStyle(el).fill),'rgb(0, 0, 0)');
  assert.ok(await contrastRatio()>=4.5);await p.locator('#dialog footer .primary').hover();assert.ok(await contrastRatio()>=4.5);assert.ok(await contrastRatio('.nav-item.active')>=4.5);assert.ok(await contrastRatio('.theme-preview .tag')>=4.5);
  await p.screenshot({path:path.join(out,'custom-color-dialog.png')});
 });
 await check('invalid color input does not overwrite the last valid theme',async()=>{
  await p.locator('#theme-color-hex').fill('#broken');assert.equal(await p.locator('#theme-color-hex').getAttribute('aria-invalid'),'true');assert.equal(await color(),'#ffdd00');
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('pkos-appearance-v1')).color),'#ffdd00');
 });
 await check('preset selection and reset work while the open second tab follows the selected color',async()=>{
  const other=await context.newPage();await other.goto(base);await other.locator('.topbar').waitFor();
  await p.getByRole('button',{name:'주황',exact:true}).click();await other.waitForFunction(()=>document.documentElement.dataset.themeColor==='#c65d18');
  assert.ok(await contrastRatio('.nav-item.active')>=4.5);assert.ok(await contrastRatio('.theme-preview .tag')>=4.5);
  assert.equal(await p.getByRole('button',{name:'주황',exact:true}).getAttribute('aria-pressed'),'true');
  await p.locator('[data-appearance-reset]').click();await other.waitForFunction(()=>document.documentElement.dataset.themeColor==='#2563eb');await other.close();
 });
 await check('mobile theme picker remains visible and usable at 390px and 320px',async()=>{
  await close();for(const width of [390,320]){await p.setViewportSize({width,height:844});await open();await p.getByRole('button',{name:'청록',exact:true}).click();
   assert.ok(await p.locator('#dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await close();
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await p.locator('.theme-launch').isVisible());}
  await p.screenshot({path:path.join(out,'mobile-teal.png')});
 });
 await check('offline reload retains chosen theme and filled icons',async()=>{
  await p.evaluate(async()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);await p.reload();await p.locator('.topbar').waitFor();assert.equal(await color(),'#087f8c');assert.ok(await p.locator('.theme-launch .icon-palette').count());await context.setOffline(false);
 });
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
}catch(error){await p.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({base,checks,errors,consoleErrors},null,2));await browser.close();}
console.log(checks.length+' checks passed');
