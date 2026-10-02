import {validateBackup} from './core.js';
// 연결한 카드 파일(.pkem)을 앱을 켤 때와 창으로 돌아올 때 다시 읽어, 자료 카드(updatable)만 서재에 반영한다.
// 파일은 제자리에 둔다. 브라우저 권한이 '방문할 때마다 허용'이면 누르지 않아도 반영되고, 아니면 위쪽 버튼으로 한 번 허용한다.
const KEY='card-sync-v1';
export async function applyCardFile(db,text){
 const data=validateBackup(JSON.parse(text));
 return db.mergeBackup({...data,notes:data.notes.filter(n=>n.updatable===true&&!n.attachments.length),assets:[]});
}
export const cardSyncSupported=()=>typeof window.showOpenFilePicker==='function';
export async function setupCardSync({db,demo,toast,busy,changed,paint}){
 let config=await db.get('meta',KEY),running=false,needs=false;
 if(config&&!config.handle)config=null;
 const setNeeds=v=>{if(needs!==v){needs=v;paint();}};
 const summary=r=>[r.updated?`갱신 ${r.updated}개`:'',r.added?`새로 ${r.added}개`:'',r.retired?`정리 ${r.retired}개(휴지통)`:'',r.copies?`사본 ${r.copies}개`:'',r.kept?`고친 카드 ${r.kept}개 유지`:''].filter(Boolean).join(' · ');
 async function sync({manual=false,force=false}={}){
  if(running||!config?.handle)return null;
  if(busy()){if(manual)toast('편집을 마친 뒤 다시 눌러 주세요.');return null;}
  running=true;
  try{
   let perm=await config.handle.queryPermission({mode:'read'});
   if(perm!=='granted'&&manual)perm=await config.handle.requestPermission({mode:'read'});
   if(perm!=='granted'){setNeeds(true);return null;}
   setNeeds(false);
   const file=await config.handle.getFile();
   if(!force&&file.lastModified===config.lastModified&&file.size===config.size){if(manual)toast('카드 파일이 바뀌지 않았습니다.');return {unchanged:true};}
   const result=await applyCardFile(db,await file.text());
   config={...config,lastModified:file.lastModified,size:file.size,syncedAt:new Date().toISOString(),last:{updated:result.updated,added:result.added,retired:result.retired||0,copies:result.copies}};
   await db.put('meta',config);
   if(result.added||result.updated||result.retired||result.copies)await changed();
   toast(`카드 파일을 반영했습니다${summary(result)?' · '+summary(result):' · 바뀐 카드 없음'}`);
   return result;
  }catch(e){
   if(e.name==='NotFoundError'){toast('연결한 카드 파일을 찾지 못했습니다. 설정에서 다시 연결해 주세요.');}
   else if(manual)toast(e.message||'카드 파일을 반영하지 못했습니다.');
   return null;
  }finally{running=false;}
 }
 async function connect(){
  if(!cardSyncSupported())throw Error('이 브라우저는 파일 연결을 지원하지 않습니다. PC의 크롬이나 엣지에서 연결해 주세요.');
  const [handle]=await window.showOpenFilePicker({id:'pkos-card-sync',multiple:false,types:[{description:'PKOS 카드·백업 파일',accept:{'application/json':['.pkem','.json']}}]});
  config={id:KEY,handle,name:handle.name,lastModified:0,size:0};await db.put('meta',config);paint();
  return sync({manual:true,force:true});
 }
 async function disconnect(){config=null;needs=false;await db.put('meta',{id:KEY});paint();toast('카드 파일 연결을 끊었습니다. 서재의 카드는 그대로 남습니다.');}
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void sync();});
 return {sync,connect,disconnect,needsPermission:()=>needs,status:()=>config};
}
