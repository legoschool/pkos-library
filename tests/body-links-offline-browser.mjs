import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser} from './browser-runtime.mjs';

const base=process.argv[2]||'http://127.0.0.1:8901/';
const out=process.env.PKOS_LINKS_OFFLINE_OUT||'test-results/body-links-offline-20261013';
await fs.mkdir(out,{recursive:true});
const browser=await launchBrowser(),context=await browser.newContext();
await context.addInitScript(()=>{localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');});
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const action=name=>page.locator(`[data-action="${name}"]:visible`).first().click();
const first='https://example.org/offline-lesson',second='https://example.org/offline-notes';
try{
 await page.goto(base);await page.locator('.welcome').waitFor();await action('new');
 await page.locator('#edit-title').fill('가상 오프라인 링크 기록');
 await page.locator('#edit-body').fill('오프라인에서도 주소를 보관합니다. '+first);
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='저장됨');
 await page.waitForFunction(async()=>navigator.serviceWorker.controller&&await caches.match(new URL('./body-links.js',location.href).href)&&await caches.match(new URL('./body-links-model.js',location.href).href));
 checks.push('new link modules are cached and the initial URL is saved');
 await context.setOffline(true);await page.reload();
 await page.locator('#body-link-previews a.body-link-open').waitFor();
 assert.equal(await page.locator('#body-link-previews a').getAttribute('href'),first);
 checks.push('offline reload restores a clickable card from saved Markdown');
 await action('edit');await page.locator('#edit-body').fill('오프라인 수정 '+first+'\n\n'+second);
 await page.waitForFunction(()=>document.querySelectorAll('.body-link-card').length===2);
 await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='저장됨');
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.body-link-card').length===2);
 assert.deepEqual(await page.locator('#body-link-previews a').evaluateAll(links=>links.map(a=>a.href)),[first,second]);
 checks.push('offline edits save and regenerate both cards on the next reload');
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'offline-link-cards.png')});
}catch(error){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({base,checks,errors},null,2));await browser.close();}
console.log(checks.length+' offline checks passed');
