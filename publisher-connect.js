import {connectPublisher,getPublisherStatus,finishPublisherConnection} from './reading-publish.js';

const PENDING='pkos-publisher-connection-pending-v1';
const valid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
const randomId=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const params=new URLSearchParams(location.hash.slice(1)),code=params.get('code');
// Remove the capability from the address bar before any request or user action.
history.replaceState(null,'',location.pathname+location.search);
const button=document.querySelector('#connect-button'),status=document.querySelector('#connect-status');
let pending;
function message(text,error=false){status.textContent=text;status.dataset.error=String(error);}
function complete(){
 button.hidden=true;document.querySelector('#connect-return').hidden=false;
 document.querySelector('#connect-description').textContent='이 브라우저에서 웹 게시를 사용할 수 있습니다.';
 message('연결했습니다. 기록장에서 공유할 내용을 골라 주세요.');
 document.querySelector('#connect-hint').textContent='이미 열려 있는 공유 창에도 연결이 반영됩니다. 이전 화면이 그대로면 창을 닫았다가 다시 열어 주세요.';
 try{sessionStorage.removeItem(PENDING);}catch{}
}
document.querySelector('#connect-site').textContent=location.hostname==='legoschool.github.io'?'GitHub 기록장에 연결합니다.':'Vercel 기록장에 연결합니다.';
try{
 const previous=JSON.parse(sessionStorage.getItem(PENDING)||'null');
 if(valid(code))pending=previous?.code===code&&valid(previous.claimId)?previous:{code,claimId:randomId()};
 else if(!code&&valid(previous?.code)&&valid(previous?.claimId))pending=previous;
 if(pending)sessionStorage.setItem(PENDING,JSON.stringify(pending));
 if(getPublisherStatus().configured){
  if(pending)void finishPublisherConnection(pending.code,pending.claimId).catch(()=>{});
  complete();
 }else if(!pending){button.disabled=true;message('게시 연결 주소가 없습니다. 전달받은 연결 주소를 다시 열어 주세요.',true);}
}catch{button.disabled=true;message('브라우저 저장 공간을 사용할 수 없습니다. 일반 브라우저 창에서 다시 열어 주세요.',true);}
button.addEventListener('click',async()=>{
 if(!pending||button.disabled)return;
 button.disabled=true;message('게시 권한을 연결하고 있습니다…');
 try{await connectPublisher(pending.code,pending.claimId);complete();}
 catch(error){message(error.message||'연결하지 못했습니다. 다시 시도해 주세요.',true);button.disabled=false;button.textContent='다시 연결';}
});
