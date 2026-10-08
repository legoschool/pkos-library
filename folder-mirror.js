import {syncFolderMirror} from './folder-mirror-files.js';

const KEY='folder-mirror-v1';

// Browser saves stay independent of file permissions. Only committed snapshots
// are mirrored, and all tabs serialize access to the remembered connection.
export async function setupFolderMirror({db,demo,toast,flush}){
 const supported=typeof window.showDirectoryPicker==='function'&&!!navigator.locks;
 const lockName='pkos-folder-mirror-'+db.db.name;
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel(lockName):null;
 let config=await db.get('meta',KEY),pending=!!config?.enabled,sequence=0,running=null,connecting=false,timer=null,dialog=null,error='',notice='',lastToast='';

 function status(){
  if(error)return '폴더 저장 실패 · 다시 시도';
  if(connecting||running)return '로컬 폴더 저장 중';
  if(!config?.handle)return '로컬 폴더 연결';
  if(!config.enabled)return '폴더 자동 저장 꺼짐';
  if(pending)return '로컬 폴더 저장 대기';
  return config.lastAt?'로컬 폴더 저장됨':'로컬 폴더 저장 대기';
 }
 function refreshUI(){
  const message=status(),detail=error||notice||(config?.folderName?config.parentName+' / '+config.folderName:'글과 첨부를 자동 저장할 로컬 폴더를 선택하세요.');
  document.querySelectorAll('[data-mirror-status]').forEach(el=>{el.textContent=message;el.title=detail;el.classList.toggle('error',!!error);});
  document.querySelectorAll('[data-mirror-indicator]').forEach(el=>{el.hidden=!config?.handle;el.classList.toggle('error',!!error);});
  if(!dialog?.isConnected)return;
  dialog.querySelector('[data-mirror-folder]').textContent=config?.handle?'저장 위치: '+config.parentName+' / '+config.folderName:'연결된 로컬 폴더가 없습니다.';
  dialog.querySelector('[data-mirror-message]').textContent=error||notice||message;
  dialog.querySelector('[data-mirror-message]').classList.toggle('error',!!error);
  dialog.querySelector('[data-mirror-last]').textContent=config?.lastAt?'마지막 파일 저장: '+new Date(config.lastAt).toLocaleString('ko-KR')+' · '+config.lastCount+'개 기록':'아직 파일 저장을 확인하지 않았습니다.';
  dialog.querySelectorAll('[data-mirror-command]').forEach(button=>{button.disabled=!!running||connecting||!supported||(button.dataset.mirrorCommand!=='choose'&&!config?.handle);});
  dialog.querySelector('[data-mirror-command=toggle]').textContent=config?.enabled?'자동 저장 끄기':'자동 저장 켜기';
 }
 function fail(e){
  error=['NotAllowedError','SecurityError'].includes(e?.name)?'로컬 폴더 쓰기 권한이 필요합니다. 「지금 저장 · 다시 시도」를 눌러 허용해 주세요.':e?.message||'로컬 폴더에 저장하지 못했습니다. 연결과 여유 공간을 확인한 뒤 다시 시도해 주세요.';
  pending=true;refreshUI();
  if(lastToast!==error){lastToast=error;toast('브라우저의 기록은 저장되어 있습니다. '+error);}
 }
 async function permit(request=false){
  if(!config?.handle)return false;
  let value=await config.handle.queryPermission({mode:'readwrite'});
  if(value!=='granted'&&request)value=await config.handle.requestPermission({mode:'readwrite'});
  if(value!=='granted')throw new DOMException('로컬 폴더 권한이 필요합니다.','NotAllowedError');
  return true;
 }
 function schedule(){
  clearTimeout(timer);timer=null;
  if(!supported||!config?.enabled||!pending||running||connecting||error)return;
  timer=setTimeout(()=>void sync(),150);
 }
 function changed(){sequence++;pending=true;notice='';refreshUI();schedule();}
 window.addEventListener('pkos-store-change',event=>{
  if(event.detail?.name!==db.db.name)return;
  changed();channel?.postMessage({type:'changed'});
 });
 async function reload(){
  config=await db.get('meta',KEY);
  if(!running&&!connecting){error='';notice='';pending=!!config?.enabled;}
  refreshUI();schedule();
 }
 if(channel)channel.onmessage=event=>{
  if(event.data?.type==='changed')changed();
  else if(event.data?.type==='config')void reload().catch(fail);
  else if(event.data?.type==='saved'&&!running&&!connecting)void db.get('meta',KEY).then(next=>{config=next;refreshUI();}).catch(fail);
 };

 async function sync(manual=false){
  clearTimeout(timer);timer=null;
  if(running)return running;
  if(connecting||!supported||!config?.handle||!config.enabled&&!manual)return true;
  running=(async()=>{
   try{
    let again=true;
    while(again){
     again=false;
     await navigator.locks.request(lockName,async()=>{
      config=await db.get('meta',KEY);
      if(!config?.handle||!config.enabled&&!manual){pending=false;return;}
      await permit(false);
      const version=sequence;
      const [notes,assets]=await db.snapshot();
      let result;
      try{result=await syncFolderMirror({handle:config.handle,notes,assets,manifest:config.manifest});}
      catch(e){
       if(e.partialResult){config={...config,manifest:e.partialResult.manifest};await db.put('meta',config);}
       throw e;
      }
      config={...config,manifest:result.manifest,lastAt:new Date().toISOString(),lastCount:notes.filter(n=>!n.deleted).length};
      await db.put('meta',config);
      error='';lastToast='';pending=sequence!==version;again=pending;
      notice=result.conflicts?'폴더에서 직접 바뀐 파일은 보존했습니다. 저장 위치를 확인해 주세요.':result.removed?'글과 첨부를 저장하고 삭제한 변환 페이지 '+result.removed+'개를 폴더에서도 지웠습니다.':result.written?'글과 첨부파일을 로컬 폴더에 저장했습니다.':'로컬 폴더가 최신 상태입니다.';
      channel?.postMessage({type:'saved'});
     });
    }
    return true;
   }catch(e){fail(e);return false;}
  })();
  refreshUI();
  try{return await running;}finally{running=null;refreshUI();schedule();}
 }

 async function choose(){
  if(!supported||running||connecting)return false;
  let selected=false;
  connecting=true;refreshUI();
  try{
   const parent=await window.showDirectoryPicker({mode:'readwrite',id:demo?'pkos-demo-mirror':'pkos-local-mirror'});
   if(!await flush())return false;
   await navigator.locks.request(lockName,async()=>{
    const connection=crypto.randomUUID(),folderName=(demo?'PKOS-체험기록-':'PKOS-기록-')+new Date().toISOString().slice(0,10)+'-'+connection.slice(0,8);
    const handle=await parent.getDirectoryHandle(folderName,{create:true});
    const next={id:KEY,connection,handle,folderName,parentName:parent.name,enabled:true,manifest:null,lastAt:null,lastCount:0};
    await db.put('meta',next);config=next;pending=true;error='';notice='';lastToast='';selected=true;
    channel?.postMessage({type:'config'});
   });
  }catch(e){if(e.name!=='AbortError')fail(e);}
  finally{connecting=false;refreshUI();schedule();}
  return selected?await sync():false;
 }
 async function now(){
  if(!supported||running||connecting||!config?.handle)return;
  try{
   // Ask for renewed access while still handling the user's button click.
   await permit(true);
   if(!await flush())return;
   error='';pending=true;await sync(true);
  }catch(e){fail(e);}
 }
 async function toggle(){
  if(!supported||running||connecting||!config?.handle)return;
  try{
   const enable=!config.enabled;
   if(enable)await permit(true);
   connecting=true;refreshUI();
   await navigator.locks.request(lockName,async()=>{
    config=await db.get('meta',KEY);config={...config,enabled:enable};await db.put('meta',config);
    error='';notice='';pending=enable;clearTimeout(timer);timer=null;channel?.postMessage({type:'config'});
   });
  }catch(e){fail(e);}
  finally{connecting=false;refreshUI();schedule();}
 }
 function open(){
  if(dialog?.isConnected){dialog.focus();return;}
  dialog=document.createElement('dialog');dialog.className='folder-mirror-dialog';dialog.setAttribute('aria-labelledby','folder-mirror-title');
  dialog.innerHTML='<header><h2 id="folder-mirror-title">로컬 폴더 자동 저장</h2><button type="button" data-mirror-close>닫기 ×</button></header><div class="dialog-body"><p>폴더를 한 번 선택하면 지금 있는 기록과 앞으로 저장하는 글·녹음·첨부파일을 전용 폴더에 함께 저장합니다. 글은 제목이 있는 Markdown(.md) 파일로 열고 찾을 수 있습니다.</p><p class="hint">구글 드라이브 데스크톱이 동기화하는 로컬 폴더도 선택할 수 있습니다. 온라인 동기화는 구글 드라이브 앱에서 처리합니다.</p><p data-mirror-folder></p><p data-mirror-message role="status" aria-live="polite"></p><p data-mirror-last class="hint"></p><div class="mirror-buttons"><button type="button" class="primary small" data-mirror-command="choose">저장할 로컬 폴더 선택</button><button type="button" class="quiet" data-mirror-command="now">지금 저장 · 다시 시도</button><button type="button" class="quiet" data-mirror-command="toggle">자동 저장 끄기</button></div><p class="hint">폴더에서 직접 고친 파일과 이름을 바꾸기 전 파일은 보존합니다. 폴더의 수정은 PKOS로 자동 가져오지 않습니다. 일반 기록·첨부를 앱에서 지워도 저장한 파일은 남습니다. 단, 변환한 페이지를 직접 삭제하면 다른 기록에서 쓰지 않는 해당 PNG도 폴더에서 지웁니다. 외부에서 고친 PNG와 원본 문서는 보존합니다.</p>'+(!supported?'<p class="error">이 브라우저에서는 폴더 연결을 지원하지 않습니다. PC의 Edge·Chrome에서 열거나 설정 · 백업의 Markdown 묶음 내보내기를 사용하세요.</p>':'')+'</div>';
  document.body.append(dialog);dialog.showModal();refreshUI();
  const guard=event=>{if((event.ctrlKey||event.metaKey)&&['s','k'].includes(event.key.toLowerCase())){event.preventDefault();event.stopImmediatePropagation();}};
  const close=()=>{dialog.close();dialog.remove();dialog=null;document.removeEventListener('keydown',guard,true);};
  document.addEventListener('keydown',guard,true);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{
   if(event.target.closest('[data-mirror-close]')){close();return;}
   const command=event.target.closest('[data-mirror-command]')?.dataset.mirrorCommand;
   if(command==='choose')void choose();if(command==='now')void now();if(command==='toggle')void toggle();
  });
 }
 window.addEventListener('beforeunload',event=>{
  if(running||connecting||(config?.enabled&&pending)){event.preventDefault();event.returnValue='';}
 });
 schedule();
 const connection=()=>({supported,connected:!!config?.handle,enabled:!!config?.enabled,busy:!!running||connecting,status:status(),folderName:config?.folderName||'',parentName:config?.parentName||'',error});
 return {open,refreshUI,sync,connect:choose,connection};
}
