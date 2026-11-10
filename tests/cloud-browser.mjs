import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
const {chromium}=await import('./browser-runtime.mjs');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const files=new Map();let sequence=0;const errors=[];
async function client(){const context=await browser.newContext();await context.route('https://www.googleapis.com/**',async route=>{const request=route.request(),url=new URL(request.url()),method=request.method();let data;
 if(url.pathname.endsWith('/about'))data={user:{permissionId:'synthetic-account',emailAddress:'test@example.invalid'}};
 else if(url.pathname==='/drive/v3/files'&&method==='GET')data={files:[...files].map(([id,f])=>({id,name:f.name}))};
 else if(url.pathname.startsWith('/drive/v3/files/')&&method==='GET')data=files.get(url.pathname.split('/').at(-1)).data;
 else if(url.pathname==='/upload/drive/v3/files'&&method==='POST'){const parts=request.postData().split(/--pkos_[\w-]+(?:--)?/).map(s=>s.split('\r\n\r\n')[1]).filter(Boolean);const meta=JSON.parse(parts[0].trim()),body=JSON.parse(parts[1].trim());const id='file'+(++sequence);files.set(id,{name:meta.name,data:body});data={id};}
 else if(url.pathname.startsWith('/upload/drive/v3/files/')&&method==='PATCH'){files.get(url.pathname.split('/').at(-1)).data=JSON.parse(request.postData());data={};}
 else throw Error('Unexpected mock request '+method+' '+url);await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 await context.addInitScript(()=>{localStorage.setItem('pkos-guide-v1','done'),localStorage.setItem('pkos-folder-guide-v1','done');window.google={accounts:{oauth2:{initTokenClient(options){return {requestAccessToken(){options.callback({access_token:'synthetic-token',expires_in:3600});}};},revoke(){}}}};});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8898/');await page.waitForSelector('[data-action="settings"]');return page;}
// 클라이언트 ID가 없을 때는 왼쪽 아래 동기화 줄이 숨어 있으므로 설정 창에서 연다.
const entryHidden=page=>page.evaluate(()=>document.querySelector('[data-cloud-entry]').hidden);
async function connect(page){await page.locator('[data-action="settings"]').first().click();await page.locator('#dialog [data-action="cloud-sync"]').click();await page.locator('#cloud-client').fill('synthetic.apps.googleusercontent.com');await page.locator('#cloud-connect').click();await page.waitForFunction(()=>document.querySelector('#dialog [data-cloud-status]')?.textContent.startsWith('동기화됨'));}
// 동기화는 navigator.locks(ifAvailable)로 한 번에 하나만 돈다. 다른 창이 동기화 중이면 누른 것이 건너뛰어지므로,
// 「동기화 중」을 실제로 거쳐 「동기화됨」이 될 때까지 확인하고, 건너뛰었으면 다시 누른다(예전에는 이전 「동기화됨」 문구를 보고 넘어가 가끔 실패했다)
async function sync(page){
 await page.evaluate(()=>{window.__syncSeen=false;window.__syncObs?.disconnect();const box=document.querySelector('#dialog');window.__syncObs=new MutationObserver(()=>{if(box.querySelector('[data-cloud-status]')?.textContent.startsWith('동기화 중'))window.__syncSeen=true;});window.__syncObs.observe(box,{childList:true,characterData:true,subtree:true});});
 for(let attempt=0;attempt<8;attempt++){
  await page.locator('#cloud-now').click();
  try{await page.waitForFunction(()=>window.__syncSeen&&document.querySelector('#dialog [data-cloud-status]')?.textContent.startsWith('동기화됨'),null,{timeout:3000});return;}catch{await page.waitForTimeout(300);}
 }
 throw Error('동기화가 시작되지 않았습니다');
}
const read=page=>page.evaluate(async()=>{const {openStore}=await import('/store.js');return(await openStore()).all('notes');});
try{const pc=await client(),phone=await client();await pc.evaluate(async()=>{const {openStore}=await import('/store.js'),{makeNote}=await import('/core.js');await(await openStore()).save(makeNote({id:'sync-test-note',title:'원본',body:'첨부 함께 확인',attachments:['synthetic-image']}),0);await(await openStore()).put('assets',{id:'synthetic-image',name:'hello.txt',type:'text/plain',blob:new Blob(['synthetic only'])});});await pc.waitForFunction(()=>document.querySelector('[data-cloud-entry]'));assert.equal(await entryHidden(pc),true);await connect(pc);assert.equal(await entryHidden(pc),false);await connect(phone);assert.equal((await read(phone))[0].title,'원본');const bytes=await phone.evaluate(async()=>{const {openStore}=await import('/store.js');return(await(await openStore()).get('assets','synthetic-image')).blob.text();});assert.equal(bytes,'synthetic only');
 for(const [page,title]of [[pc,'PC에서 수정'],[phone,'휴대폰에서 수정']])await page.evaluate(async title=>{const {openStore}=await import('/store.js'),db=await openStore(),note=await db.get('notes','sync-test-note');await db.save({...note,title},note.revision);},title);
 await sync(pc);await sync(phone);await sync(pc);const result=await read(pc);assert.equal(result.length,2);assert.ok(result.some(n=>n.title.startsWith('PC에서 수정')));assert.ok(result.some(n=>n.title.startsWith('휴대폰에서 수정')));await sync(phone);assert.equal((await read(phone)).length,2);
 await pc.evaluate(async()=>{const {openStore}=await import('/store.js');await(await openStore()).remove('sync-test-note');});await sync(pc);await sync(phone);assert.equal((await read(phone)).length,1);assert.deepEqual(errors,[]);await writeFile('tests/cloud-result.json',JSON.stringify({mockDrive:true,twoDevices:true,attachment:true,conflictCopies:true,deletion:true,errors},null,2));console.log('PASS simulated Drive protocol: two devices, attachments, offline conflicts, deletion. Real OAuth still requires account setup.');
}finally{await browser.close();}
