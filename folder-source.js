import {makeNote,parseMarkdown,uid,esc} from './core.js';
const KEY='folder-source-v1',MAX=20*1024*1024,BUDGET=100*1024*1024;
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
export async function setupFolderSource({db,demo,toast,flush,changed}){
 let config=await db.get('meta',KEY),rows=[],busy=false,message='',dialog=null,timer=null,lastNotice='';
 const supported=typeof window.showDirectoryPicker==='function'&&!!navigator.locks,lockName='pkos-folder-source-'+db.db.name;
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel(lockName):null;
 function schedule(){clearTimeout(timer);if(config?.enabled&&supported)timer=setTimeout(()=>{if(document.visibilityState==='visible')void scan(false);else schedule();},300000);}
 function paint(){
  if(!dialog?.isConnected)return;
  dialog.querySelector('[data-source-name]').textContent=config?'연결 폴더: '+config.name:'연결된 폴더 없음';
  dialog.querySelector('[data-source-message]').textContent=message||'폴더를 고르면 새 파일과 변경된 파일을 살펴봅니다.';
  dialog.querySelectorAll('[data-source-command]').forEach(b=>{const a=b.dataset.sourceCommand;b.disabled=busy||!supported||(a!=='choose'&&!config);});
  dialog.querySelector('[data-source-command=toggle]').textContent=config?.enabled?'자동 확인 끄기':'5분마다 자동 확인 켜기';
  dialog.querySelector('[data-source-command=import]').disabled=busy||!rows.some(r=>r.selected);
  dialog.querySelector('[data-source-rows]').innerHTML=rows.map((r,i)=>'<label class="source-file"><input type="checkbox" data-source-index="'+i+'" '+(r.selected?'checked ':'')+(busy||r.state==='보관됨'||r.error?'disabled':'')+'><span><strong>'+esc(r.path)+'</strong><small>'+esc(r.error||r.state)+' · '+(r.size/1024).toFixed(1)+' KB</small></span></label>').join('');
 }
 async function permission(manual){
  if(!config?.handle)return false;let p=await config.handle.queryPermission({mode:'read'});
  if(p!=='granted'&&manual)p=await config.handle.requestPermission({mode:'read'});
  if(p!=='granted')throw Error('폴더 읽기 권한이 필요합니다. 지금 확인을 눌러 다시 허용해 주세요.');return true;
 }
 async function inspect(){
  const notes=await db.all('notes'),prior=notes.filter(n=>!n.deleted&&n.folderSource?.connection===config.connection),next=[],selected=new Map(rows.filter(r=>r.selected).map(r=>[r.path,r.sha]));
  let count=0,total=0,limited=false;
  async function walk(dir,prefix='',depth=0){
   for await(const [name,handle] of dir.entries()){
    if(++count>500){limited=true;break;}
    if(name.startsWith('.')||['node_modules','__pycache__'].includes(name)||/^PKOS-(자동백업|체험백업)-/.test(name))continue;
    const path=prefix+name;
    if(handle.kind==='directory'){if(depth<3)await walk(handle,path+'/',depth+1);else limited=true;if(count>500)break;continue;}
    if(/\.(pkem|tmp|part)$/i.test(name))continue;
    try{
     const file=await handle.getFile(),item={path,handle,name,connection:config.connection,size:file.size,selected:false};
     if(file.size>MAX){next.push({...item,error:'20MB 초과 · 파일 가져오기로 따로 보관하세요.'});continue;}
     if(total+file.size>BUDGET){limited=true;next.push({...item,error:'이번 확인의 읽기 한도 초과'});continue;}
     const bytes=await file.arrayBuffer();total+=bytes.byteLength;const sha=await hash(bytes);
     const versions=prior.filter(n=>n.folderSource.path===path),same=versions.find(n=>n.folderSource.sha===sha);
     next.push({...item,sha,state:same?'보관됨':versions.length?'변경됨 · 새 사본으로 보관':'새 파일',selected:!same&&selected.get(path)===sha});
    }catch(e){next.push({path,size:0,error:'읽지 못함: '+e.message,selected:false});}
   }
  }
  await walk(config.handle);rows=next.sort((a,b)=>a.path.localeCompare(b.path,'ko'));
  const ready=rows.filter(r=>!r.error&&r.state!=='보관됨').length;
  message=ready+'개 새 파일·변경 파일 · '+rows.filter(r=>r.state==='보관됨').length+'개 이미 보관됨'+(limited?' · 일부만 확인: 하위 3단계·500항목·100MB 한도, 더 작은 폴더를 선택하세요.':'');
  const notice=rows.filter(r=>!r.error&&r.state!=='보관됨').map(r=>r.path+':'+r.sha).join('|');if(ready&&!dialog&&notice!==lastNotice)toast('연결 폴더에 새 파일·변경 파일 '+ready+'개가 있습니다. 설정에서 확인하세요.');lastNotice=notice;
 }
 async function scan(manual=true){
  if(busy||!supported||!config)return;
  busy=true;message='파일 내용을 확인하는 중';paint();
  try{await navigator.locks.request(lockName,{ifAvailable:true},async lock=>{if(!lock){message='다른 창에서 폴더를 확인 중입니다.';return;}const latest=await db.get('meta',KEY);if(latest?.connection!==config?.connection)rows=[];config=latest;if(!config||!manual&&!config.enabled)return;if(await permission(manual))await inspect();});}
  catch(e){message=e.message;}finally{busy=false;paint();schedule();}
 }
 async function choose(){
  if(busy||!supported)return;let picked=false;
  try{
   const handle=await window.showDirectoryPicker({mode:'read',id:demo?'pkos-demo-source':'pkos-source'});
   busy=true;paint();await navigator.locks.request(lockName,async()=>{
    const old=await db.get('meta',KEY),same=old?.handle&&await handle.isSameEntry(old.handle);
    config=same?{...old,handle}:{id:KEY,handle,name:handle.name,connection:uid(),enabled:false};
    await db.put('meta',config);rows=[];picked=true;channel?.postMessage('config');
   });
  }catch(e){if(e.name!=='AbortError')message=e.message;}finally{busy=false;paint();}
  if(picked)await scan(true);
 }
 async function toggle(){
  if(busy||!config)return;busy=true;paint();
  try{await navigator.locks.request(lockName,async()=>{config=await db.get('meta',KEY);if(!config)return;if(!config.enabled&&!await permission(true))return;config={...config,enabled:!config.enabled};await db.put('meta',config);message=config.enabled?'앱이 열린 동안 5분마다 확인합니다. 가져올 파일은 직접 선택하세요.':'자동 확인을 껐습니다. 가져온 기록은 그대로 남습니다.';channel?.postMessage('config');});}
  catch(e){message=e.message;}finally{busy=false;paint();schedule();}
 }
 async function importSelected(){
  if(busy)return;const chosen=rows.filter(r=>r.selected&&!r.error&&r.state!=='보관됨');if(!chosen.length)return;
  if(chosen.reduce((n,r)=>n+r.size,0)>50*1024*1024){message='한 번에 50MB까지 가져올 수 있습니다. 선택을 줄여 주세요.';paint();return;}
  if(!await flush()){toast('편집 중인 기록을 먼저 저장해 주세요.');return;}
  busy=true;message='선택한 파일을 다시 확인하고 보관하는 중';paint();
  try{
   await navigator.locks.request(lockName,async()=>{
    const latest=await db.get('meta',KEY);if(latest?.connection!==config?.connection)throw Error('연결 폴더가 다른 창에서 바뀌었습니다. 다시 확인해 주세요.');config=latest;await permission(true);
    const existing=await db.all('notes'),notes=[],assets=[];let bytesTotal=0;
    for(const row of chosen){
     if(row.connection!==config.connection)throw Error('폴더 연결이 바뀌었습니다. 지금 확인을 다시 눌러 주세요.');
     const file=await row.handle.getFile();if(file.size>MAX)throw Error(row.path+': 20MB를 넘었습니다.');
     const bytes=await file.arrayBuffer(),sha=await hash(bytes);bytesTotal+=bytes.byteLength;
     if(sha!==row.sha||bytesTotal>50*1024*1024)throw Error('확인 후 파일이 바뀌었거나 크기 한도를 넘었습니다. 지금 확인을 다시 눌러 주세요.');
     const prior=existing.filter(n=>!n.deleted&&n.folderSource?.connection===config.connection&&n.folderSource.path===row.path);
     if(prior.some(n=>n.folderSource.sha===sha))continue;
     const previous=prior.sort((a,b)=>b.created.localeCompare(a.created))[0];
     const types={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',pdf:'application/pdf',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',m4a:'audio/mp4',mp4:'video/mp4',webm:'video/webm'},type=file.type||types[file.name.split('.').pop().toLowerCase()]||'application/octet-stream';
     const asset={id:uid(),name:file.name,type,blob:new Blob([bytes],{type})};
     const parsed=/\.(md|txt)$/i.test(file.name)?parseMarkdown(new TextDecoder().decode(bytes),file.name):{title:file.name,body:'폴더에서 가져온 원본 파일입니다. 지원하는 문서는 첨부의 본문·이미지 추출 버튼을 사용하세요.'};
     if((parsed.body||'').length>2000000)throw Error(row.path+': 본문은 200만 글자까지 가져올 수 있습니다.');
     const note=makeNote({...parsed,folder:'수집함',title:parsed.title+(previous?' · 변경 사본':''),attachments:[asset.id],links:previous?[previous.id]:[],revision:1,folderSource:{connection:config.connection,folder:config.name,path:row.path,sha,importedAt:new Date().toISOString()}});
     notes.push(note);assets.push(asset);
    }
    if(notes.length){await db.batch({notes,assets});await changed(notes[0].id);}
    message=notes.length+'개 파일을 수집함에 보관했습니다. 원본 폴더와 기존 기록은 바꾸지 않았습니다.';rows=rows.map(r=>chosen.includes(r)?{...r,selected:false,state:'보관됨'}:r);channel?.postMessage('imported');
   });
  }catch(e){message=e.message;}finally{busy=false;paint();schedule();}
 }
 function open(){
  if(dialog?.isConnected){dialog.focus();return;}
  dialog=document.createElement('dialog');dialog.className='folder-source-dialog';dialog.setAttribute('aria-labelledby','folder-source-title');
  dialog.innerHTML='<header><h2 id="folder-source-title">폴더의 새 파일 가져오기</h2><button type="button" data-source-close>닫기 ×</button></header><p>읽을 폴더를 연결하고 보관할 파일을 선택하세요. 변경된 파일은 새 사본으로 남기고 이전 기록에 연결합니다. 원본 폴더에 쓰거나 파일을 삭제하지 않습니다.</p><p class="hint">자동 확인은 앱이 열린 동안 새 파일을 찾는 기능입니다. 자동으로 가져오거나 외부 삭제를 서재에 반영하지 않습니다. 백업 폴더·숨김 폴더·임시 파일은 제외합니다.</p><p data-source-name></p><div class="source-commands"><button type="button" data-source-command="choose">읽을 폴더 선택</button><button type="button" data-source-command="scan">지금 확인</button><button type="button" data-source-command="toggle">5분마다 자동 확인 켜기</button></div><p data-source-message role="status"></p><div data-source-rows></div><footer><button type="button" data-source-command="select">새 파일·변경 파일 모두 선택</button><button type="button" class="primary" data-source-command="import">선택한 파일 가져오기</button></footer>'+(!supported?'<p class="error">이 브라우저에서는 폴더 연결을 지원하지 않습니다. PC Edge·Chrome에서 열거나 일반 파일 가져오기를 사용하세요.</p>':'');
  document.body.append(dialog);dialog.showModal();paint();
  const guard=e=>{if((e.ctrlKey||e.metaKey)&&['s','k'].includes(e.key.toLowerCase())){e.preventDefault();e.stopImmediatePropagation();}};
  const close=()=>{dialog.close();dialog.remove();dialog=null;document.removeEventListener('keydown',guard,true);};
  document.addEventListener('keydown',guard,true);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('change',e=>{if(e.target.matches('[data-source-index]')){const row=rows[Number(e.target.dataset.sourceIndex)];if(row)row.selected=e.target.checked;paint();}});
  dialog.addEventListener('click',e=>{if(e.target.closest('[data-source-close]'))close();const a=e.target.closest('[data-source-command]')?.dataset.sourceCommand;if(a==='choose')void choose();if(a==='scan')void scan(true);if(a==='toggle')void toggle();if(a==='import')void importSelected();if(a==='select'){rows.forEach(r=>r.selected=!r.error&&r.state!=='보관됨');paint();}});
 }
 if(channel)channel.onmessage=async e=>{if(busy)return;if(e.data==='config'){config=await db.get('meta',KEY);rows=[];message='폴더 연결 설정이 바뀌었습니다. 지금 확인을 눌러 주세요.';paint();schedule();}else{message='다른 창에서 파일을 가져왔습니다. 지금 확인하면 목록을 갱신합니다.';paint();}};
 schedule();return {open};
}
