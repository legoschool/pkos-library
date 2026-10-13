import {unzipSync,strFromU8} from './vendor/fflate.js';
import DOMPurify from './vendor/purify.js';

const API='https://pkos-library.vercel.app/api/reading-shares';
const MAX_BYTES=64*1024*1024;
const mime=path=>({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',m4a:'audio/mp4',mp4:'video/mp4',webm:'video/webm'})[path.split('.').pop().toLowerCase()]||'application/octet-stream';
let urls=[];
function clean(){urls.forEach(URL.revokeObjectURL);urls=[];}
export function readingDocument(bytes){
 if(bytes.byteLength>MAX_BYTES)throw new Error('공유 문서 크기가 한도를 넘었습니다.');
 let expanded=0,count=0;
 const files=unzipSync(bytes,{filter(file){
  expanded+=file.originalSize;count++;
  if(expanded>MAX_BYTES||count>2048)throw new Error('공유 문서 크기가 한도를 넘었습니다.');
  if(file.name.split('/').some(part=>part==='..'||part==='.')||file.name.includes('\\')||file.name.startsWith('/'))throw new Error('올바르지 않은 공유 문서입니다.');
  return file.name==='index.html'||file.name.startsWith('attachments/');
 }});
 if(!files['index.html'])throw new Error('공유 문서 내용을 찾지 못했습니다.');
 const source=strFromU8(files['index.html']);
 const cleanHTML=DOMPurify.sanitize(source,{WHOLE_DOCUMENT:true,ADD_TAGS:['style'],FORBID_TAGS:['script','iframe','object','embed','base','form','input','button','meta','link','svg','math'],FORBID_ATTR:['srcset','srcdoc','action','formaction','autofocus']});
 const doc=new DOMParser().parseFromString(cleanHTML,'text/html'),paths=new Map();
 for(const [path,data] of Object.entries(files))if(path.startsWith('attachments/')){
  const url=URL.createObjectURL(new Blob([data],{type:mime(path)}));urls.push(url);paths.set(path.split('/').map(encodeURIComponent).join('/'),url);
 }
 for(const el of doc.querySelectorAll('[src],[href]'))for(const attr of ['src','href']){
  const value=el.getAttribute(attr);if(value===null)continue;
  if(paths.has(value)){el.setAttribute(attr,paths.get(value));continue;}
  if(attr==='href'&&el.tagName==='A'&&value.startsWith('#'))continue;
  if(attr==='href'&&el.tagName==='A'&&/^https?:\/\//i.test(value)){
   try{const u=new URL(value);if(u.username||u.password)throw new Error();el.target='_blank';el.rel='noopener noreferrer';continue;}catch{}
  }
  el.removeAttribute(attr);
 }
 const csp=doc.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="default-src 'none'; style-src 'unsafe-inline'; img-src blob:; media-src blob:; base-uri 'none'; form-action 'none'";doc.head.prepend(csp);
 const viewport=doc.createElement('meta');viewport.name='viewport';viewport.content='width=device-width,initial-scale=1';doc.head.append(viewport);
 return '<!doctype html>'+doc.documentElement.outerHTML;
}
async function readResponse(response){
 if(!response.ok){if(response.status===404||response.status===410)throw new Error('게시가 취소되었거나 찾을 수 없는 공유 주소입니다.');throw new Error('문서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');}
 return response;
}
async function load(){
 const status=document.querySelector('#share-status'),frame=document.querySelector('#share-document'),retry=document.querySelector('#share-retry');
 clean();frame.hidden=true;frame.removeAttribute('srcdoc');status.hidden=false;status.textContent='공유 문서를 여는 중입니다…';retry.hidden=true;
 try{
  const id=new URLSearchParams(location.search).get('id');if(!/^[a-f0-9]{32}$/.test(id||''))throw new Error('공유 주소가 올바르지 않습니다.');
  const meta=await (await readResponse(await fetch(API+'?id='+id,{cache:'no-store',credentials:'omit'}))).json();
  const response=await readResponse(await fetch(API+'?op=archive&id='+id,{cache:'no-store',credentials:'omit'}));
  const reader=response.body.getReader(),chunks=[];let length=0;
  while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_BYTES){await reader.cancel();throw new Error('공유 문서 크기가 한도를 넘었습니다.');}chunks.push(value);}
  const data=new Uint8Array(length);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
  frame.srcdoc=readingDocument(data);frame.hidden=false;status.hidden=true;document.title=String(meta.title||'함께 읽기')+' · PKOS';
  document.querySelector('#share-copy').hidden=false;
 }catch(e){clean();status.textContent=e.message==='Failed to fetch'?'인터넷 연결을 확인한 뒤 다시 시도해 주세요.':e.message;retry.hidden=false;}
}
document.querySelector('#share-retry')?.addEventListener('click',load);
document.querySelector('#share-copy')?.addEventListener('click',async e=>{try{await navigator.clipboard.writeText(location.href);e.target.textContent='복사됨';}catch{e.target.textContent='주소창에서 복사해 주세요';}});
addEventListener('pagehide',clean);
if(document.querySelector('#share-document'))void load();
