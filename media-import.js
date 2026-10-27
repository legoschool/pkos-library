import {isImageAsset,imageGroupsOf} from './image-groups-model.js';

let activeChoice=null;
let choiceId=0;
let activeImagePreview=null,imagePreviewId=0;
const mountedGroups=new WeakMap();

// This dialog owns only the choice; callers save the original files after it resolves.
export function chooseMediaPresentation(files){
 if(activeChoice){activeChoice.focus();return Promise.resolve(null);}
 const input=Array.from(files||[]),legacy=input.some(file=>/\.ppt$/i.test(file?.name||''));
 const d=document.createElement('dialog'),titleId='media-choice-title-'+(++choiceId);
 d.className='media-choice-dialog';d.setAttribute('aria-labelledby',titleId);
 d.innerHTML='<header><h2 id="'+titleId+'">어떻게 넣을까요?</h2><button type="button" class="quiet" data-media-choice="cancel" aria-label="닫기">닫기</button></header><div class="dialog-body"><div class="media-choice-options"><button type="button" data-media-choice="expanded"><strong>한 장씩 펼쳐 보기</strong><span>사진·PDF·PPT를 페이지별로 펼쳐 놓고 기록합니다.</span></button><button type="button" data-media-choice="slides"><strong>슬라이드로 넘겨 보기</strong><span>사진·PDF·PPT를 한 장씩 넘겨 봅니다.</span></button></div><p class="media-choice-note">어느 쪽을 골라도 원본 파일은 그대로 보관합니다.</p>'+(legacy?'<p class="media-choice-note">옛 .ppt 파일은 원본을 보관합니다. 내용을 보려면 .pptx 또는 PDF 사본을 넣어 주세요.</p>':'')+'</div>';
 return new Promise(resolve=>{
  let settled=false;
  const finish=value=>{
   if(settled)return;settled=true;
   observer.disconnect();d.removeEventListener('click',clicked);d.removeEventListener('cancel',cancelled);d.removeEventListener('close',closed);
   if(d.open)d.close();d.remove();if(activeChoice===d)activeChoice=null;resolve(value);
  };
  const clicked=event=>{const value=event.target.closest('[data-media-choice]')?.dataset.mediaChoice;if(value)finish(value==='cancel'?null:value);};
  const cancelled=event=>{event.preventDefault();finish(null);};
  const closed=()=>finish(null);
  const observer=new MutationObserver(()=>{if(!d.isConnected)finish(null);});
  d.addEventListener('click',clicked);d.addEventListener('cancel',cancelled);d.addEventListener('close',closed);
  document.body.append(d);activeChoice=d;observer.observe(document.body,{childList:true});
  try{d.showModal();}catch{finish(null);}
 });
}

function element(tag,className,text){
 const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;
}

// Preview the saved original without navigating away or triggering a download.
export function showImagePreview(asset){
 if(!isImageAsset(asset)||!(asset.blob instanceof Blob))return null;
 activeImagePreview?.close();
 const dialog=element('dialog','image-preview-dialog'),header=element('header'),title=element('h2','',asset.name||'사진 미리보기');
 title.id='image-preview-title-'+(++imagePreviewId);dialog.setAttribute('aria-labelledby',title.id);
 const close=element('button','quiet','닫기');close.type='button';close.dataset.imagePreviewClose='';close.autofocus=true;close.addEventListener('click',()=>dialog.close());header.append(title,close);
 const stage=element('div','image-preview-stage'),image=element('img');image.alt=asset.name||'사진';image.decoding='async';
 const status=element('p','image-preview-status','사진을 불러오는 중입니다.');status.setAttribute('role','status');
 image.addEventListener('load',()=>{status.hidden=true;},{once:true});image.addEventListener('error',()=>{image.hidden=true;status.hidden=false;status.textContent='사진을 표시하지 못했습니다. 원본을 내려받아 확인해 주세요.';},{once:true});
 const url=URL.createObjectURL(asset.blob);image.src=url;stage.append(image);
 const footer=element('footer'),download=element('a','image-group-download','원본 다운로드');download.href=url;download.download=asset.name||'사진';download.dataset.imagePreviewDownload='';footer.append(download);
 dialog.append(header,stage,status,footer);
 let disposed=false;
 const dispose=()=>{if(disposed)return;disposed=true;observer.disconnect();URL.revokeObjectURL(url);dialog.remove();if(activeImagePreview===dialog)activeImagePreview=null;};
 const observer=new MutationObserver(()=>{if(!dialog.isConnected)dispose();});
 dialog.addEventListener('close',dispose,{once:true});document.body.append(dialog);observer.observe(document.body,{childList:true,subtree:true});activeImagePreview=dialog;
 try{dialog.showModal();}catch(error){dispose();throw error;}
 return dialog;
}

export function mountImageGroups(host,note,assets,{onModeChange,onDetach,editing=false}={}){
 if(!host)return ()=>{};
 mountedGroups.get(host)?.();
 const assetMap=assets instanceof Map?assets:new Map(Array.from(assets||[]).map(asset=>[asset.id,asset]));
 const root=element('div','image-groups-list'),urls=new Map(),states=[];
 let disposed=false;
 const urlFor=asset=>{
  if(urls.has(asset.id))return urls.get(asset.id);
  try{const url=URL.createObjectURL(asset.blob);urls.set(asset.id,url);return url;}catch{return '';}
 };
 const picture=(asset,className,lazy=false)=>{
  const image=element('img',className);image.alt=asset.name||'사진';image.dataset.imageAsset=asset.id;image.decoding='async';if(lazy)image.loading='lazy';
  const button=element('button','image-preview-button');button.type='button';button.dataset.imagePreviewAsset=asset.id;button.setAttribute('aria-label','사진 크게 보기: '+(asset.name||'사진'));button.append(image);
  const url=urlFor(asset);if(url)image.src=url;
  const problem=element('p','image-group-error','사진을 표시하지 못했습니다. 원본을 내려받아 확인해 주세요.');problem.hidden=!!url;
  image.addEventListener('error',()=>{if(!disposed&&image.isConnected){problem.hidden=false;image.hidden=true;}},{once:true});
  return [button,problem];
 };
 const original=(asset,state)=>{
  const row=element('div','image-group-original');
  const name=element('span','image-group-filename',asset.name||'사진');name.title=asset.name||'사진';row.append(name);
  const url=urlFor(asset);
  if(url){const link=element('a','image-group-download','원본 다운로드');link.href=url;link.download=asset.name||'사진';row.append(link);}
  if(editing&&onDetach){const detach=element('button','quiet small','첨부 해제');detach.type='button';detach.dataset.imageDetach=asset.id;detach.dataset.groupId=state.id;detach.setAttribute('aria-label',(asset.name||'사진')+' 첨부 해제');row.append(detach);}
  return row;
 };
 const render=state=>{
  if(disposed)return;
  const group=state.el;group.replaceChildren();group.dataset.presentation=state.mode;
  if(!state.items.length){group.remove();return;}
  state.index=Math.min(state.index,state.items.length-1);
  const header=element('header','image-group-header'),title=element('h2','','사진 '+state.items.length+'장');header.append(title);
  const mode=element('button','quiet small',state.mode==='slides'?'펼쳐 보기':'슬라이드로 보기');mode.type='button';mode.dataset.imageGroupMode=state.mode==='slides'?'expanded':'slides';mode.dataset.groupId=state.id;mode.disabled=state.pending;header.append(mode);group.append(header);
  if(state.mode==='slides'){
   const asset=state.items[state.index];header.append(original(asset,state));
   const frame=element('div','image-group-slide');frame.tabIndex=0;frame.setAttribute('role','group');frame.setAttribute('aria-label','사진 슬라이드. 좌우 방향키로 이동합니다.');frame.append(...picture(asset));group.append(frame);
   const controls=element('div','image-group-navigation');
   const previous=element('button','quiet','이전'),next=element('button','quiet','다음'),count=element('span','image-group-count');
   previous.type=next.type='button';previous.dataset.imageStep='-1';next.dataset.imageStep='1';previous.disabled=state.index===0;next.disabled=state.index===state.items.length-1;
   count.setAttribute('aria-live','polite');count.setAttribute('aria-atomic','true');controls.append(previous,count,next);group.append(controls);
   queueMicrotask(()=>{if(!disposed&&count.isConnected)count.textContent=(state.index+1)+' / '+state.items.length;});
  }else{
   const expanded=element('div','image-group-expanded');
   for(const asset of state.items){const figure=element('figure');figure.append(...picture(asset,'',true));const caption=element('figcaption');caption.append(original(asset,state));figure.append(caption);expanded.append(figure);}
   group.append(expanded);
  }
 };
 for(const group of imageGroupsOf(note)){
  const items=group.assetIds.map(id=>assetMap.get(id)).filter(asset=>asset&&isImageAsset(asset));if(!items.length)continue;
  const state={id:group.id,items,mode:group.mode==='slides'?'slides':'expanded',index:0,pending:false,el:element('section','image-group')};
  state.el.dataset.groupId=state.id;state.el.setAttribute('aria-label','사진 묶음');states.push(state);render(state);root.append(state.el);
 }
 const stateFor=target=>{const group=target.closest('.image-group');return states.find(state=>state.el===group);};
 const step=(state,index,focus)=>{
  const next=Math.max(0,Math.min(state.items.length-1,index));if(next===state.index)return;
  state.index=next;render(state);
  if(focus==='frame')state.el.querySelector('.image-group-slide')?.focus({preventScroll:true});
  else if(focus){const button=state.el.querySelector('[data-image-step="'+focus+'"]');(button&&!button.disabled?button:state.el.querySelector('.image-group-slide'))?.focus({preventScroll:true});}
 };
 const report=(state,message)=>{let status=state.el.querySelector('.image-group-action-error');if(!status){status=element('p','image-group-action-error');status.setAttribute('role','status');state.el.append(status);}status.textContent=message;};
 const clicked=async event=>{
  const target=event.target.closest('button');if(!target)return;
  const state=stateFor(target);if(!state||state.pending||disposed)return;
  if(target.dataset.imagePreviewAsset){showImagePreview(assetMap.get(target.dataset.imagePreviewAsset));return;}
  if(target.dataset.imageStep){step(state,state.index+Number(target.dataset.imageStep),target.dataset.imageStep);return;}
  const mode=target.dataset.imageGroupMode,detach=target.dataset.imageDetach;if(!mode&&!detach)return;
  state.pending=true;target.disabled=true;
  try{
   if(mode){await onModeChange?.(state.id,mode);if(disposed||!root.isConnected)return;state.mode=mode;}
   else{await onDetach?.(detach);if(disposed||!root.isConnected)return;state.items=state.items.filter(asset=>asset.id!==detach);}
   state.pending=false;render(state);
  }catch{if(disposed||!root.isConnected)return;state.pending=false;target.disabled=false;report(state,'변경을 저장하지 못했습니다. 다시 시도해 주세요.');}
 };
 const keydown=event=>{
  const state=stateFor(event.target);if(!state||state.mode!=='slides'||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.target.matches('input,textarea,select,[contenteditable="true"]'))return;
  const index={ArrowLeft:state.index-1,ArrowRight:state.index+1,Home:0,End:state.items.length-1}[event.key];if(index===undefined)return;
  event.preventDefault();event.stopPropagation();step(state,index,'frame');
 };
 const dispose=()=>{
  if(disposed)return;disposed=true;observer.disconnect();root.removeEventListener('click',clicked);root.removeEventListener('keydown',keydown);
  root.remove();for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();if(mountedGroups.get(host)===dispose)mountedGroups.delete(host);
 };
 const observer=new MutationObserver(()=>{if(!root.isConnected)dispose();});
 root.addEventListener('click',clicked);root.addEventListener('keydown',keydown);host.append(root);mountedGroups.set(host,dispose);
 if(root.isConnected)observer.observe(document.body,{childList:true,subtree:true});
 return dispose;
}
