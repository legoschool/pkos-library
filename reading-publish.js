import {zipSync} from './vendor/fflate.js';

const API='https://pkos-library.vercel.app/api/reading-shares';
const KEY='pkos-reading-publisher-v1';
const MAX_BYTES=64*1024*1024;
const idPattern=/^[a-f0-9]{32}$/;
const newId=()=>crypto.randomUUID().replaceAll('-','');
function savedKey(){try{return localStorage.getItem(KEY)||'';}catch{return '';}}
export function getPublisherStatus(){return {configured:!!savedKey()};}
async function request(op,{method='GET',body,id,key=savedKey(),version,cursor}={}){
 const url=new URL(API);url.searchParams.set('op',op);
 for(const [name,value] of Object.entries({id,version,cursor}))if(value)url.searchParams.set(name,value);
 let response;
 try{response=await fetch(url,{method,cache:'no-store',credentials:'omit',headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
 catch{throw new Error('인터넷 연결을 확인한 뒤 다시 시도해 주세요.');}
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(result.error||'웹 게시 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
 return result;
}
export async function configurePublisher(key){
 key=String(key||'').trim();
 if(!/^[A-Za-z0-9_-]{43,128}$/.test(key))throw new Error('게시 설정 키를 확인해 주세요.');
 await request('status',{key});
 try{localStorage.setItem(KEY,key);}catch{throw new Error('이 브라우저에 게시 설정을 저장할 수 없습니다.');}
 return {configured:true};
}
// Consume the setup fragment before normal record navigation rewrites the hash.
// A fragment is never sent to the hosting server or included in the reader URL.
export function consumePublisherSetup(){
 const params=new URLSearchParams(location.hash.slice(1)),key=params.get('reading-publish-setup');
 if(!key)return null;
 history.replaceState(null,'',location.pathname+location.search);
 return configurePublisher(key).then(()=>({ok:true,message:'이 브라우저에서 웹 게시를 사용할 수 있습니다.'}),e=>({ok:false,message:e.message}));
}
export async function publishReadingBundle(bundle,{title='함께 읽기',id,onProgress=()=>{}}={}){
 if(!savedKey())throw new Error('게시 설정을 먼저 연결해 주세요.');
 if(id&&!idPattern.test(id))throw new Error('갱신할 공유 주소가 올바르지 않습니다.');
 id=id||newId();const version=newId();
 onProgress('공유 문서를 준비하고 있습니다…');
 await new Promise(resolve=>setTimeout(resolve,0));
 const bytes=zipSync(bundle.files,{level:0});
 if(bytes.byteLength>MAX_BYTES)throw new Error('공유 문서가 너무 큽니다. 포함할 첨부를 줄여 주세요.');
 const {upload}=await import('./vendor/reading-blob-client.js');
 let uploaded=false;
 try{
  await upload('reading-shares/'+id+'/'+version+'.zip',new Blob([bytes],{type:'application/zip'}),{
   access:'private',contentType:'application/zip',handleUploadUrl:API+'?op=upload',
   headers:{Authorization:'Bearer '+savedKey()},clientPayload:JSON.stringify({id,version}),
   multipart:bytes.byteLength>5*1024*1024,
   onUploadProgress:({percentage})=>onProgress('웹에 올리는 중… '+Math.round(percentage)+'%')
  });
  uploaded=true;onProgress('공유 주소를 만드는 중…');
  return await request('publish',{method:'POST',body:{id,version,title:String(title).slice(0,200)}});
 }catch(error){
  // A committed publication must survive an ambiguous network failure.
  // The server only discards this version when it is not the active manifest.
  if(uploaded)await request('discard',{method:'POST',id,version}).catch(()=>{});
  throw new Error(error?.message?.startsWith('Vercel Blob:')?'문서를 올리지 못했습니다. 인터넷 연결과 게시 설정을 확인해 주세요.':error.message||'웹 게시에 실패했습니다.');
 }
}
export async function listReadingShares(){
 const all=[];let cursor;
 do{const result=await request('list',{cursor});all.push(...(result.shares||result.items||[]));cursor=result.cursor;}while(cursor&&all.length<1000);
 return all;
}
export function deleteReadingShare(id){return request('delete',{method:'DELETE',id});}
