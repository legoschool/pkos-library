import {PptxViewer, parseZipLazyMedia, buildPresentation, RECOMMENDED_ZIP_LIMITS} from '@aiden0z/pptx-renderer/browser';
import {createPageViewer} from '../page-viewer.js';
const host = document.querySelector('#pages'), controller = new AbortController();
let viewer, opened = false;
// Export is sequential and isolated in this opaque-origin frame. Data URLs keep
// the raster canvas origin-clean; no document data is sent to a network service.
const toDataURL=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
const pngBlob=canvas=>new Promise((resolve,reject)=>{try{canvas.toBlob(blob=>blob?resolve(blob):reject(Error('슬라이드 PNG를 만들지 못했습니다.')),'image/png');}catch(error){reject(error);}});
async function slidePng(element,width,height,fonts){
 const resources=new Map();let nodes=0;
 async function inlineUrl(url){
  if(!url||url.startsWith('data:')||url.startsWith('#'))return url;
  if(url.startsWith('about:srcdoc#'))return '#'+url.split('#').slice(1).join('#');
  if(!url.startsWith('blob:'))throw Error('외부에 연결된 이미지가 있습니다. 그림을 문서 안에 넣거나 PDF 사본으로 다시 시도해 주세요.');
  if(resources.has(url))return resources.get(url);
  const image=new Image();image.src=url;await image.decode();
  if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>16000000)throw Error('슬라이드의 원본 그림이 너무 크거나 손상되었습니다. PDF 사본으로 다시 시도해 주세요.');
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);
  const result=canvas.toDataURL('image/png');canvas.width=0;canvas.height=0;resources.set(url,result);return result;
 }
 async function cssUrls(value){
  const matches=[...value.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
  for(const match of matches)value=value.replace(match[0],'url("'+await inlineUrl(match[1])+'")');return value;
 }
 async function cloneNode(node){
  if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent);
  if(node.nodeType!==Node.ELEMENT_NODE)return null;
  if(++nodes>30000)throw Error('한 슬라이드의 요소가 너무 많습니다. PDF 사본으로 다시 시도해 주세요.');
  if(/^(SCRIPT|IFRAME|OBJECT|EMBED|LINK|META|BASE)$/.test(node.tagName))throw Error('슬라이드에 이미지로 만들 수 없는 요소가 있습니다. PDF 사본으로 다시 시도해 주세요.');
  let copy;
  if(node instanceof HTMLCanvasElement){copy=document.createElement('img');copy.src=node.toDataURL('image/png');}
  else if(node instanceof HTMLVideoElement||node instanceof HTMLAudioElement)throw Error('동영상이나 오디오가 있는 슬라이드입니다. 정지 화면이 포함된 PDF 사본으로 다시 시도해 주세요.');
  else copy=node.cloneNode(false);
  for(const attribute of [...copy.attributes])if(/^on/i.test(attribute.name)||['srcset','crossorigin'].includes(attribute.name))copy.removeAttribute(attribute.name);
  if(copy.tagName==='A'){copy.removeAttribute('href');copy.removeAttribute('target');}
  const style=getComputedStyle(node);
  for(const property of style){let value=style.getPropertyValue(property);if(value.includes('url('))value=await cssUrls(value);copy.style.setProperty(property,value);}
  copy.style.setProperty('animation','none');copy.style.setProperty('transition','none');
  if(node instanceof HTMLImageElement){if(!node.complete)await node.decode();if(!node.naturalWidth)throw Error('슬라이드 그림을 읽지 못했습니다.');copy.src=await inlineUrl(node.currentSrc||node.src);}
  if(node.namespaceURI==='http://www.w3.org/2000/svg'&&node.localName==='image'){
   const href=node.getAttribute('href')||node.getAttributeNS('http://www.w3.org/1999/xlink','href');
   if(href){const url=await inlineUrl(href);copy.setAttribute('href',url);copy.removeAttributeNS('http://www.w3.org/1999/xlink','href');}
  }
  if(!(node instanceof HTMLCanvasElement))for(const child of node.childNodes){const cloned=await cloneNode(child);if(cloned)copy.append(cloned);}
  return copy;
 }
 const copy=await cloneNode(element);copy.style.margin='0';copy.style.width=width+'px';copy.style.height=height+'px';copy.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
 const style=document.createElement('style');let fontBytes=0;
 for(const font of fonts){
  if(typeof font.source==='string')continue;
  const blob=new Blob([font.source],{type:'font/ttf'});fontBytes+=blob.size;
  if(fontBytes>32*1024*1024)throw Error('슬라이드에 포함된 글꼴 용량이 너무 큽니다. PDF 사본으로 다시 시도해 주세요.');
  style.textContent+='@font-face{font-family:'+JSON.stringify(font.family)+';src:url("'+await toDataURL(blob)+'");font-weight:'+(font.descriptors?.weight||'normal')+';font-style:'+(font.descriptors?.style||'normal')+';}';
 }
 copy.prepend(style);
 const xml=new XMLSerializer().serializeToString(copy),svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'"><foreignObject x="0" y="0" width="100%" height="100%">'+xml+'</foreignObject></svg>';
 if(svg.length>64*1024*1024)throw Error('슬라이드 이미지 처리 용량을 넘었습니다. PDF 사본으로 다시 시도해 주세요.');
 const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,width,height);context.drawImage(image,0,0);
 try{return await pngBlob(canvas);}finally{canvas.width=0;canvas.height=0;resources.clear();}
}
async function exportPages(model,id,limits){
 const fonts=[],NativeFontFace=window.FontFace;
 if(NativeFontFace)window.FontFace=new Proxy(NativeFontFace,{construct(Target,args){const [family,source,descriptors]=args;if(!fonts.some(font=>font.family===family&&font.descriptors?.weight===descriptors?.weight&&font.descriptors?.style===descriptors?.style))fonts.push({family,source,descriptors});return new Target(...args);}});
 let handle;
 const send=(type,fields={},transfer=[])=>parent.postMessage({type,id,...fields},'*',transfer);
 try{
  const issues=[];viewer=new PptxViewer(document.createElement('div'),{pdfjs:false,onNodeError:(node,error)=>issues.push(error?.message||node)});viewer.load(model);
  if(!Number.isSafeInteger(viewer.slideCount)||viewer.slideCount<1||viewer.slideCount>limits.pages)throw Error('한 번에 200슬라이드까지 지원합니다. 원본을 나누어 첨부해 주세요.');
  if(!Number.isFinite(viewer.slideWidth)||!Number.isFinite(viewer.slideHeight)||viewer.slideWidth<=0||viewer.slideHeight<=0)throw Error('슬라이드 크기를 확인할 수 없습니다.');
  const scale=Math.min(2,limits.maxSide/viewer.slideWidth,limits.maxSide/viewer.slideHeight),width=Math.min(limits.maxSide,Math.max(1,Math.ceil(viewer.slideWidth*scale))),height=Math.min(limits.maxSide,Math.max(1,Math.ceil(viewer.slideHeight*scale)));
  send('pkos-pptx-export-count',{count:viewer.slideCount});host.replaceChildren();host.style.cssText='width:'+width+'px;height:'+height+'px;overflow:hidden;background:white';
  for(let number=1;number<=viewer.slideCount;number++){
   if(controller.signal.aborted)throw new DOMException('취소했습니다.','AbortError');
   issues.length=0;host.replaceChildren();handle=viewer.renderThumbnailToContainer(number-1,host,{scale});
   if(!handle)throw Error(number+'번째 슬라이드를 읽지 못했습니다.');await handle.ready;await document.fonts.ready;
   if(issues.length)throw Error(number+'번째 슬라이드의 요소를 읽지 못했습니다. '+issues[0]);
   const text=host.innerText,blob=await slidePng(host,width,height,fonts);
   if(blob.size>limits.pageBytes)throw Error('한 슬라이드 이미지가 16MB를 넘었습니다.');
   const data=await blob.arrayBuffer();
   const acknowledged=new Promise(resolve=>{
    const next=event=>{if(event.source===parent&&event.data?.type==='pkos-pptx-export-next'&&event.data.id===id&&event.data.number===number){window.removeEventListener('message',next);resolve();}};
    window.addEventListener('message',next,{signal:controller.signal});
   });
   send('pkos-pptx-export-page',{number,width,height,text,data},[data]);await acknowledged;handle.dispose();handle=null;
  }
  send('pkos-pptx-export-done');
 }catch(error){send('pkos-pptx-export-error',{message:error?.message||'손상·암호 여부를 확인하거나 PDF 사본으로 다시 시도해 주세요.'});}
 finally{handle?.dispose();viewer?.destroy();if(NativeFontFace)window.FontFace=NativeFontFace;fonts.length=0;}
}
window.addEventListener('pagehide', () => { controller.abort(); viewer?.destroy(); }, {once: true});
window.addEventListener('message', async e => {
  if (e.source !== parent || opened || !['pkos-pptx-open','pkos-pptx-export'].includes(e.data?.type) || !(e.data.data instanceof ArrayBuffer)) return;
  opened = true;
  try {
    if (e.data.data.byteLength > 20 * 1024 * 1024) throw Error('PPTX는 20MB까지 미리 볼 수 있습니다.');
    const files = await parseZipLazyMedia(e.data.data, {...RECOMMENDED_ZIP_LIMITS, maxTotalUncompressedBytes: 100 * 1024 * 1024});
    const model = buildPresentation(files, {lazySlides: true});
    if(e.data.type==='pkos-pptx-export'){
      await exportPages(model,e.data.id,{pages:200,maxSide:2000,pageBytes:16*1024*1024});return;
    }
    viewer = new PptxViewer(document.createElement('div'), {pdfjs: false}); viewer.load(model);
    await createPageViewer(host, {count: viewer.slideCount, hideText: true, async render(page, target, thumbnail) {
      const available = target.clientWidth || (thumbnail ? 120 : 650);
      const width = thumbnail ? available : Math.min(available, innerHeight * 0.60 * viewer.slideWidth / viewer.slideHeight);
      const handle = viewer.renderThumbnailToContainer(page - 1, target, {width});
      if (!handle) throw Error('슬라이드를 읽을 수 없습니다.');
      handle.element.style.margin = '0 auto';
      target.inert = true; await handle.ready;
      return {dispose: () => handle.dispose()};
    }}, controller.signal);
  } catch (error) { if(e.data.type==='pkos-pptx-export')parent.postMessage({type:'pkos-pptx-export-error',id:e.data.id,message:error.message},'*');else host.textContent = 'PPTX를 미리 볼 수 없습니다. 손상·암호 여부를 확인하거나 PDF로 저장해 첨부해 주세요. ' + error.message; }
});
parent.postMessage({type: 'pkos-pptx-ready'}, '*');
