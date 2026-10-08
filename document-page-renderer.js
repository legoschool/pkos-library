// Full document-page images. The source Blob is read only; persistence belongs to the caller.
export const DOCUMENT_PAGE_LIMITS=Object.freeze({inputBytes:20*1024*1024,pages:200,maxSide:2000,pageBytes:16*1024*1024,totalBytes:200*1024*1024,timeoutMs:60000});
const aborted=()=>new DOMException('문서 이미지 만들기를 취소했습니다.','AbortError');
const check=signal=>{if(signal?.aborted)throw aborted();};
const countCheck=count=>{if(!Number.isSafeInteger(count)||count<1||count>DOCUMENT_PAGE_LIMITS.pages)throw Error('문서 전체를 이미지로 만들 수 없습니다. 한 번에 200쪽까지 지원합니다. 원본을 나누어 첨부해 주세요.');};
function bounded(promise,signal,timeout=DOCUMENT_PAGE_LIMITS.timeoutMs){
 check(signal);
 return new Promise((resolve,reject)=>{
  const stop=()=>done(reject,aborted()),timer=setTimeout(()=>done(reject,Error('문서 페이지 처리 시간이 초과되었습니다. 원본을 나누거나 PDF 사본으로 다시 시도해 주세요.')),timeout);
  function done(fn,value){clearTimeout(timer);signal?.removeEventListener('abort',stop);fn(value);}
  signal?.addEventListener('abort',stop,{once:true});Promise.resolve(promise).then(value=>done(resolve,value),error=>done(reject,error));
 });
}
export async function renderDocumentPages(asset,{signal,onProgress,onPage}={}){
 check(signal);
 if(typeof onPage!=='function')throw Error('페이지 이미지를 저장할 처리가 필요합니다.');
 if(!asset?.blob?.arrayBuffer)throw Error('문서 원본 파일을 찾을 수 없습니다.');
 if(asset.blob.size>DOCUMENT_PAGE_LIMITS.inputBytes)throw Error('문서 이미지는 원본 20MB까지 만들 수 있습니다. 원본을 나누어 첨부해 주세요.');
 const name=String(asset.name||''),isPdf=/\.pdf$/i.test(name)||asset.type==='application/pdf',isPptx=/\.pptx$/i.test(name);
 if(/\.ppt$/i.test(name))throw Error('옛 PowerPoint(.ppt)는 브라우저에서 쪽별 이미지로 만들 수 없습니다. PowerPoint에서 .pptx 또는 PDF 사본으로 저장해 첨부해 주세요. 원본은 그대로 보관됩니다.');
 if(!isPdf&&!isPptx)throw Error('쪽별 이미지는 PDF와 PowerPoint(.pptx) 문서에서 만들 수 있습니다.');
 let total=0;
 const accept=async page=>{
  check(signal);
  if(!(page.blob instanceof Blob)||page.blob.type!=='image/png'||!page.blob.size||page.blob.size>DOCUMENT_PAGE_LIMITS.pageBytes)throw Error('한 페이지의 이미지 용량 한도(16MB)를 넘었거나 이미지를 만들지 못했습니다.');
  total+=page.blob.size;
  if(total>DOCUMENT_PAGE_LIMITS.totalBytes)throw Error('페이지 이미지의 전체 용량 한도(200MB)를 넘었습니다. 원본을 나누어 다시 시도해 주세요.');
  await onPage(page);check(signal);
 };
 return isPdf?renderPdf(asset.blob,{signal,onProgress,onPage:accept}):renderPptx(asset.blob,{signal,onProgress,onPage:accept});
}
async function renderPdf(blob,{signal,onProgress,onPage}){
 const {getDocument,GlobalWorkerOptions}=await import('./vendor/pdfjs/pdf.mjs');check(signal);
 GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
 let loading,task,canvas,password=false;
 const cancel=()=>{task?.cancel();void loading?.destroy();};signal?.addEventListener('abort',cancel,{once:true});
 try{
  const data=new Uint8Array(await bounded(blob.arrayBuffer(),signal));
  loading=getDocument({data,isEvalSupported:false,cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,wasmUrl:new URL('./vendor/pdfjs/wasm/',import.meta.url).href});
  loading.onPassword=()=>{password=true;void loading.destroy();};
  const pdf=await bounded(loading.promise,signal);countCheck(pdf.numPages);onProgress?.({number:0,count:pdf.numPages});
  for(let number=1;number<=pdf.numPages;number++){
   check(signal);onProgress?.({number,count:pdf.numPages});
   const page=await bounded(pdf.getPage(number),signal),natural=page.getViewport({scale:1});
   if(!Number.isFinite(natural.width)||!Number.isFinite(natural.height)||natural.width<=0||natural.height<=0)throw Error('PDF 페이지 크기를 읽을 수 없습니다.');
   const viewport=page.getViewport({scale:Math.min(2,DOCUMENT_PAGE_LIMITS.maxSide/natural.width,DOCUMENT_PAGE_LIMITS.maxSide/natural.height)});
   canvas=document.createElement('canvas');canvas.width=Math.min(DOCUMENT_PAGE_LIMITS.maxSide,Math.max(1,Math.ceil(viewport.width)));canvas.height=Math.min(DOCUMENT_PAGE_LIMITS.maxSide,Math.max(1,Math.ceil(viewport.height)));
   const context=canvas.getContext('2d');if(!context)throw Error('이 브라우저에서 페이지 이미지를 만들 수 없습니다.');
   task=page.render({canvasContext:context,viewport,background:'white'});await bounded(task.promise,signal);task=null;
   const png=await bounded(new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('PDF 페이지 이미지를 만들지 못했습니다.')),'image/png')),signal);
   const text=(await bounded(page.getTextContent(),signal)).items.map(item=>item.str||'').join(' ');
   await onPage({number,blob:png,width:canvas.width,height:canvas.height,text});
   canvas.width=0;canvas.height=0;canvas=null;page.cleanup();
  }
  return {count:pdf.numPages};
 }catch(error){
  if(signal?.aborted)throw aborted();
  if(password||error?.name==='PasswordException')throw Error('암호가 걸린 PDF입니다. 원본 프로그램에서 암호를 해제한 PDF 사본을 첨부해 주세요.');
  throw Error('PDF 페이지 이미지를 만들지 못했습니다. '+(error?.message||'원본의 손상 여부를 확인해 주세요.'));
 }finally{signal?.removeEventListener('abort',cancel);task?.cancel();if(canvas){canvas.width=0;canvas.height=0;}await loading?.destroy();}
}
async function renderPptx(blob,{signal,onProgress,onPage}){
 const response=await bounded(fetch(new URL('./pptx-preview.html',import.meta.url),{signal}),signal);
 if(!response.ok)throw Error('슬라이드 변환 화면을 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.');
 const html=await bounded(response.text(),signal);check(signal);
 const frame=document.createElement('iframe'),id=crypto.randomUUID();frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;frame.title='슬라이드 이미지 만들기';frame.dataset.documentPageRenderer='pptx';
 frame.style.cssText='position:fixed;left:-10000px;top:0;width:2000px;height:2000px;border:0;pointer-events:none;';
 let timer,settled=false,count=0,received=0,accepting=false,started=false;
 return new Promise((resolve,reject)=>{
  const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>finish(Error('슬라이드 이미지 처리 시간이 초과되었습니다. PDF 사본으로 다시 시도해 주세요.')),DOCUMENT_PAGE_LIMITS.timeoutMs);};
  const stop=()=>finish(aborted());
  function finish(error){if(settled)return;settled=true;clearTimeout(timer);window.removeEventListener('message',receive);signal?.removeEventListener('abort',stop);frame.remove();error?reject(error):resolve({count});}
  async function receive(event){
   if(settled||event.source!==frame.contentWindow)return;
   const message=event.data;
   try{
    if(message?.type==='pkos-pptx-ready'&&!started){started=true;const data=await blob.arrayBuffer();check(signal);if(!settled)frame.contentWindow.postMessage({type:'pkos-pptx-export',id,data,limits:DOCUMENT_PAGE_LIMITS},'*',[data]);return;}
    if(message?.id!==id)return;
    if(message.type==='pkos-pptx-export-count'){countCheck(message.count);count=message.count;onProgress?.({number:0,count});arm();}
    else if(message.type==='pkos-pptx-export-page'){
     if(accepting||message.number!==received+1||message.number>count||!(message.data instanceof ArrayBuffer)||!Number.isSafeInteger(message.width)||!Number.isSafeInteger(message.height)||message.width<1||message.height<1||message.width>DOCUMENT_PAGE_LIMITS.maxSide||message.height>DOCUMENT_PAGE_LIMITS.maxSide)throw Error('슬라이드 이미지 순서나 크기를 확인하지 못했습니다.');
     accepting=true;clearTimeout(timer);onProgress?.({number:message.number,count});
     await onPage({number:message.number,blob:new Blob([message.data],{type:'image/png'}),width:message.width,height:message.height,text:typeof message.text==='string'?message.text:''});
     check(signal);if(settled)return;received++;accepting=false;arm();frame.contentWindow.postMessage({type:'pkos-pptx-export-next',id,number:received},'*');
    }else if(message.type==='pkos-pptx-export-done'){if(received!==count||accepting)throw Error('모든 슬라이드 이미지를 받지 못했습니다.');finish();}
    else if(message.type==='pkos-pptx-export-error')throw Error('PPTX 페이지 이미지를 만들지 못했습니다. '+message.message);
   }catch(error){finish(error);}
  }
  window.addEventListener('message',receive);signal?.addEventListener('abort',stop,{once:true});frame.srcdoc=html;document.body.append(frame);arm();if(signal?.aborted)stop();
 });
}
