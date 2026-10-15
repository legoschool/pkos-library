import DOMPurify from './vendor/purify.js';
import {esc} from './core.js';

export function isHtmlAsset(asset){
 return /\.html?$/i.test(asset?.name||'')||/^text\/html(?:\s*;|$)/i.test(asset?.type||'');
}

// Keep styling inside an opaque, script-free frame. The stored original is never changed.
function previewDocument(source){
 const root=DOMPurify.sanitize(source,{
  WHOLE_DOCUMENT:true,RETURN_DOM:true,ADD_TAGS:['style'],
  FORBID_TAGS:['script','iframe','object','embed','base','meta','link','form'],
  FORBID_ATTR:['srcset','srcdoc','action','formaction','autofocus','ping','target','download'],
 });
 for(const el of root.querySelectorAll('[src],[href],[xlink\\:href],[poster],[background]')){
  for(const attr of ['src','href','xlink:href','poster','background']){
   const value=el.getAttribute(attr);if(value===null)continue;
   if((attr==='href'||attr==='xlink:href')&&value.startsWith('#')){
    if(el.tagName==='A'&&el.namespaceURI==='http://www.w3.org/1999/xhtml')el.setAttribute(attr,'about:srcdoc'+value);
    continue;
   }
   if(['src','poster','background'].includes(attr)&&/^data:image\//i.test(value))continue;
   el.removeAttribute(attr);
  }
 }
 const doc=root.ownerDocument,head=root.querySelector('head');
 const csp=doc.createElement('meta');csp.httpEquiv='Content-Security-Policy';
 csp.content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'";
 head.prepend(csp);
 const viewport=doc.createElement('meta');viewport.name='viewport';viewport.content='width=device-width,initial-scale=1';head.append(viewport);
 return '<!doctype html>'+root.outerHTML;
}

export function showHtmlPreview(input,{dialog}){
 const assets=input.filter(isHtmlAsset);if(!assets.length)return;
 const d=dialog(assets[0].name,`<div class="html-preview-toolbar">${assets.length>1?`<label>HTML 파일 <select data-html-select>${assets.map((a,i)=>`<option value="${i}">${esc(a.name)}</option>`).join('')}</select></label>`:''}<a data-html-download>원본 다운로드</a></div><p class="html-preview-note">파일 안의 글·스타일·포함된 이미지를 표시합니다. 스크립트와 외부 파일은 실행하거나 불러오지 않습니다.</p><p data-html-status role="status">HTML을 불러오는 중입니다.</p><iframe class="html-preview-frame" title="HTML 미리보기" sandbox="" referrerpolicy="no-referrer" hidden></iframe>`);
 d.classList.add('document-preview-dialog');
 const frame=d.querySelector('iframe'),status=d.querySelector('[data-html-status]'),link=d.querySelector('[data-html-download]');
 let version=0,url='',disposed=false;
 const dispose=()=>{if(disposed)return;disposed=true;version++;if(url)URL.revokeObjectURL(url);frame.removeAttribute('srcdoc');d.removeEventListener('close',closed);observer.disconnect();};
 const closed=()=>{if(!d.open||!frame.isConnected)dispose();};
 // A shared dialog can be replaced before its queued close event is delivered.
 d.addEventListener('close',closed);
 const observer=new MutationObserver(()=>{if(!frame.isConnected)dispose();});
 observer.observe(d,{childList:true});
 async function select(index){
  const asset=assets[index];if(!asset||disposed)return;
  const request=++version;
  frame.hidden=true;frame.removeAttribute('srcdoc');status.hidden=false;status.textContent='HTML을 불러오는 중입니다.';
  if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(asset.blob);link.href=url;link.download=asset.name;
  d.querySelector('#dialog-title').textContent=asset.name;
  frame.title=asset.name+' · HTML 미리보기';
  try{
   const source=await asset.blob.text();
   if(disposed||request!==version||!frame.isConnected||!d.open)return;
   frame.srcdoc=previewDocument(source);frame.hidden=false;status.hidden=true;
  }catch{
   if(disposed||request!==version||!frame.isConnected)return;
   status.textContent='미리보기를 표시하지 못했습니다. 원본을 내려받아 열어 주세요.';
  }
 }
 d.querySelector('[data-html-select]')?.addEventListener('change',event=>void select(Number(event.target.value)));
 void select(0);
 return d;
}
