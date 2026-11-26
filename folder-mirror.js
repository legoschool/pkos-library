import {syncFolderMirror} from './folder-mirror-files.js';
import {pickerOptions,getDriveHandle} from './drive-map.js';
import {placeKey,parsePlaceKey,INBOX_NAME} from './drive-placement.js';
import {esc} from './core.js';

const KEY='folder-mirror-v1';

// Browser saves stay independent of file permissions. Only committed snapshots
// are mirrored, and all tabs serialize access to the remembered connection.
export async function setupFolderMirror({db,demo,toast,flush,driveMap=null}){
 const supported=typeof window.showDirectoryPicker==='function'&&!!navigator.locks;
 const lockName='pkos-folder-mirror-'+db.db.name;
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel(lockName):null;
 let lastSaved='',config=await db.get('meta',KEY),pending=!!config?.enabled,sequence=0,running=null,connecting=false,timer=null,dialog=null,error='',notice='',lastToast='';

 const isDrive=()=>config?.mode==='drive';
 function status(){
  const drive=isDrive();
  if(error)return drive?'G 드라이브 저장 실패 · 다시 시도':'폴더 저장 실패 · 다시 시도';
  if(connecting||running)return drive?'G 드라이브 저장 중':'로컬 폴더 저장 중';
  if(!config?.handle)return 'G 드라이브에 저장';
  if(drive){
   if(!config.enabled)return 'G 드라이브 자동 저장 꺼짐';
   return pending||!config.lastAt?'G 드라이브 저장 대기':'G 드라이브에 저장됨';
  }
  if(!config.enabled)return '폴더 자동 저장 꺼짐';
  if(pending)return '로컬 폴더 저장 대기';
  return config.lastAt?'로컬 폴더 저장됨':'로컬 폴더 저장 대기';
 }
 // 기록마다 드라이브 어느 폴더에 둘지: 손으로 고른 자리 > 지난번 자리(더 잘 맞는 곳이 뚜렷하면 옮김) > 지식맵이 찾은 자리 > 00_PKOS
 function placeFunction(){
  const placer=driveMap?.placer?.(),overrides=config?.placements||{},placed=config?.placed||{};
  const fallback=placer?{dir:placer.inbox.dir,create:placer.inbox.create}:{dir:[INBOX_NAME],create:0};
  const fn=note=>{
   const chosen=parsePlaceKey(overrides[note.id]);if(chosen)return chosen;
   const prev=placed[note.id]&&Array.isArray(placed[note.id].dir)?placed[note.id]:null;
   if(!placer)return prev||fallback;
   const found=placer.place(note);
   if(!prev)return found;
   const prevInbox=prev.dir.length===1&&prev.dir[0]===fallback.dir[0];
   if(prevInbox)return found.inbox?prev:found;
   if(found.inbox)return prev;
   const prevKey=prev.dir.join('/'),same=found.candidates.find(c=>c.dir.join('/')===prevKey);
   return found.dir.join('/')===prevKey||(same&&found.score<same.score*1.5)?prev:found;
  };
  fn.fallback=fallback;return fn;
 }
 const describe=place=>place?place.dir.join(' › '):'';
 function refreshUI(){
  const message=status(),detail=error||notice||(isDrive()?'기록마다 내용이 맞는 G 드라이브 폴더에 저장합니다.':config?.folderName?config.parentName+' / '+config.folderName:'기록을 G 드라이브 구성대로 저장하려면 누르세요.');
  document.querySelectorAll('[data-mirror-status]').forEach(el=>{el.textContent=message;el.title=detail;el.classList.toggle('error',!!error);});
  document.querySelectorAll('[data-mirror-indicator]').forEach(el=>{el.hidden=!config?.handle;el.classList.toggle('error',!!error);});
  if(!dialog?.isConnected)return;
  dialog.querySelector('[data-mirror-folder]').textContent=isDrive()?'지금: G 드라이브 구성대로 저장 ('+config.parentName+')':config?.handle?'지금: 폴더 하나에 저장 ('+[config.parentName,config.folderName].filter(Boolean).join(' / ')+')':'아직 저장할 곳을 연결하지 않았습니다.';
  dialog.querySelector('[data-mirror-message]').textContent=error||notice||message;
  dialog.querySelector('[data-mirror-message]').classList.toggle('error',!!error);
  dialog.querySelector('[data-mirror-last]').textContent=config?.lastAt?'마지막 파일 저장: '+new Date(config.lastAt).toLocaleString('ko-KR')+' · '+config.lastCount+'개 기록':'아직 파일 저장을 확인하지 않았습니다.';
  dialog.querySelectorAll('[data-mirror-command]').forEach(button=>{const c=button.dataset.mirrorCommand;button.disabled=!!running||connecting||!supported||(c==='drive'&&demo)||(!['choose','drive'].includes(c)&&!config?.handle);});
  const driveBtn=dialog.querySelector('[data-mirror-command=drive]');if(driveBtn)driveBtn.textContent=isDrive()?'G 드라이브 연결 다시 하기':'G 드라이브 구성대로 저장 켜기';
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
  if(!manual&&!pending)return true;
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
      const version=sequence,prevPlaced=config.placed||null;
      const [notes,assets]=await db.snapshot();
      let result;
      try{result=await syncFolderMirror({handle:config.handle,notes,assets,manifest:config.manifest,...(isDrive()?{placeFor:placeFunction()}:{})});}
      catch(e){
       if(e.partialResult){config={...config,manifest:e.partialResult.manifest};await db.put('meta',config);}
       throw e;
      }
      config={...config,manifest:result.manifest,lastAt:new Date().toISOString(),lastCount:notes.filter(n=>!n.deleted).length,...(isDrive()?{placed:{...(config.placed||{}),...result.placed}}:{})};
      await db.put('meta',config);
      error='';lastToast='';pending=sequence!==version;again=pending;
      lastSaved='';
      if(isDrive()){
       if(result.paths.length||result.gone.length)driveMap?.addWritten?.(result.paths,result.gone);
       // 처음 저장했거나 자리를 옮긴 기록만 알려 준다(고칠 때마다 알리지 않는다).
       const before=prevPlaced||{},fresh=Object.entries(result.placed).filter(([id,p])=>(before[id]?.dir||[]).join('/')!==p.dir.join('/'));
       if(fresh.length===1){const [id,p]=fresh[0],title=result.manifest.notes[id]?.title||'기록';lastSaved='「'+title+'」 기록을 G 드라이브 '+p.dir.join(' › ')+'에 저장했습니다.';if(prevPlaced)toast(lastSaved);}
       else if(fresh.length>1)lastSaved='기록 '+fresh.length+'개를 G 드라이브 구성대로 저장했습니다.';
      }
      notice=isDrive()&&lastSaved?lastSaved:result.conflicts?'폴더에서 직접 바뀐 파일은 보존했습니다. 저장 위치를 확인해 주세요.':result.removed?'글과 첨부를 저장하고 삭제한 변환 페이지 '+result.removed+'개를 폴더에서도 지웠습니다.':result.written?'글과 첨부파일을 로컬 폴더에 저장했습니다.':'로컬 폴더가 최신 상태입니다.';
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
   const parent=await window.showDirectoryPicker(pickerOptions({mode:'readwrite'},demo?'pkos-demo-mirror':'pkos-local-mirror'));
   if(!await flush())return false;
   await navigator.locks.request(lockName,async()=>{
    // 고른 폴더에 그대로 저장한다(예전처럼 「PKOS-기록-날짜」 폴더를 새로 만들지 않는다).
    const connection=crypto.randomUUID();
    const next={id:KEY,connection,handle:parent,folderName:'',parentName:parent.name,enabled:true,manifest:null,lastAt:null,lastCount:0};
    await db.put('meta',next);config=next;pending=true;error='';notice='';lastToast='';selected=true;
    channel?.postMessage({type:'config'});
   });
  }catch(e){if(e.name!=='AbortError')fail(e);}
  finally{connecting=false;refreshUI();schedule();}
  return selected?await sync():false;
 }
 // G 드라이브 구성대로 저장: 지식맵에 연결한 「내 드라이브」에 쓰기 허용을 받고, 기록마다 맞는 폴더에 둔다.
 async function connectDrive(){
  if(!supported||running||connecting)return false;
  if(demo){toast('체험 서재에서는 어느 폴더에 저장될지만 보여 줍니다. 내 서재에서 G 드라이브를 연결하면 실제로 저장됩니다.');return false;}
  const root=getDriveHandle();
  if(!root){toast('먼저 「G 드라이브 지식맵」에서 「G 드라이브 연결하기」로 내 드라이브를 연결해 주세요.');return false;}
  let selected=false;connecting=true;refreshUI();
  try{
   let p=await root.queryPermission({mode:'readwrite'});
   if(p!=='granted')p=await root.requestPermission({mode:'readwrite'});
   if(p!=='granted')throw new DOMException('G 드라이브 쓰기 권한이 필요합니다.','NotAllowedError');
   if(!await flush())return false;
   await navigator.locks.request(lockName,async()=>{
    const old=await db.get('meta',KEY),keep=old?.mode==='drive'&&old.parentName===root.name;
    const next={id:KEY,mode:'drive',connection:crypto.randomUUID(),handle:root,folderName:'',parentName:root.name,enabled:true,manifest:keep?old.manifest:null,placed:keep?old.placed||{}:{},placements:keep?old.placements||{}:{},lastAt:keep?old.lastAt:null,lastCount:keep?old.lastCount:0};
    await db.put('meta',next);config=next;pending=true;error='';notice='';lastToast='';selected=true;
    channel?.postMessage({type:'config'});
   });
  }catch(e){if(e.name!=='AbortError')fail(e);}
  finally{connecting=false;refreshUI();schedule();}
  if(!selected)return false;const ok=await sync();if(ok)void paintPlaces();return ok;
 }
 // 저장 자리 미리 보기: 최근 기록마다 어느 폴더에 들어가는지, 왜 그런지, 다른 후보로 바꾸기
 async function paintPlaces(){
  const box=dialog?.querySelector('[data-mirror-places]');if(!box)return;
  await driveMap?.ready?.();
  const placer=driveMap?.placer?.();
  if(!placer){box.innerHTML='<p class="hint">G 드라이브 지식맵을 만들면 기록마다 어느 폴더에 들어갈지 여기에 보입니다.</p>';return;}
  const [notes]=await db.snapshot(),list=notes.filter(n=>!n.deleted).sort((a,b)=>String(b.updated).localeCompare(String(a.updated))),shown=list.slice(0,60);
  const fn=placeFunction(),overrides=config?.placements||{};
  const rows=shown.map(n=>{
   // 같은 폴더는 한 줄만(새로 만든 00_PKOS처럼 「만들어도 됨」 표시만 다른 자리는 겹치지 않게)
   const place=fn(n),found=placer.place(n),key=placeKey(place),opts=new Map(),addOpt=(p,label)=>{const d=p.dir.join('/');if(!opts.has(d))opts.set(d,[placeKey(p),label]);};
   addOpt(place,describe(place)+(place.dir.join('/')===placer.inbox.dir.join('/')?' (맞는 곳이 없을 때)':''));
   for(const c of found.candidates)addOpt(c,describe(c));
   addOpt(placer.inbox,describe(placer.inbox)+' (맞는 곳이 없을 때)');
   const why=overrides[n.id]?'직접 고른 자리':place.dir.join('/')===found.dir.join('/')?found.reason:'지난번 자리를 그대로 씁니다';
   return '<li class="place-row"><div class="place-title">'+esc(n.title||'제목 없음')+'</div><label class="place-pick"><span class="sr-only">저장할 폴더</span><select data-place-note="'+esc(n.id)+'">'+[...opts.values()].map(([v,l])=>'<option value="'+esc(v)+'"'+(v===key?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select></label><small class="hint">'+esc(why)+'</small></li>';
  });
  box.innerHTML='<h3>기록마다 저장되는 자리</h3><p class="hint">최근 기록 '+shown.length+'개'+(list.length>shown.length?' (모두 '+list.length+'개)':'')+'입니다. 자리를 바꾸면 다음 저장부터 그 폴더에 들어가고, 앱이 쓴 예전 파일은 옮겨집니다.</p><ul class="place-list">'+rows.join('')+'</ul>';
 }
 async function choosePlace(id,value){
  if(!parsePlaceKey(value))return;
  if(demo){toast('체험 서재에서는 자리를 바꿔 보기만 합니다.');return;}
  await navigator.locks.request(lockName,async()=>{config=await db.get('meta',KEY);if(!config)return;config={...config,placements:{...(config.placements||{}),[id]:value}};await db.put('meta',config);});
  channel?.postMessage({type:'config'});
  if(isDrive()){pending=true;await sync(true);}
  toast('다음부터 이 기록은 고른 폴더에 저장합니다.');void paintPlaces();
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
  dialog.innerHTML='<header><h2 id="folder-mirror-title">G 드라이브에 기록 저장</h2><button type="button" data-mirror-close>닫기 ×</button></header><div class="dialog-body"><p>기록을 쓰면 G 드라이브 지식맵이 내용과 맞는 폴더를 찾아 그 폴더 안에 Markdown(.md) 파일로 저장합니다. 드론 수업 기록은 드론 수업 폴더에, 연수 준비 기록은 그 연수 폴더에 들어갑니다. 맞는 폴더가 없으면 드라이브 맨 위 <b>'+INBOX_NAME+'</b> 폴더에 넣습니다(없으면 만듭니다). 사진·첨부는 그 폴더 안 「PKOS 첨부」에 둡니다.</p><p class="hint">먼저 「G 드라이브 지식맵」에서 내 드라이브를 연결해야 합니다. 저장한 파일은 구글 드라이브 앱이 온라인으로 올리고, 지식맵에도 바로 나타납니다.</p><p data-mirror-folder></p><p data-mirror-message role="status" aria-live="polite"></p><p data-mirror-last class="hint"></p><div class="mirror-buttons"><button type="button" class="primary small" data-mirror-command="drive">G 드라이브 구성대로 저장 켜기</button><button type="button" class="quiet" data-mirror-command="now">지금 저장 · 다시 시도</button><button type="button" class="quiet" data-mirror-command="toggle">자동 저장 끄기</button></div><div class="mirror-places" data-mirror-places></div><details class="mirror-legacy"'+(getDriveHandle()&&!demo?'':' open')+'><summary>G 드라이브가 없을 때: 폴더 하나에 모아 저장</summary><p class="hint">고른 폴더 안에 기록을 모두 모아 저장합니다. 새 폴더를 따로 만들지 않습니다.</p><button type="button" class="quiet small" data-mirror-command="choose">저장할 폴더 고르기</button></details><p class="hint">폴더에서 직접 고친 파일과 다른 사람이 만든 같은 이름 파일은 건드리지 않습니다. 폴더의 수정은 PKOS로 자동 가져오지 않습니다. 앱에서 기록을 지워도 저장한 파일은 남습니다.</p>'+(!supported?'<p class="error">이 브라우저에서는 폴더 연결을 지원하지 않습니다. PC의 Edge·Chrome에서 열거나 설정 · 백업의 Markdown 묶음 내보내기를 사용하세요.</p>':'')+'</div>';
  document.body.append(dialog);dialog.showModal();refreshUI();void paintPlaces();
  dialog.addEventListener('change',event=>{const select=event.target.closest('[data-place-note]');if(select)void choosePlace(select.dataset.placeNote,select.value);});
  const guard=event=>{if((event.ctrlKey||event.metaKey)&&['s','k'].includes(event.key.toLowerCase())){event.preventDefault();event.stopImmediatePropagation();}};
  const close=()=>{dialog.close();dialog.remove();dialog=null;document.removeEventListener('keydown',guard,true);};
  document.addEventListener('keydown',guard,true);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{
   if(event.target.closest('[data-mirror-close]')){close();return;}
   const command=event.target.closest('[data-mirror-command]')?.dataset.mirrorCommand;
   if(command==='drive')void connectDrive();if(command==='choose')void choose();if(command==='now')void now();if(command==='toggle')void toggle();
  });
 }
 window.addEventListener('beforeunload',event=>{
  if(running||connecting||(config?.enabled&&pending)){event.preventDefault();event.returnValue='';}
 });
 schedule();
 const connection=()=>({supported,connected:!!config?.handle,enabled:!!config?.enabled,busy:!!running||connecting,status:status(),folderName:config?.folderName||'',parentName:config?.parentName||'',mode:config?.mode||'folder',error});
 // 처음 안내의 「연결」: G 드라이브를 이미 연결했으면 드라이브 구성대로, 아니면 폴더 하나를 고른다.
 const connect=()=>getDriveHandle()&&!demo?connectDrive():choose();
 return {open,refreshUI,sync,connect,connectDrive,connection};
}
