export const convertible=name=>/\.(docx|pptx|hwpx|xlsx|pdf)$/i.test(name);
function hash(bytes){return crypto.subtle.digest('SHA-256',bytes).then(b=>[...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,'0')).join(''));}
function base64(bytes){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
async function extractPDF(file,signal,report){
 const {getDocument,GlobalWorkerOptions}=await import('./vendor/pdfjs/pdf.mjs');
 const {pageText}=await import('./pdf-text.js');
 GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
 const bytes=new Uint8Array(await file.arrayBuffer());
 const task=getDocument({data:bytes.slice(),isEvalSupported:false,cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,wasmUrl:new URL('./vendor/pdfjs/wasm/',import.meta.url).href});
 const abort=()=>task.destroy();signal.addEventListener('abort',abort,{once:true});
 task.onPassword=()=>task.destroy();
 const chunks=[];let count=0,total=0;
 try{
  const pdf=await task.promise,warnings=['PDF의 본문을 쪽별로 추출합니다. 그림 분리·스캔 문서 OCR은 포함하지 않습니다.'];
  for(let p=1;p<=Math.min(pdf.numPages,300);p++){
   if(signal.aborted)throw new DOMException('취소했습니다.','AbortError');
   report(p+' / '+pdf.numPages+'쪽 읽는 중');
   const page=await pdf.getPage(p),content=await page.getTextContent(),text=pageText(content.items).text;page.cleanup();
   if(total+text.length>1000000){warnings.push('본문은 100만 글자까지만 추출했습니다.');break;}
   chunks.push('## '+p+'쪽\n\n'+(text||'이 쪽에는 추출할 텍스트가 없습니다. 원본을 확인하세요.'));total+=text.length;count++;
  }
  if(pdf.numPages>300)warnings.push('처음 300쪽까지 추출했습니다.');
  if(!total)throw Error('추출할 텍스트가 없습니다. 스캔 문서 OCR은 아직 지원하지 않습니다. 원본은 보관돼 있습니다.');
  return {body:chunks.join('\n\n'),warnings,extractedImages:[],originalSha:await hash(bytes),kind:'PDF',pages:count};
 }catch(e){if(signal.aborted)throw new DOMException('취소했습니다.','AbortError');if(/password|destroyed|worker was destroyed/i.test(e.message))throw Error('암호가 있거나 열 수 없는 PDF입니다. 원본 프로그램에서 확인해 주세요.');throw e;}
 finally{signal.removeEventListener('abort',abort);await task.destroy();}
}
async function extract(asset,signal,report){
 if(/\.pdf$/i.test(asset.name))return extractPDF(asset.blob,signal,report);
 if(document.querySelector('meta[name=pkos-conversion]')?.content==='browser'){const {extractBrowserDocument}=await import('./browser-document-conversion.js');return extractBrowserDocument(asset,signal,report);}
 const bytes=new Uint8Array(await asset.blob.arrayBuffer());
 report('이 PC에서 본문과 이미지를 추출하는 중');
 const response=await fetch('/api/convert-document',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:asset.name,base64:base64(bytes)}),signal});
 let result;try{result=await response.json();}catch{throw Error('변환 서버에 연결할 수 없습니다. 앱 실행 상태를 확인해 주세요.');}
 if(!response.ok||!result.ok)throw Error(result.error||'문서를 변환하지 못했습니다.');
 if(result.originalSha!==await hash(bytes))throw Error('원본과 추출 결과가 일치하지 않아 저장하지 않았습니다.');
 if(typeof result.body!=='string'||result.body.length>1000000||!Array.isArray(result.extractedImages)||result.extractedImages.length>40)throw Error('추출 결과가 허용 범위를 넘었습니다.');
 return result;
}
let active=null;
export function showConversion(jobs,api,{automatic=false}={}){
 if(active){api.toast('열려 있는 문서 추출 창을 먼저 마쳐 주세요.');return;}
 if(!jobs.length){api.toast('PDF·DOCX·PPTX·HWPX·XLSX 원본이 없습니다.');return;}
 const d=document.createElement('dialog');d.className='conversion-dialog';d.setAttribute('aria-labelledby','conversion-title');
 d.innerHTML='<header><h2 id="conversion-title">문서 본문과 이미지 추출</h2><button type="button" data-convert="close">닫기 ×</button></header><div class="dialog-body"><p>원본은 이미 서재에 보관돼 있습니다. 추출한 본문과 이미지는 별도 기록으로 저장하고 원본 기록에 연결합니다. 기존 메모를 덮어쓰지 않습니다.</p><p class="hint">이 PC에서 처리합니다. DOCX·PPTX·HWPX·XLSX는 본문·내장 이미지, PDF는 쪽별 본문을 추출합니다. 스캔 OCR·옛 HWP·XLS는 아직 지원하지 않습니다.</p><div class="conversion-jobs"></div></div><footer><button type="button" data-convert="stop" hidden>현재 작업 중지</button><button type="button" class="primary" data-convert="start">추출 시작</button></footer>';
 let busy=false,saving=false,controller=null,closed=false;
 const rows=jobs.map(job=>{const el=document.createElement('section');el.className='conversion-job';const title=document.createElement('strong');title.textContent=job.asset.name;const status=document.createElement('p');status.setAttribute('role','status');status.textContent='대기';const open=document.createElement('button');open.type='button';open.hidden=true;open.textContent='추출 기록 열기';el.append(title,status,open);d.querySelector('.conversion-jobs').append(el);return {job,el,status,open,saved:false,result:null,id:null};});
 document.body.append(d);d.showModal();active=d;
 const warn=e=>{if(busy){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);
 const guard=e=>{if((e.ctrlKey||e.metaKey)&&['k','s'].includes(e.key.toLowerCase())){e.preventDefault();e.stopImmediatePropagation();}};document.addEventListener('keydown',guard,true);
 function close(){if(saving){api.toast('추출 결과 저장이 끝날 때까지 기다려 주세요.');return;}closed=true;controller?.abort();d.close();d.remove();active=null;window.removeEventListener('beforeunload',warn);document.removeEventListener('keydown',guard,true);}
 d.addEventListener('cancel',e=>{e.preventDefault();close();});
 async function run(){
  if(busy)return;busy=true;controller=new AbortController();d.querySelector('[data-convert="start"]').disabled=true;d.querySelector('[data-convert="stop"]').hidden=false;rows.forEach(r=>r.open.disabled=true);
  for(const row of rows){
   if(closed||controller.signal.aborted)break;if(row.saved)continue;
   try{
    row.status.textContent='추출 준비 중';
    if(!row.result)row.result=await extract(row.job.asset,controller.signal,message=>row.status.textContent=message);
    if(closed||controller.signal.aborted)break;
    saving=true;row.status.textContent='추출 결과 저장 중';row.id=await api.save(row.job,row.result);row.saved=true;
    row.status.textContent='저장 완료 · '+row.result.extractedImages.length+'개 이미지'+(row.result.warnings?.length?' · '+row.result.warnings.join(' '):'');row.open.hidden=false;
    row.open.onclick=()=>{if(busy)return;close();api.open(row.id);};
   }catch(e){row.status.textContent=(controller.signal.aborted?'중지했습니다.':e.message)+' 원본은 서재에 남아 있습니다.';}
   finally{saving=false;}
  }
  busy=false;if(closed)return;
  rows.forEach(r=>r.open.disabled=false);d.querySelector('[data-convert="stop"]').hidden=true;const start=d.querySelector('[data-convert="start"]');start.disabled=rows.every(r=>r.saved);start.textContent=rows.some(r=>!r.saved)?'남은 파일 다시 시도':'모두 저장됨';
 }
 d.addEventListener('click',e=>{const action=e.target.closest('[data-convert]')?.dataset.convert;if(action==='close')close();if(action==='start')void run();if(action==='stop'&&!saving)controller?.abort();});
 if(automatic)void run();
}
