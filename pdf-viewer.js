import {getDocument,GlobalWorkerOptions} from './vendor/pdfjs/pdf.mjs';
GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
export async function showPdf(blob,host){
 const task=getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,wasmUrl:new URL('./vendor/pdfjs/wasm/',import.meta.url).href});
 let disposed=false,pdf=null,page=1,busy=false;
 const dialog=host.closest('dialog');
 const close=()=>{disposed=true;task.destroy();};dialog.addEventListener('close',close,{once:true});
 try{
  pdf=await task.promise;if(disposed)return;
  host.innerHTML='<div class="pdf-controls"><button type="button" class="quiet" data-pdf-step="-1">이전</button><span role="status"></span><button type="button" class="quiet" data-pdf-step="1">다음</button></div><canvas aria-label="PDF 페이지"></canvas><details><summary>페이지 텍스트</summary><pre class="pdf-text"></pre></details>';
  const canvas=host.querySelector('canvas'),status=host.querySelector('[role=status]');
  async function render(){
   busy=true;const buttons=[...host.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
   try{const p=await pdf.getPage(page);if(disposed)return;const natural=p.getViewport({scale:1}),scale=Math.min(2,(host.clientWidth||500)/natural.width),viewport=p.getViewport({scale}),ratio=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);canvas.style.width='100%';canvas.style.height='auto';
    await p.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]}).promise;
    if(disposed)return;const text=await p.getTextContent();host.querySelector('.pdf-text').textContent=text.items.map(i=>i.str).join(' ');status.textContent=page+' / '+pdf.numPages+' 페이지';canvas.setAttribute('aria-label','PDF '+page+'페이지. 아래에서 페이지 텍스트를 펼칠 수 있습니다.');host.dataset.rendered=String(page);
   }finally{busy=false;if(!disposed){buttons[0].disabled=page<=1;buttons[1].disabled=page>=pdf.numPages;}}
  }
  host.addEventListener('click',e=>{const button=e.target.closest('[data-pdf-step]');if(button&&!busy){page+=Number(button.dataset.pdfStep);render().catch(showError);}});
  await render();
 }catch(e){showError(e);}
 function showError(e){if(disposed)return;host.textContent='PDF를 미리 볼 수 없습니다. 암호나 파일 형식을 확인하고 원본을 다운로드해 여세요. '+e.message;}
}
