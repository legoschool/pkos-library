import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import('./browser-runtime.mjs');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});page.on('console',msg=>{if(msg.type()==='error')console.log('CONSOLE',msg.text());});
try{
 await page.addInitScript(()=>localStorage.setItem('pkos-guide-v1','done'));await page.goto('http://127.0.0.1:8898/');await page.waitForSelector('[data-action="new"]');
 await page.locator('[data-action="new"]').first().click();await page.locator('#edit-title').fill('새 기능 시험');await page.locator('#edit-body').fill('# 제목\n\n본문\n\n- [ ] 할 일\n');
 await page.getByRole('button',{name:'블록으로 편집',exact:true}).click();assert.equal(await page.locator('.block-row').count(),3);await page.locator('.block-row textarea').nth(1).fill('블록에서 수정\n\n');await page.locator('[data-action="save"]').last().click();await page.waitForSelector('#markdown');assert.ok((await page.locator('#markdown').innerText()).includes('블록에서 수정'));
 await page.locator('[data-action="database-new"]').click();await page.waitForSelector('#note-database');await page.locator('[data-db="add"]').click();await page.locator('[data-col="title"]').fill('테스트 행');await page.locator('[data-col="title"]').press('Tab');await page.waitForFunction(()=>document.querySelector('[data-db-status]')?.textContent==='저장됨');await page.reload();await page.waitForSelector('#note-database');assert.equal(await page.locator('[data-col="title"]').inputValue(),'테스트 행');
 await page.locator('[data-db-setting="view"]').selectOption('board');await page.waitForSelector('.db-board');await page.locator('[data-db-setting="view"]').selectOption('table');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'tests/workspace-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
 const data=await page.evaluate(async()=>{const {openStore}=await import('/store.js');const db=await openStore();const before=await db.all('notes');const {captureLocal}=await import('/sync-model.js');const payload={records:captureLocal(before,{},'test'),assets:[],folders:['수집함']};const record=structuredClone(before[0]);record.title='race';await db.save(record,record.revision);try{await db.applyCloudSnapshot(before,payload,'test');return {protected:false};}catch{return {protected:true,backup:await db.backup()};}});assert.ok(data.protected);assert.ok(data.backup.notes.some(n=>n.database));
 console.log('PASS UI: block persistence, database persistence, board, mobile, sync edit race');
 // Actual OCR engine and actual PDF rasterization, using synthetic content only.
 const ocr=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=1400;c.height=400;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,c.width,c.height);g.fillStyle='black';g.font='60px Arial';g.fillText('PKOS document recognition 2026',40,110);g.font='50px Malgun Gothic';g.fillText('자료를 다시 찾아 쓰는 기록장',40,230);const blob=await new Promise(r=>c.toBlob(r));const {recognizeDocument}=await import('/local-processing.js');return recognizeDocument({name:'synthetic.png',type:'image/png',blob},{progress:s=>console.log(s)});});console.log('OCR RESULT',ocr);assert.match(ocr,/PKOS/i);assert.match(ocr.replace(/\s/g,''),/기록장/);
 await writeFile('tests/workspace-browser-result.json',JSON.stringify({ui:true,ocr,errors},null,2));assert.deepEqual(errors,[]);
 if(process.env.PKOS_TEST_AI==='1'){
  console.log('Starting actual semantic model download and inference');
  const semantic=await page.evaluate(async()=>{const {embedText,cosine}=await import('/local-processing.js');const controller=new AbortController();const q=await embedText('학생들이 서로 돕는 모둠 수업',controller.signal,s=>console.log(s));const a=await embedText('협력 학습을 통해 친구들과 함께 문제를 해결한다.',controller.signal,s=>console.log(s));const b=await embedText('내일 비행기 항공권을 구입하고 호텔을 예약한다.',controller.signal,s=>console.log(s));return {related:cosine(q,a),unrelated:cosine(q,b),length:q.length};});console.log('SEMANTIC',semantic);assert.ok(semantic.related>semantic.unrelated);await writeFile('tests/semantic-result.json',JSON.stringify(semantic,null,2));
 }
}finally{await browser.close();}
