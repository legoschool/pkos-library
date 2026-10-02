import {validateBackup} from './core.js';
const KEY='folder-backup-v1',MAX=80*1024*1024,INTERVAL=5*60*1000;
const digest=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');
export async function setupFolderBackup({db,demo,toast,flush}){
 let config=await db.get('meta',KEY),dirty=true,busy=false,timer=null,sequence=0,error='',message='',dialog=null;
 const supported=!!window.showDirectoryPicker&&!!navigator.locks;
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('pkos-folder-backup-'+(demo?'demo':'personal')):null;
 const name=db.db.name;
 function status(){return busy?'폴더에 백업하는 중':error?error:!config?.enabled?'자동 백업 꺼짐':message|| (dirty?'자동 백업 대기':'마지막 백업 '+new Date(config.lastAt).toLocaleString('ko-KR'));}
 function refreshUI(){
  document.querySelectorAll('[data-folder-backup-status]').forEach(el=>{el.textContent=status();el.title=config?.folderName||'';});
  if(!dialog?.isConnected)return;
  dialog.querySelector('[data-folder-info]').textContent=config?.folderName?'연결된 전용 폴더: '+config.folderName:'연결된 폴더 없음';
  dialog.querySelector('[data-folder-last]').textContent=config?.lastAt?'확인된 마지막 백업: '+new Date(config.lastAt).toLocaleString('ko-KR')+' · '+config.lastFile:'아직 확인된 백업 파일이 없습니다.';
  dialog.querySelector('[data-folder-message]').textContent=status();
  dialog.querySelectorAll('[data-backup-command]').forEach(b=>{const action=b.dataset.backupCommand;b.disabled=busy||!supported||(action!=='choose'&&!config?.handle);});
  dialog.querySelector('[data-backup-command=toggle]').textContent=config?.enabled?'자동 백업 끄기':'권한 확인 후 켜기';
 }
 const saveConfig=()=>db.put('meta',{...config,id:KEY});
 const announce=()=>channel?.postMessage({config:true});
 function schedule(){
  clearTimeout(timer);timer=null;
  if(!supported||!config?.enabled||!dirty||busy||error)return;
  const delay=Math.max(30000,INTERVAL-(Date.now()-(Date.parse(config.lastAt)||0)));
  timer=setTimeout(()=>void backup(false),delay);
 }
 async function loadConfig(){config=await db.get('meta',KEY);error='';message='';refreshUI();schedule();}
 function changed(){sequence++;dirty=true;message='';refreshUI();schedule();}
 const changedHere=e=>{if(e.detail?.name!==name)return;changed();channel?.postMessage({changed:true});};
 window.addEventListener('pkos-store-change',changedHere);
 if(channel)channel.onmessage=e=>{if(e.data.config)void loadConfig();else if(e.data.changed)changed();};
 async function permission(request=false){
  if(!config?.handle)return false;
  let value=await config.handle.queryPermission({mode:'readwrite'});
  if(value!=='granted'&&request)value=await config.handle.requestPermission({mode:'readwrite'});
  if(value!=='granted'){error='백업 폴더 권한을 다시 허용해 주세요.';return false;}return true;
 }
 async function backup(manual=false){
  if(busy||!supported)return;
  clearTimeout(timer);timer=null;
  if(manual&&!(await flush())){toast('편집 중인 기록을 먼저 저장해 주세요.');return;}
  busy=true;error='';message='';refreshUI();
  let deferred=false;
  try{
   await navigator.locks.request('pkos-folder-backup-'+name,{ifAvailable:true},async lock=>{
    if(!lock){message='다른 창에서 백업 중입니다.';deferred=true;return;}
    config=await db.get('meta',KEY);
    if(!config?.handle||!manual&&!config.enabled)return;
    if(!await permission(manual))return;
    const version=sequence,data=await db.backup();validateBackup(data);
    const text=JSON.stringify(data);if(new Blob([text]).size>MAX)throw Error('자동 백업은 80MB까지입니다. Markdown 묶음으로 원본을 보관해 주세요.');
    const signature=await digest(JSON.stringify({...data,created:''}));
    if(signature===config.signature){dirty=sequence!==version;message='변경 없음 · 마지막 백업과 같습니다.';return;}
    const filename='PKOS-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,8)+'.pkem';
    try{await config.handle.getFileHandle(filename);throw Error('백업 파일명이 겹쳤습니다. 다시 시도해 주세요.');}catch(e){if(e.name!=='NotFoundError')throw e;}
    let file,stream;
    try{
     file=await config.handle.getFileHandle(filename,{create:true});stream=await file.createWritable();await stream.write(text);await stream.close();stream=null;
     const saved=await file.getFile();if(saved.size!==new Blob([text]).size||await digest(await saved.text())!==await digest(text))throw Error('백업 파일 내용 확인에 실패했습니다.');
    }catch(e){try{await stream?.abort();}catch{}try{if(file)await config.handle.removeEntry(filename);}catch{}throw e;}
    config={...config,lastAt:new Date().toISOString(),lastFile:filename,signature};
    await saveConfig();dirty=sequence!==version;message='';announce();
   });
  }catch(e){error=e.name==='NotAllowedError'?'백업 폴더 권한을 다시 허용해 주세요.':e.message||'백업하지 못했습니다. 다시 시도해 주세요.';if(manual)toast(error);}
  finally{busy=false;refreshUI();if(deferred){timer=setTimeout(()=>void backup(false),30000);}else schedule();}
 }
 async function choose(){
  if(busy||!supported)return;let connected=false;
  try{
   const parent=await window.showDirectoryPicker({mode:'readwrite',id:demo?'pkos-demo-backup':'pkos-personal-backup'});
   busy=true;refreshUI();
   await navigator.locks.request('pkos-folder-backup-'+name,async()=>{
   const folderName=(demo?'PKOS-체험백업-':'PKOS-자동백업-')+new Date().toISOString().slice(0,10)+'-'+crypto.randomUUID().slice(0,8);
   const handle=await parent.getDirectoryHandle(folderName,{create:true});
   const next={id:KEY,handle,folderName,enabled:true,lastAt:null,lastFile:null,signature:null};
   await db.put('meta',next);config=next;connected=true;dirty=true;error='';message='';announce();
   });
  }catch(e){if(e.name!=='AbortError'){error=e.message;toast('폴더를 연결하지 못했습니다. '+e.message);}}
  finally{busy=false;refreshUI();}
  if(connected&&config?.enabled&&!error)await backup(true);
 }
 async function toggle(){
  if(busy||!config?.handle)return;
  busy=true;refreshUI();
  try{await navigator.locks.request('pkos-folder-backup-'+name,async()=>{config=await db.get('meta',KEY);if(config.enabled){config={...config,enabled:false};clearTimeout(timer);timer=null;await saveConfig();error='';message='';announce();}
   else{error='';if(await permission(true)){config={...config,enabled:true};await saveConfig();dirty=true;error='';message='';announce();}}
   });
  }catch(e){error=e.message;}finally{busy=false;refreshUI();schedule();}
 }
 function open(){
  if(dialog?.isConnected){dialog.focus();return;}
  dialog=document.createElement('dialog');dialog.className='folder-backup-dialog';dialog.setAttribute('aria-labelledby','folder-backup-title');
  dialog.innerHTML='<header><h2 id="folder-backup-title">PC 폴더 자동 백업</h2><button type="button" data-folder-close>닫기 ×</button></header><p>선택한 폴더 안에 전용 폴더를 만들고, 저장된 기록과 첨부를 매번 새 백업 파일로 보관합니다. 기존 파일을 덮어쓰거나 지우지 않습니다.</p><p class="hint">앱이 열려 있는 동안 변경을 모아 5분 간격으로 백업합니다. 닫기 전에는 ‘지금 백업’을 누르세요. PC 폴더의 수정 사항을 읽어 오는 양방향 동기화는 아닙니다. 백업 파일은 쌓이므로 가끔 폴더 용량을 확인하세요.</p><p data-folder-info></p><p data-folder-last class="hint"></p><p data-folder-message role="status"></p><div class="folder-backup-buttons"><button type="button" data-backup-command="choose">백업 폴더 선택</button><button type="button" data-backup-command="now">지금 백업</button><button type="button" data-backup-command="toggle">자동 백업 끄기</button></div>'+(!supported?'<p class="error">이 브라우저에서는 폴더 연결을 지원하지 않습니다. 설정 · 백업의 백업 내보내기를 사용하거나 PC의 Edge·Chrome에서 열어 주세요.</p>':'')+'<p class="hint">복원은 설정 · 백업 → 백업 파일 가져오기에서 .pkem 파일을 선택합니다. 폴더 접근 권한은 백업 파일에 담지 않습니다.</p>';
  document.body.append(dialog);dialog.showModal();refreshUI();
  const close=()=>{dialog.close();dialog.remove();dialog=null;document.removeEventListener('keydown',guard,true);};
  const guard=e=>{if((e.ctrlKey||e.metaKey)&&['s','k'].includes(e.key.toLowerCase())){e.preventDefault();e.stopImmediatePropagation();}};
  document.addEventListener('keydown',guard,true);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('click',e=>{if(e.target.closest('[data-folder-close]'))close();const action=e.target.closest('[data-backup-command]')?.dataset.backupCommand;if(action==='choose')void choose();if(action==='now')void backup(true);if(action==='toggle')void toggle();});
 }
 if(config?.enabled){try{await permission();}catch{error='백업 폴더를 다시 연결해 주세요.';}schedule();}
 return {open,refreshUI};
}
