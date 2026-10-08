import {esc} from './core.js';
import {pagesOf,documentPageFile} from './document-pages-model.js';
export {documentPageFile};
export function pageConvertButton(asset){
 return documentPageFile(asset)?'<button type="button" class="quiet small" data-action="page-convert" data-asset="'+esc(asset.id)+'">페이지 이미지 만들기</button>':'';
}
export function documentPagesHTML(note,assets,assetURL,editing=false){
 const pages=pagesOf(note),live=pages.filter(p=>!p.deleted),deleted=pages.filter(p=>p.deleted);
 if(!pages.length)return '';
 const controls=!note.deleted;
 return '<section class="document-pages" aria-label="페이지 이미지와 메모"><header><h2>페이지별 기록</h2><span>'+live.length+'페이지</span></header>'+live.map(page=>{
  const asset=assets.find(a=>a.id===page.assetId),source=assets.find(a=>a.id===page.sourceAssetId),url=asset?assetURL(asset):'';
  const title=(source?.name||'문서')+' · '+page.number+'페이지';
  return '<section class="document-page-card" data-document-page="'+esc(page.id)+'"><header><h3>'+esc(title)+'</h3>'+(controls?'<button type="button" class="quiet small" data-action="page-delete" data-page-id="'+esc(page.id)+'" aria-label="'+page.number+'페이지 삭제">페이지 삭제</button>':'')+'</header>'+(url?'<a class="page-image-download" href="'+url+'" download="'+esc(asset.name)+'" title="페이지 이미지 저장"><img src="'+url+'" alt="'+esc(title)+'" loading="lazy"></a>':'<p class="error">페이지 이미지를 찾지 못했습니다.</p>')+(editing?'<label class="page-comment-label">내 의견<textarea data-page-comment="'+esc(page.id)+'" aria-label="'+page.number+'페이지 의견" maxlength="100000" placeholder="이 페이지에 대한 생각이나 필기를 적으세요.">'+esc(page.comment)+'</textarea></label>':'<div class="page-comment"><strong>내 의견</strong><p>'+esc(page.comment||'아직 적은 의견이 없습니다.')+'</p>'+(controls?'<button type="button" class="quiet small" data-action="page-edit" data-page-id="'+esc(page.id)+'">의견 적기</button>':'')+'</div>')+'</section>';
 }).join('')+(deleted.length&&controls?'<details class="deleted-pages"><summary>삭제한 페이지 '+deleted.length+'개</summary>'+deleted.map(page=>'<div><span>'+esc(assets.find(a=>a.id===page.sourceAssetId)?.name||'문서')+' · '+page.number+'페이지</span><button type="button" class="quiet small" data-action="page-restore" data-page-id="'+esc(page.id)+'">복원</button></div>').join('')+'</details>':'')+'</section>';
}
let active=false;
// Originals are saved first. Each completed page commits atomically and can be retried.
export async function convertDocumentPages(jobs,api){
 if(active){api.toast('페이지 이미지 변환이 진행 중입니다. 완료한 뒤 다시 시도해 주세요.');return;}
 if(!jobs.length)return;
 active=true;
 const dialog=document.createElement('dialog');dialog.className='page-conversion-dialog';
 dialog.setAttribute('aria-labelledby','page-conversion-title');
 dialog.innerHTML='<header><h2 id="page-conversion-title">페이지 이미지 만들기</h2></header><div class="dialog-body"><p>페이지마다 이미지와 의견을 적을 공간을 만듭니다.</p><div class="page-conversion-jobs"></div></div><footer><button type="button" data-page-conversion="stop">중지</button><button type="button" class="primary" data-page-conversion="close" disabled>기록 보기</button></footer>';
 const rows=jobs.map(job=>{const row=document.createElement('section'),title=document.createElement('strong'),status=document.createElement('p');title.textContent=job.asset.name;status.setAttribute('role','status');status.textContent='대기';row.append(title,status);dialog.querySelector('.page-conversion-jobs').append(row);return {job,status};});
 const controller=new AbortController();let busy=true;
 const warn=e=>{if(busy){e.preventDefault();e.returnValue='';}};
 const guard=e=>{if((e.ctrlKey||e.metaKey)&&['s','k'].includes(e.key.toLowerCase())){e.preventDefault();e.stopImmediatePropagation();}};
 const close=()=>{if(busy){controller.abort();return;}dialog.close();dialog.remove();document.removeEventListener('keydown',guard,true);};
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 dialog.querySelector('[data-page-conversion="stop"]').onclick=()=>{controller.abort();};
 dialog.querySelector('[data-page-conversion="close"]').onclick=close;
 document.body.append(dialog);dialog.showModal();window.addEventListener('beforeunload',warn);document.addEventListener('keydown',guard,true);
 try{
  const {renderDocumentPages}=await import('./document-page-renderer.js');
  for(const {job,status} of rows){
   if(controller.signal.aborted){status.textContent='중지했습니다. 원본과 저장한 페이지는 남아 있습니다.';continue;}
   try{
    let saved=0;
    const result=await renderDocumentPages(job.asset,{signal:controller.signal,onProgress:p=>{status.textContent=typeof p==='string'?p:(p.number||0)+' / '+(p.count||'?')+'페이지 변환 중';},onPage:async page=>{await api.savePage(job,page);saved++;status.textContent=saved+'페이지 저장 중';}});
    status.textContent=(result.count||saved)+'페이지 확인 완료 · 이미지와 메모를 기록에서 볼 수 있습니다.';
   }catch(error){status.textContent=(error.name==='AbortError'?'중지했습니다.':error.message)+' 원본과 이미 저장한 페이지는 남아 있습니다. 원본 옆의 “페이지 이미지 만들기”로 이어서 처리할 수 있습니다.';}
  }
 }catch(error){rows[0].status.textContent='변환기를 불러오지 못했습니다. 새로고침한 뒤 다시 시도해 주세요. '+error.message;}
 finally{
  dialog.querySelector('[data-page-conversion="stop"]').hidden=true;
  try{await api.finish();}catch(error){api.toast(error.message);}
  busy=false;active=false;window.removeEventListener('beforeunload',warn);
  dialog.querySelector('[data-page-conversion="close"]').disabled=false;
 }
}
