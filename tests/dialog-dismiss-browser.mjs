import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser} from './browser-runtime.mjs';

const base=process.env.PKOS_TEST_URL||process.argv[2]||'http://127.0.0.1:8915/';
const out=process.env.PKOS_DIALOG_TEST_OUT||'test-results/dialog-dismiss-20261015';
await fs.mkdir(out,{recursive:true});
const browser=await launchBrowser(),checks=[],errors=[];
const context=await browser.newContext({viewport:{width:1440,height:960},hasTouch:true});
await context.addInitScript(()=>{
 localStorage.setItem('pkos-guide-v1','done');localStorage.setItem('pkos-folder-guide-v1','done');
 window.testSpeechStops=0;window.testStreams=[];
 window.SpeechRecognition=class {
  start(){setTimeout(()=>{this.onstart?.();const result=[{transcript:'가상 받아쓰기 보관 시험'}];result.isFinal=true;this.onresult?.({resultIndex:0,results:[result]});},10);}
  stop(){window.testSpeechStops++;setTimeout(()=>this.onend?.(),0);}
  abort(){this.onend?.();}
 };
 navigator.mediaDevices.getUserMedia=async()=>{
  const audio=new AudioContext();await audio.resume();
  const oscillator=audio.createOscillator(),destination=audio.createMediaStreamDestination();
  oscillator.connect(destination);oscillator.start();window.testAudio=audio;
  window.testStreams.push(destination.stream);return destination.stream;
 };
});
const page=await context.newPage();
page.on('pageerror',error=>errors.push(error.message));
const action=name=>page.locator(`[data-action="${name}"]:visible`).first().click();
const outside=async selector=>{
 const box=await page.locator(selector).boundingBox();assert.ok(box);
 const viewport=page.viewportSize();
 const points=[[2,2],[viewport.width-2,2],[2,viewport.height-2],[viewport.width-2,viewport.height-2]];
 const point=points.find(([x,y])=>x<box.x||x>box.x+box.width||y<box.y||y>box.y+box.height);
 assert.ok(point,'dialog must leave a clickable backdrop');return {x:point[0],y:point[1]};
};
const dismiss=async selector=>{const p=await outside(selector);await page.mouse.click(p.x,p.y);};
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS',name);};
const tool=async name=>{const button=page.locator(`[data-editor-tool="${name}"]`);if(!await button.isVisible())await action('editor-tools');await button.click();};

try{
 await page.goto(base);await page.locator('.welcome').waitFor();
 await check('installer is idempotent and backdrop click cancels once without activating underlying controls',async()=>{
  assert.equal(await page.evaluate(async()=>{const {installDialogBackdropDismiss}=await import('./dialog-dismiss.js');return installDialogBackdropDismiss()===installDialogBackdropDismiss();}),true);
  await page.evaluate(()=>{
   window.dismissProbe={cancel:0,close:0,behind:0};
   const behind=document.createElement('button');behind.id='backdrop-behind';behind.style.cssText='position:fixed;left:0;top:0;width:40px;height:40px';behind.textContent='behind';behind.onclick=()=>window.dismissProbe.behind++;document.body.append(behind);
   const d=document.createElement('dialog');d.id='backdrop-probe';d.style.cssText='width:320px;height:180px';d.innerHTML='<h2>바깥 닫기 시험</h2><textarea aria-label="선택할 글">드래그할 시험 글</textarea>';
   d.addEventListener('cancel',()=>window.dismissProbe.cancel++);d.addEventListener('close',()=>window.dismissProbe.close++);document.body.append(d);d.showModal();
  });
  const field=page.locator('#backdrop-probe textarea'),box=await field.boundingBox(),end=await outside('#backdrop-probe');
  await field.click();assert.equal(await page.locator('#backdrop-probe').evaluate(d=>d.open),true);
  await page.mouse.move(box.x+12,box.y+12);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:6});await page.mouse.up();
  assert.equal(await page.locator('#backdrop-probe').evaluate(d=>d.open),true,'drag from inside must keep dialog');
  await page.mouse.move(end.x,end.y);await page.mouse.down();await page.mouse.move(box.x+12,box.y+12,{steps:6});await page.mouse.up();
  assert.equal(await page.locator('#backdrop-probe').evaluate(d=>d.open),true,'drag into dialog must keep dialog');
  await page.mouse.click(end.x,end.y,{button:'right'});assert.equal(await page.locator('#backdrop-probe').evaluate(d=>d.open),true);
  await page.keyboard.press('Escape');
  // Reopen after checking native Escape too; the backdrop assertion uses fresh counters.
  await page.evaluate(()=>{const d=document.querySelector('#backdrop-probe');d.showModal();window.dismissProbe={cancel:0,close:0,behind:0};});
  await dismiss('#backdrop-probe');await page.waitForFunction(()=>window.dismissProbe.close===1);
  assert.deepEqual(await page.evaluate(()=>window.dismissProbe),{cancel:1,close:1,behind:0});
  await page.evaluate(()=>{document.querySelector('#backdrop-probe').remove();document.querySelector('#backdrop-behind').remove();});
 });
 await check('cancelled pointer, guarded close and nested dialogs retain the correct modal',async()=>{
  await page.evaluate(()=>{
   const lower=document.createElement('dialog');lower.id='backdrop-lower';lower.style.cssText='width:600px;height:350px';lower.textContent='아래 창';document.body.append(lower);lower.showModal();
   const upper=document.createElement('dialog');upper.id='backdrop-upper';upper.style.cssText='width:300px;height:160px';upper.textContent='위 창';window.blockBackdrop=true;window.blockedCancels=0;
   upper.addEventListener('cancel',e=>{if(window.blockBackdrop){window.blockedCancels++;e.preventDefault();}});document.body.append(upper);upper.showModal();
   for(const type of ['pointerdown','pointercancel','pointerup'])upper.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:42,isPrimary:true,button:0,clientX:2,clientY:2}));
   upper.dispatchEvent(new MouseEvent('click',{bubbles:true,button:0,clientX:2,clientY:2}));
  });
  assert.equal(await page.evaluate(()=>window.blockedCancels),0,'cancelled gesture cannot dismiss');
  await dismiss('#backdrop-upper');assert.equal(await page.evaluate(()=>window.blockedCancels),1);assert.equal(await page.locator('#backdrop-upper').evaluate(d=>d.open),true);
  await page.evaluate(()=>window.blockBackdrop=false);await dismiss('#backdrop-upper');
  assert.equal(await page.locator('#backdrop-upper').evaluate(d=>d.open),false);assert.equal(await page.locator('#backdrop-lower').evaluate(d=>d.open),true);
  await dismiss('#backdrop-lower');assert.equal(await page.locator('#backdrop-lower').evaluate(d=>d.open),false);
  await page.evaluate(()=>{document.querySelector('#backdrop-upper').remove();document.querySelector('#backdrop-lower').remove();});
 });
 await check('shared ask dialog cancels safely and a subsequent confirmation remains usable',async()=>{
  await action('folder-new');await page.locator('#ask-value').fill('취소할 가상 노트북');await dismiss('#dialog');
  await page.locator('#dialog').waitFor({state:'hidden'});
  await action('folder-new');await page.locator('#ask-value').fill('남길 가상 노트북');await action('ask-ok');await page.locator('#dialog').waitFor({state:'hidden'});
  const folders=await page.evaluate(async()=>{const {openStore}=await import('./store.js');return (await(await openStore(false)).get('meta','folders')).value;});
  assert.ok(folders.includes('남길 가상 노트북'));assert.ok(!folders.includes('취소할 가상 노트북'));
 });
 await action('new');await page.locator('#edit-title').fill('모달 바깥 닫기 가상 기록');await page.locator('#edit-body').fill('원래 본문을 보존합니다.');
 await check('empty dictation closes on backdrop, while active speech and unsaved text keep their guards',async()=>{
  await tool('dictate');await dismiss('.capture-dialog');await page.locator('.capture-dialog').waitFor({state:'detached'});
  await tool('dictate');await page.locator('[data-capture="speech"]').click();await page.waitForFunction(()=>document.querySelector('.transcript')?.value==='가상 받아쓰기 보관 시험');
  await dismiss('.capture-dialog');await page.waitForFunction(()=>window.testSpeechStops===1&&document.querySelector('[data-capture="speech-stop"]')?.hidden);
  assert.equal(await page.locator('.capture-dialog').isVisible(),true,'first dismissal stops speech before closing');
  const denied=page.waitForEvent('dialog').then(async dialog=>{assert.equal(dialog.type(),'confirm');await dialog.dismiss();});await dismiss('.capture-dialog');await denied;
  assert.equal(await page.locator('.capture-dialog').isVisible(),true);assert.equal(await page.locator('.transcript').inputValue(),'가상 받아쓰기 보관 시험');
  const accepted=page.waitForEvent('dialog').then(dialog=>dialog.accept());await dismiss('.capture-dialog');await accepted;await page.locator('.capture-dialog').waitFor({state:'detached'});
  await tool('dictate');await page.locator('.capture-recovery').waitFor();assert.match(await page.locator('.capture-recovery').innerText(),/임시 보관/);
  await dismiss('.capture-dialog');await page.locator('.capture-dialog').waitFor({state:'detached'});
 });
 await check('active recording finishes and releases media tracks before a guarded backdrop close',async()=>{
  await tool('record');await page.locator('[data-capture="record-start"]').click();await page.locator('[data-capture="stop"]:visible').waitFor();
  await page.waitForFunction(()=>document.querySelector('.record-clock')?.textContent==='00:01');
  await dismiss('.capture-dialog');await page.locator('.record-result:not([hidden])').waitFor();
  assert.equal(await page.locator('.capture-dialog').isVisible(),true);
  assert.equal(await page.evaluate(()=>window.testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
  const accepted=page.waitForEvent('dialog').then(dialog=>dialog.accept());await dismiss('.capture-dialog');await accepted;await page.locator('.capture-dialog').waitFor({state:'detached'});
  await page.evaluate(()=>window.testAudio.close());
 });
 await check('blank drawing closes when untouched and confirms before discarding strokes',async()=>{
  await page.evaluate(async()=>{const {openPageDrawing}=await import('./page-drawing-editor.js');window.drawingResult='pending';void openPageDrawing({onSave:()=>{throw Error('test must not save');}}).then(value=>window.drawingResult=value);});
  await page.locator('.page-drawing-canvas:not([hidden])').waitFor();await dismiss('.page-drawing-dialog');await page.locator('.page-drawing-dialog').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.drawingResult),false);
  await page.evaluate(async()=>{const {openPageDrawing}=await import('./page-drawing-editor.js');void openPageDrawing({onSave:()=>{throw Error('test must not save');}});});
  await page.locator('.page-drawing-canvas:not([hidden])').waitFor();const b=await page.locator('.page-drawing-canvas').boundingBox();
  await page.mouse.move(b.x+b.width*.2,b.y+b.height*.3);await page.mouse.down();await page.mouse.move(b.x+b.width*.5,b.y+b.height*.6,{steps:8});await page.mouse.up();
  await dismiss('.page-drawing-dialog');await page.locator('.page-drawing-confirm:not([hidden])').waitFor();await page.locator('[data-drawing-action="keep-editing"]').click();
  assert.equal(await page.locator('[data-drawing-action="undo"]').isEnabled(),true);
  await dismiss('.page-drawing-dialog');await page.locator('[data-drawing-action="discard"]').click();await page.locator('.page-drawing-dialog').waitFor({state:'detached'});
 });
 await check('touch backdrop closes on a narrow viewport without losing the underlying draft',async()=>{
  await page.setViewportSize({width:390,height:844});await tool('dictate');await page.screenshot({path:path.join(out,'mobile-dictation-dialog.png')});
  const p=await outside('.capture-dialog');await page.touchscreen.tap(p.x,p.y);await page.locator('.capture-dialog').waitFor({state:'detached'});
  assert.equal(await page.locator('#edit-body').inputValue(),'원래 본문을 보존합니다.');
 });
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({base,checks,errors,limits:['Camera/microphone input and speech recognition use synthetic fixtures in an isolated browser profile.']},null,2));
 console.log(JSON.stringify({passed:checks.length,errors,out}));
}catch(error){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({base,checks,errors,error:error.stack},null,2));await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
finally{await context.close();await browser.close();}
