import {exportBlockMarkdown} from './block-export.js';
import {databaseMarkdown} from './database-model.js';
import {marked} from './vendor/marked.js';
import DOMPurify from './vendor/purify.js';
import {zipSync,strToU8} from './vendor/fflate.js';
import {esc,safeName} from './core.js';
import {pagesOf,pageAssetIds,pageImageAssetId} from './document-pages-model.js';
import {getPublisherStatus,configurePublisher,publishReadingBundle,listReadingShares,deleteReadingShare,createPublisherConnection,CONNECT_ORIGINS} from './reading-publish.js';
import {scanNotes,scanText,maskText,hitKey} from './privacy-scan.js';
import {AIDX_AREAS,AIDX_KINDS,aidxLinked,aidxPin,saveToAidx,postKey,getPost,aidxStatus,describeStatus} from './aidx-link.js';
const ALLOW_KEY='pkos-privacy-allow-names',DEFAULT_TITLE='나의지식서재 · 함께 읽기';
const isPicture=a=>/^image\//.test(a?.type||'')||/\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(a?.name||'');
function allowNames(){try{const v=JSON.parse(localStorage.getItem(ALLOW_KEY)||'[]');return Array.isArray(v)?v:[];}catch{return [];}}
function addAllowName(name){try{localStorage.setItem(ALLOW_KEY,JSON.stringify([...new Set([...allowNames(),name.replace(/\s+/g,'')])]));}catch{}}
const plain=md=>String(md||'').replace(/```[\s\S]*?```/g,' ').replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g,(_,a,b)=>b||a).replace(/<[^>]+>/g,' ').replace(/(^|\s)\*\*(\S(?:[^*]*?\S)?)\*\*(?=\s|$|[.,!?])/g,'$1$2').replace(/^\s*(?:#{1,6}\s|>\s?|[-+*]\s)/gm,'').replace(/[_`~|]/g,'').replace(/\s+/g,' ').trim();
export async function buildReadingBundle(notes,assets,{attachmentIds=[],metadata=false,title='나의지식서재 · 함께 읽기'}={}){
 if(!notes.length||notes.length>50)throw Error('기록은 1개부터 50개까지 고르세요.');
 if(notes.reduce((n,r)=>n+r.body.length,0)>2000000)throw Error('한 묶음의 본문은 200만 글자까지입니다.');
 const selected=new Map(notes.map((n,i)=>[n.id,'record-'+(i+1)])),byTitle=new Map(notes.map(n=>[n.title.trim().toLowerCase(),n])),allowed=new Set(notes.flatMap(n=>n.attachments));
 const chosen=assets.filter(a=>allowed.has(a.id)&&attachmentIds.includes(a.id)),files={},paths=new Map();let bytes=0;
 for(const [i,a] of chosen.entries()){bytes+=a.blob.size;if(bytes>50*1024*1024)throw Error('첨부는 한 묶음에 50MB까지 넣을 수 있습니다.');const path='attachments/'+(i+1)+'-'+safeName(a.name);paths.set(a.id,path);files[path]=new Uint8Array(await a.blob.arrayBuffer());}
 function body(note){
  const md=exportBlockMarkdown(note.body+databaseMarkdown(note.database,{notes,noteId:note.id}),{notes,assets:chosen,trail:[note.id]}).replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g,(_,name,label)=>{const target=byTitle.get(name.trim().toLowerCase());return target?'['+(label||name)+'](#'+selected.get(target.id)+')':esc(label||name)+' (연결 기록 미포함)';});
  const container=document.createElement('template'),root=container.content;
  container.innerHTML=DOMPurify.sanitize(marked.parse(md,{breaks:true}),{FORBID_TAGS:['style','iframe','object','embed','form','button','select','textarea','audio','video','source','svg','math'],FORBID_ATTR:['style'],ALLOW_DATA_ATTR:false});
  root.querySelectorAll('img').forEach(img=>img.replaceWith(document.createTextNode(img.alt?'[이미지: '+img.alt+' · 본문 이미지 미포함]':'[본문 이미지 미포함]')));
  root.querySelectorAll('input').forEach(el=>{if(el.type==='checkbox'){el.disabled=true;el.removeAttribute('id');el.removeAttribute('name');}else el.remove();});
  root.querySelectorAll('a').forEach(a=>{
   let href=a.getAttribute('href')||'';
   if(href.startsWith('#note=')){let id;try{id=decodeURIComponent(href.slice(6));}catch{}if(selected.has(id)){a.setAttribute('href','#'+selected.get(id));return;}a.replaceWith(document.createTextNode(a.textContent+' (연결 기록 미포함)'));return;}
   if(/^#record-\d+$/.test(href)&&[...selected.values()].includes(href.slice(1)))return;
   if(!/^(https?:|mailto:)/i.test(href)){a.replaceWith(document.createTextNode(a.textContent));return;}
   a.target='_blank';a.rel='noopener noreferrer';
  });
  root.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
  const pages=pagesOf(note).filter(p=>!p.deleted).map(page=>{
   const path=paths.get(pageImageAssetId(page))||paths.get(page.assetId),source=assets.find(a=>a.id===page.sourceAssetId),url=path?.split('/').map(encodeURIComponent).join('/');
   return '<section><h2>'+esc(source?.name||'문서')+' · '+page.number+'페이지</h2>'+(url?'<img src="'+url+'" alt="'+page.number+'페이지" loading="lazy">':'<p>페이지 이미지 미포함</p>')+(page.comment?'<h3>내 의견</h3><p style="white-space:pre-wrap">'+esc(page.comment)+'</p>':'')+'</section>';
  }).join('');
  return container.innerHTML+pages;
 }
 const articles=notes.map(n=>{
  const pageIds=pageAssetIds(n);
  const attachments=chosen.filter(a=>n.attachments.includes(a.id)&&!pageIds.has(a.id)).map(a=>{const path=paths.get(a.id),url=path.split('/').map(encodeURIComponent).join('/');const preview=/\.(png|jpe?g|gif|webp)$/i.test(a.name)?'<img loading="lazy" src="'+url+'" alt="'+esc(a.name)+'">':/\.(mp3|wav|ogg|m4a)$/i.test(a.name)?'<audio controls preload="none" src="'+url+'"></audio>':/\.(mp4|webm)$/i.test(a.name)?'<video controls preload="none" src="'+url+'"></video>':'';return '<figure>'+preview+'<figcaption><a href="'+url+'" download="'+esc(a.name)+'">'+esc(a.name)+' 다운로드</a></figcaption></figure>';}).join('');
  const related=n.links.filter(id=>selected.has(id)).map(id=>{const target=notes.find(n=>n.id===id);return '<a href="#'+selected.get(id)+'">'+esc(target.title||'제목 없음')+'</a>';});
  return '<article id="'+selected.get(n.id)+'"><h1>'+esc(n.title||'제목 없음')+'</h1>'+(metadata?'<p class="meta">'+esc(n.folder)+(n.tags.length?' · '+n.tags.map(t=>'#'+esc(t)).join(' '):'')+'</p>':'')+'<div class="body">'+body(n)+'</div>'+(attachments?'<section class="attachments"><h2>함께 담은 첨부</h2>'+attachments+'</section>':'')+(related.length?'<aside><h2>함께 읽는 기록</h2>'+related.join(' · ')+'</aside>':'')+'<a class="top" href="#contents">목차로</a></article>';
 }).join('');
 const css=':root{font-family:system-ui,"Malgun Gothic",sans-serif;color:#26382f;background:#f7f7f2;line-height:1.8}*{box-sizing:border-box}body{margin:0}header,main{width:min(880px,100%);margin:auto;padding:32px 24px}header{border-bottom:1px solid #dce1d8}header p,.meta,.top{color:#657468;font-size:14px}h1,h2{line-height:1.4;word-break:keep-all;overflow-wrap:anywhere}h1{font-size:30px}h2{font-size:21px}a{color:#37664d;overflow-wrap:anywhere}nav ol{padding-left:24px}article{padding:32px 0 48px;border-bottom:1px solid #dce1d8;overflow-wrap:anywhere}.body{font-size:17px}.body table{display:block;overflow:auto;border-collapse:collapse;max-width:100%}th,td{padding:8px 12px;border:1px solid #cad3c6}pre{overflow:auto;padding:16px;background:#eaf0e7;border-radius:8px}code{font-size:.92em}blockquote{margin-left:0;padding-left:18px;border-left:3px solid #90aa8f;color:#4b624f}img,video{max-width:100%;height:auto;border-radius:8px}audio{width:100%}figure{margin:18px 0}figcaption{font-size:14px}aside,.attachments{margin-top:30px}.top{display:block;margin-top:24px}@media(max-width:500px){header,main{padding:20px 18px}h1{font-size:25px}}@media print{header nav,.top{display:none}body{background:white}article{break-before:page}a{color:inherit}pre{white-space:pre-wrap}}';
 const html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src \'self\' blob: data:; media-src \'self\' blob: data:; base-uri \'none\'; form-action \'none\'"><meta name="referrer" content="no-referrer"><title>'+esc(title)+'</title><style>'+css+'</style></head><body><header id="contents"><p>PKOS · 나의지식서재</p><h1>'+esc(title)+'</h1><p>선택한 '+notes.length+'개 기록 · '+chosen.length+'개 첨부</p><nav aria-label="기록 목차"><ol>'+notes.map(n=>'<li><a href="#'+selected.get(n.id)+'">'+esc(n.title||'제목 없음')+'</a></li>').join('')+'</ol></nav></header><main>'+articles+'</main></body></html>';
 files['index.html']=strToU8(html);files['읽어주세요.txt']=strToU8('압축을 풀고 index.html을 여세요. attachments 폴더가 있으면 함께 보관하세요.\n이 묶음은 선택한 글과 첨부를 읽는 용도입니다. 앱 전체 백업이나 접근 제한 기능은 아닙니다.\n인터넷에 자동 게시하지 않았습니다.\n');
 return {html,files};
}
// focus: 'aidx' 이면 바로 미리보기·검사를 하고 ai-dx 칸을 보여 준다(기록 메뉴 「ai-dx 지도에 올리기」)
export function showReadingExport({notes,assets,currentId,download,toast,focus=''}){
 notes=notes.filter(n=>!n.deleted).sort((a,b)=>b.updated.localeCompare(a.updated));
 const selected=new Set(currentId&&notes.some(n=>n.id===currentId)?[currentId]:[]),included=new Set();
 let bundle=null,urls=[],busy='',closed=false,configured=false,shares=[],sharesLoaded=false,targetId='',lastPublished=null;
 // 개인정보 검사: copies 는 이번 게시본에만 쓰는 가린 사본(기록장 원문은 그대로), kept 는 이대로 두기로 한 항목
 let copies=new Map(),report=null,scanned=new Map(),groups=new Map(),kept=new Set(),maskedCount=0,photosOk=false,sentBundle=null,maskedKeys=new Set(),applied=new Set();
 const linked=aidxLinked(),touched=new Set(),META='__share-meta';
 const d=document.createElement('dialog');d.className='reading-export-dialog';d.setAttribute('aria-labelledby','reading-export-title');
 d.innerHTML='<header><h2 id="reading-export-title">웹으로 공유하기</h2><button type="button" data-reading="close">닫기 ×</button></header>'+
  '<p class="reading-audience">링크를 아는 사람은 누구나 읽을 수 있습니다. 선택한 내용만 게시됩니다.</p>'+
  '<label>공유 제목<input data-reading-title value="나의지식서재 · 함께 읽기" maxlength="200"></label>'+
  '<label>기록 찾기<input type="search" data-reading-search placeholder="제목으로 찾기"></label><div data-reading-notes></div><p data-reading-count role="status"></p>'+
  '<details><summary>포함할 첨부 선택 · 기본은 글만</summary><div data-reading-assets></div></details>'+
  '<label class="reading-check"><input type="checkbox" data-reading-meta> 노트북 이름과 태그도 포함</label>'+
  '<p class="hint">저장된 글을 사용합니다. 고르지 않은 기록·원본 위치·휴지통·앱의 저장 정보는 포함하지 않습니다. 본문에 직접 적은 내용과 링크는 포함됩니다. 최대 50개 기록·첨부 50MB까지입니다.</p>'+
  '<div class="reading-actions"><button type="button" data-reading="preview">포함 내용 미리보기</button></div>'+
  '<p data-reading-status role="status" aria-live="polite"></p><iframe title="공유할 웹문서 미리보기" sandbox="allow-same-origin" hidden></iframe>'+
  '<section class="reading-privacy" data-reading-privacy hidden aria-labelledby="reading-privacy-heading"><h3 id="reading-privacy-heading">개인정보 검사</h3>'+
  '<p data-privacy-summary role="status" aria-live="polite"></p><div data-privacy-list></div>'+
  '<label class="reading-check" data-privacy-photo hidden><input type="checkbox" data-privacy-photo-ok><span data-privacy-photo-text></span></label>'+
  '<div class="reading-actions" data-privacy-actions hidden><button type="button" class="primary" data-reading="privacy-apply">고른 곳 가리고 다시 미리보기</button></div>'+
  '<details data-privacy-kept hidden><summary></summary><div data-privacy-kept-list></div></details>'+
  '<p class="hint">체크한 곳은 가리고, 체크를 푼 곳은 이대로 둡니다. 가린 내용은 이번 게시본에만 들어가고 기록장 원문은 바뀌지 않아요. 성을 빼고 부른 이름(민준이)과 사진 속 얼굴은 찾지 못하니 미리보기에서 한 번 더 봐 주세요.</p></section>'+
  '<nav class="reading-dest" data-reading-dest hidden aria-label="올릴 곳 고르기"><p>어디에 올릴까요?</p><div class="reading-actions">'+
  '<button type="button" data-reading="goto" data-goto="reading-publish-heading">웹 공유 주소</button>'+(linked?'<button type="button" data-reading="goto" data-goto="reading-aidx-heading">ai-dx 지도</button>':'')+'<button type="button" data-reading="goto" data-goto="reading-zip-heading">ZIP 파일</button></div></nav>'+
  '<section class="reading-publish-panel" aria-labelledby="reading-publish-heading"><h3 id="reading-publish-heading">웹에 게시</h3>'+
  '<p data-reading-publish-help>포함 내용 미리보기로 확인한 뒤 게시할 수 있습니다.</p>'+
  '<details class="reading-publish-setup" data-reading-setup><summary>게시 설정 <span data-reading-configured></span></summary>'+
  '<label>게시 키<input type="password" data-reading-key autocomplete="off" spellcheck="false" placeholder="게시 키를 입력하세요"></label>'+
  '<button type="button" data-reading="configure">설정 저장</button>'+
  '<div class="reading-connect" data-reading-connect hidden><h4>다른 기기에서도 게시하기</h4><p class="hint">게시 키를 옮겨 적지 않고, 연결 주소를 다른 기기나 다른 기록장 주소에서 열면 그 브라우저도 게시할 수 있어요. 주소는 한 시간 안에 한 번만 쓸 수 있고, 받은 사람도 게시할 수 있게 되니 본인 기기에서만 여세요.</p>'+
  '<label>열 기록장 주소<select data-reading-connect-origin>'+CONNECT_ORIGINS.map(([o,name])=>'<option value="'+o+'">'+esc(name)+'</option>').join('')+'</select></label>'+
  '<div class="reading-actions"><button type="button" data-reading="make-connection">연결 주소 만들기</button></div>'+
  '<div data-reading-connect-result hidden><label>연결 주소<input data-reading-connect-url readonly aria-label="게시 연결 주소"></label><div class="reading-actions"><button type="button" data-reading="copy-connection">연결 주소 복사</button></div><p class="hint" data-reading-connect-expiry></p></div></div></details>'+
  '<div class="reading-publish-target"><p data-reading-target-label>새 주소로 게시합니다.</p><button type="button" data-reading="new-share" hidden>새 주소로 게시</button></div>'+
  '<div class="reading-actions"><button type="button" class="primary" data-reading="publish" disabled>웹에 게시하기</button></div>'+
  '<div class="reading-publish-result" data-reading-result hidden><label>게시된 주소<input data-reading-url readonly aria-label="게시된 문서 주소"></label>'+
  '<div class="reading-actions"><button type="button" data-reading="copy-url">주소 복사</button><a class="quiet" data-reading-open target="_blank" rel="noopener noreferrer">열기 ↗</a></div></div>'+
  '<details class="reading-share-manager" data-reading-manager><summary>내가 게시한 문서</summary><div class="reading-actions"><button type="button" data-reading="refresh-shares">목록 새로 고침</button></div>'+
  '<p data-reading-shares-status role="status"></p><div data-reading-shares></div></details></section>'+
  (linked?'<section class="reading-aidx-panel" aria-labelledby="reading-aidx-heading"><h3 id="reading-aidx-heading">ai-dx 지도에 올리기</h3>'+
  '<p>임시저장한 글은 공개되지 않아요. ai-dx 화면 「기록장」에서 확인하고 승인해야 지도에 올라가요. 같은 기록을 고쳐 다시 임시저장하면 같은 글의 다음 판이 돼요. 글만 보내고 첨부와 사진은 보내지 않아요.</p>'+
  '<div class="reading-aidx-state" data-aidx-state hidden><p data-aidx-state-text></p><blockquote data-aidx-note hidden></blockquote></div>'+
  '<label>올릴 칸<select data-aidx-area><option value="">칸을 고르세요</option>'+AIDX_AREAS.map(([zone,list])=>'<optgroup label="'+esc(zone)+'">'+list.map(([id,name])=>'<option value="'+id+'">'+esc(name)+'</option>').join('')+'</optgroup>').join('')+'</select></label>'+
  '<label>종류<select data-aidx-kind>'+AIDX_KINDS.map(([id,name])=>'<option value="'+id+'">'+esc(name)+'</option>').join('')+'</select></label>'+
  '<label>카드 제목<input data-aidx-title maxlength="120"></label>'+
  '<label>카드 소개 (한두 문장)<textarea data-aidx-desc rows="3" maxlength="300"></textarea></label>'+
  '<label data-aidx-pin-row>ai-dx 강사 비밀번호<input type="password" data-aidx-pin autocomplete="current-password"></label>'+
  '<div class="reading-actions"><button type="button" class="primary" data-reading="aidx-send" disabled>ai-dx에 임시저장</button><a class="quiet" data-aidx-review target="_blank" rel="noopener" hidden>ai-dx에서 확인하기 ↗</a></div></section>':'')+
  '<section class="reading-zip-panel" aria-labelledby="reading-zip-heading"><h3 id="reading-zip-heading">파일로 내보내기</h3><p>인터넷 없이 열거나 보관할 수 있는 ZIP 파일입니다.</p>'+
  '<button type="button" data-reading="download" disabled>웹문서 ZIP 저장</button></section>';
 document.body.append(d);d.showModal();
 const find=selector=>d.querySelector(selector);
 const status=(message,error=false)=>{const el=find('[data-reading-status]');el.textContent=message;el.classList.toggle('error',error);};
 const shareStatus=(message,error=false)=>{const el=find('[data-reading-shares-status]');el.textContent=message;el.classList.toggle('error',error);};
 const shareUrl=value=>{try{const url=new URL(value);return /^https?:$/.test(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}};
 const title=()=>find('[data-reading-title]').value.trim()||'함께 읽기';
 function syncControls(){
  if(closed)return;
  d.querySelectorAll('input,select,button').forEach(el=>el.disabled=!!busy&&el.dataset.reading!=='close');
  find('[data-reading=preview]').disabled=!!busy||!selected.size||selected.size>50;
  find('[data-reading=preview]').textContent=busy==='preview'?'미리보기 만드는 중…':'포함 내용 미리보기';
  find('[data-reading=download]').disabled=!!busy||!bundle;
  const ok=privacyReady();
  find('[data-reading=publish]').disabled=!!busy||!bundle||!configured||!ok;
  find('[data-reading=publish]').textContent=busy==='publish'?'게시하는 중…':targetId?'선택한 주소 갱신':'웹에 게시하기';
  if(linked){
   find('[data-reading=aidx-send]').disabled=!!busy||!bundle||!ok||bundle===sentBundle||!find('[data-aidx-area]').value||!find('[data-aidx-title]').value.trim()||!(aidxPin()||find('[data-aidx-pin]').value);
   find('[data-reading=aidx-send]').textContent=busy==='aidx'?'임시저장하는 중…':bundle&&bundle===sentBundle?'임시저장했어요':getPost(selKey())?'고친 판 임시저장':'ai-dx에 임시저장';
   find('[data-aidx-pin-row]').hidden=!!aidxPin();
  }
  find('[data-reading=configure]').disabled=!!busy||!find('[data-reading-key]').value.trim();
  find('[data-reading=refresh-shares]').disabled=!!busy||!configured;
  find('[data-reading-configured]').textContent=configured?'· 연결됨':'· 연결 필요';
  find('[data-reading-connect]').hidden=!configured;find('[data-reading=make-connection]').textContent=busy==='connection'?'만드는 중…':'연결 주소 만들기';
  find('[data-reading-publish-help]').textContent=!bundle?'포함 내용 미리보기로 확인한 뒤 게시할 수 있습니다.':!ok?'개인정보 검사에서 남은 항목을 정리하면 게시할 수 있습니다.':!configured?'게시 설정에 키를 연결하면 웹에 게시할 수 있습니다.':'미리보기의 내용을 확인했다면 아래 버튼으로 게시하세요.';
  const target=shares.find(share=>share.id===targetId)||lastPublished;
  find('[data-reading-target-label]').textContent=targetId?'「'+(target?.title||'선택한 문서')+'」의 같은 주소를 갱신합니다.':'새 주소로 게시합니다.';
  find('[data-reading=new-share]').hidden=!targetId;
  find('[data-reading=copy-url]').disabled=!!busy||!lastPublished;
  find('[data-reading-manager]').setAttribute('aria-busy',String(busy==='list'));
  d.setAttribute('aria-busy',String(!!busy));
 }
 function revokePreview(){urls.forEach(URL.revokeObjectURL);urls=[];}
 function reset(){
  bundle=null;report=null;photosOk=false;revokePreview();const frame=find('iframe');frame.hidden=true;frame.removeAttribute('srcdoc');status('');
  find('[data-reading-privacy]').hidden=true;find('[data-reading-dest]').hidden=true;find('[data-privacy-photo-ok]').checked=false;syncControls();
 }
 // 게시본에 들어갈 기록: 가린 사본이 있으면 그것을 쓴다
 const selKey=()=>postKey(selected);
 const chosenNotes=()=>notes.filter(n=>selected.has(n.id)).map(n=>copies.has(n.id)?{...n,...copies.get(n.id)}:n);
 const pictures=()=>assets.filter(a=>included.has(a.id)&&isPicture(a)).length;
 const pending=()=>[...groups.values()].filter(g=>!kept.has(g.key));
 function privacyReady(){return !!bundle&&!!report&&!pending().length&&(!pictures()||photosOk);}
 function scan(chosen,metadata){
  scanned=new Map(chosen.map(n=>[n.id,{title:n.title||'',body:n.body||'',extra:databaseMarkdown(n.database,{notes:chosen,noteId:n.id}),...(metadata?{folder:n.folder||'',tags:(n.tags||[]).join(' ')}:{})}]));
  // 공유 제목과 ai-dx 카드 제목·소개도 밖으로 나가므로 함께 검사한다(META)
  scanned.set(META,{share:title(),...(linked?{cardTitle:find('[data-aidx-title]').value,cardDesc:find('[data-aidx-desc]').value}:{})});
  report=scanNotes([...chosen.map(n=>({id:n.id,title:n.title||'제목 없음',fields:scanned.get(n.id)})),{id:META,title:linked?'공유 제목·카드 소개':'공유 제목',fields:scanned.get(META)}],{allowNames:allowNames()});
  groups=new Map();
  for(const r of report)for(const [field,hits] of Object.entries(r.fields))for(const h of hits){
   const key=hitKey(h),g=groups.get(key)||{key,kind:h.kind,original:h.original,masked:h.masked,context:h.context,count:0,records:new Set(),maskable:false};
   g.count++;g.records.add(r.title);if(field!=='extra')g.maskable=true;groups.set(key,g);
  }
 }
 function paintPrivacy(){
  const rows=pending(),done=[...groups.values()].filter(g=>kept.has(g.key)),n=pictures();
  find('[data-reading-privacy]').hidden=false;find('[data-reading-dest]').hidden=false;
  find('[data-privacy-summary]').textContent=!groups.size?'개인정보로 보이는 내용을 찾지 못했어요.':!rows.length?'찾은 '+groups.size+'가지는 모두 이대로 두기로 했어요.':'개인정보로 보이는 내용 '+rows.length+'가지를 찾았어요. 가릴 곳을 고른 뒤 아래 단추를 눌러 주세요.';
  const where=g=>g.count+'곳 · '+[...g.records].slice(0,2).map(t=>'「'+esc(t)+'」').join(', ')+(g.records.size>2?' 외 '+(g.records.size-2)+'개':'');
  find('[data-privacy-list]').innerHTML=rows.map(g=>'<div class="privacy-row"><label class="reading-check"><input type="checkbox" data-privacy-key="'+esc(g.key)+'" '+(g.maskable?'checked':'disabled')+'><span><b>'+esc(g.kind)+'</b> '+esc(g.original)+' → '+esc(g.masked)+' <small>'+where(g)+'</small><small class="privacy-context">'+esc(g.context)+'</small>'+(g.maskable?'':'<small class="error">표 안 내용이라 여기서 가릴 수 없어요. 기록장에서 고치거나, 체크를 푼 채로 두면 이대로 올라가요.</small>')+'</span></label>'+(g.kind==='이름'?'<button type="button" class="quiet" data-reading="privacy-allow" data-privacy-name="'+esc(g.original)+'">공개해도 되는 이름</button>':'')+'</div>').join('');
  find('[data-privacy-actions]').hidden=!rows.length;
  const keptBox=find('[data-privacy-kept]');keptBox.hidden=!done.length;keptBox.querySelector('summary').textContent='이대로 두기로 한 항목 '+done.length+'가지';
  find('[data-privacy-kept-list]').innerHTML=done.map(g=>'<div class="privacy-row"><span><b>'+esc(g.kind)+'</b> '+esc(g.original)+' <small>'+where(g)+'</small></span><button type="button" class="quiet" data-reading="privacy-unkeep" data-privacy-key="'+esc(g.key)+'">다시 고르기</button></div>').join('');
  find('[data-privacy-photo]').hidden=!n;find('[data-privacy-photo-text]').textContent='사진 '+n+'장이 들어 있어요. 얼굴, 이름표, 명찰이 보이지 않는 것을 확인했어요.';
  syncControls();
 }
 function applyPrivacy(){
  const boxes=[...d.querySelectorAll('[data-privacy-list] [data-privacy-key]')],mask=new Set(boxes.filter(b=>b.checked&&!b.disabled).map(b=>b.dataset.privacyKey));
  boxes.filter(b=>!b.checked).forEach(b=>kept.add(b.dataset.privacyKey));
  maskKeys(mask);
  return preview();
 }
 // 고른 항목을 가린 사본(copies)과 공유 제목·카드 칸에 적용한다
 function maskKeys(mask){
  if(mask.size)for(const r of report){
   const f=scanned.get(r.id),next={};
   if(r.id===META){
    const put=(field,selector)=>{const el=find(selector);if(el&&field in f)el.value=maskText(f[field],r.fields[field]||[],mask);};
    put('share','[data-reading-title]');put('cardTitle','[data-aidx-title]');put('cardDesc','[data-aidx-desc]');continue;
   }
   for(const field of ['title','body','folder','tags'])if(field in f)next[field]=maskText(f[field],r.fields[field]||[],mask);
   if('tags' in next)next.tags=next.tags.split(' ').filter(Boolean);
   copies.set(r.id,{...(copies.get(r.id)||{}),...next});
  }
  maskedCount+=mask.size;mask.forEach(k=>maskedKeys.add(k));
 }
 // 전에 임시저장한 글이면 그때 정한 가림·이대로 두기를 다시 적용한다(새로 나온 항목만 고르면 된다). 다시 만들어야 하면 true
 function applyEarlier(){
  const key=selKey(),post=linked?getPost(key):null;
  if(!post?.decisions||applied.has(key))return false;
  applied.add(key);
  (post.decisions.kept||[]).forEach(k=>{if(groups.has(k))kept.add(k);});
  const auto=new Set((post.decisions.masked||[]).filter(k=>groups.has(k)&&groups.get(k).maskable));
  if(!auto.size)return false;
  maskKeys(auto);status('지난번 임시저장 때 정한 대로 '+auto.size+'가지를 가렸어요.');return true;
 }
 async function refreshAidxState(){
  if(!linked)return;
  const box=find('[data-aidx-state]'),post=getPost(selKey()),key=selKey();
  if(!post){box.hidden=true;return;}
  box.hidden=false;find('[data-aidx-state-text]').textContent='이 기록은 ai-dx에 임시저장한 적이 있어요('+post.rev+'판). 상태를 확인하는 중…';find('[data-aidx-note]').hidden=true;
  try{
   const st=await aidxStatus(post);if(closed||selKey()!==key)return;
   find('[data-aidx-state-text]').textContent=st?describeStatus(st):'상태를 확인하지 못했어요. 인터넷 연결을 확인해 주세요.';
   const note=find('[data-aidx-note]');note.hidden=!(st?.review==='changes'&&st.review_note);note.textContent=st?.review_note?'보완 요청: '+st.review_note:'';
   box.classList.toggle('changes',st?.review==='changes');
  }catch{if(!closed)find('[data-aidx-state-text]').textContent='상태를 확인하지 못했어요. 인터넷 연결을 확인해 주세요.';}
 }
 async function sendAidx(){
  if(!linked||!privacyReady()||bundle===sentBundle)return;
  await work('aidx',async()=>{
   const chosen=chosenNotes(),cardTitle=find('[data-aidx-title]').value.trim(),sent=bundle;
   // 미리보기 뒤에 카드 제목·소개를 고쳤을 수 있으니 보내기 직전에 한 번 더 본다
   const names=[...groups.values()].filter(g=>g.kind==='이름').map(g=>g.original);
   const late=scanText(cardTitle+'\n'+find('[data-aidx-desc]').value,{allowNames:allowNames(),knownNames:names}).hits.filter(h=>!kept.has(hitKey(h)));
   if(late.length)throw Error('카드 제목·소개에 개인정보로 보이는 내용이 있어요('+[...new Set(late.map(h=>h.kind+' '+h.original))].join(', ')+'). 고치거나 「포함 내용 미리보기」로 다시 검사해 주세요.');
   // ai-dx에는 글만 보낸다: 첨부를 빼고 게시본을 다시 만든다(가린 사본 그대로)
   const page=await buildReadingBundle(chosen,assets,{attachmentIds:[],metadata:find('[data-reading-meta]').checked,title:cardTitle});
   const markdown=chosen.map(n=>'# '+(n.title||'제목 없음')+'\n\n'+n.body+databaseMarkdown(n.database,{notes:chosen,noteId:n.id})).join('\n\n---\n\n');
   const privacy={checkedAt:new Date().toISOString(),found:maskedCount+groups.size,masked:maskedCount,kept:[...groups.values()].filter(g=>kept.has(g.key)).map(g=>({kind:g.kind,original:g.original,count:g.count})),pictures:pictures(),picturesChecked:photosOk};
   const earlier=getPost(selKey())?.decisions||{},decisions={masked:[...new Set([...(earlier.masked||[]),...maskedKeys])],kept:[...new Set([...(earlier.kept||[]),...kept])]};
   const result=await saveToAidx(selKey(),{pin:aidxPin()||find('[data-aidx-pin]').value,area:find('[data-aidx-area]').value,kind:find('[data-aidx-kind]').value,title:cardTitle,desc:find('[data-aidx-desc]').value.trim(),html:page.html,markdown,records:chosen.map(n=>({title:n.title||'제목 없음'})),privacy,decisions});
   if(closed)return;
   sentBundle=sent;find('[data-aidx-pin]').value='';
   const link=find('[data-aidx-review]');link.href=result.reviewUrl;link.hidden=false;
   status((result.renewed?'ai-dx에서 지운 글이라 새 글로 ':'')+'임시저장했어요('+result.rev+'판). 아직 공개되지 않았고, ai-dx 화면 「기록장」에서 확인하고 승인하면 지도에 올라가요.');toast?.('ai-dx에 임시저장했어요.');
   void refreshAidxState();
  });
 }
 function paintNotes(){
  const q=find('[data-reading-search]').value.trim().toLowerCase(),matching=notes.filter(n=>n.title.toLowerCase().includes(q));
  find('[data-reading-notes]').innerHTML=matching.slice(0,200).map(n=>'<label class="reading-check"><input type="checkbox" data-reading-note="'+esc(n.id)+'" '+(selected.has(n.id)?'checked':'')+'><span>'+esc(n.title||'제목 없음')+'</span></label>').join('')+(matching.length>200?'<p class="hint">200개까지 표시합니다. 검색으로 범위를 줄이세요.</p>':'');
  syncControls();
 }
 function paintAssets(){
  const allowed=new Set(notes.filter(n=>selected.has(n.id)).flatMap(n=>n.attachments));for(const id of included)if(!allowed.has(id))included.delete(id);
  find('[data-reading-assets]').innerHTML=assets.filter(a=>allowed.has(a.id)).map(a=>'<label class="reading-check"><input type="checkbox" data-reading-asset="'+esc(a.id)+'" '+(included.has(a.id)?'checked':'')+'><span>'+esc(a.name)+' · '+Math.ceil(a.blob.size/1024)+' KB</span></label>').join('')||'<p class="hint">선택한 기록에 첨부가 없습니다.</p>';
  find('[data-reading-count]').textContent=selected.size+'개 기록 선택 · '+included.size+'개 첨부 포함';syncControls();
 }
 function paintShares(){
  find('[data-reading-shares]').innerHTML=shares.map(share=>{
   const url=shareUrl(share.url),updated=new Date(share.updatedAt),date=Number.isNaN(updated.getTime())?'':updated.toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'});
   return '<article class="reading-share-row'+(share.id===targetId?' selected':'')+'"><div><strong>'+esc(share.title||'제목 없는 문서')+'</strong>'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(url)+'</a>':'')+(date?'<small>'+esc(date)+' 수정</small>':'')+'</div><div class="reading-share-actions"><button type="button" data-reading="update-share" data-reading-share-id="'+esc(share.id)+'" aria-pressed="'+(share.id===targetId)+'">이 주소 갱신</button><button type="button" data-reading="delete-share" data-reading-share-id="'+esc(share.id)+'">게시 삭제</button></div></article>';
  }).join('');
  syncControls();
 }
 function showResult(share){
  const url=shareUrl(share.url);if(!url)throw Error('게시된 주소를 확인하지 못했습니다. 문서 목록을 새로 고침하세요.');
  lastPublished={...share,url};find('[data-reading-url]').value=url;find('[data-reading-open]').href=url;find('[data-reading-result]').hidden=false;
 }
 function close(){
  closed=true;revokePreview();d.close();d.remove();document.removeEventListener('keydown',guard,true);
 }
 const guard=e=>{if((e.ctrlKey||e.metaKey)&&['s','k'].includes(e.key.toLowerCase())){e.preventDefault();e.stopImmediatePropagation();}};
 document.addEventListener('keydown',guard,true);d.addEventListener('cancel',e=>{e.preventDefault();close();});
 async function work(kind,task){
  if(busy||closed)return;busy=kind;syncControls();
  try{await task();}catch(error){if(!closed)status(error.message||'작업을 마치지 못했습니다. 다시 시도하세요.',true);}
  finally{busy='';if(!closed)syncControls();}
 }
 async function preview(){
  await work('preview',async()=>{
   status('미리보기를 만들고 있습니다.');
   await build();
   if(!closed&&applyEarlier())await build(true);
  });
  void refreshAidxState();
 }
 async function build(keepStatus=false){
   const nextUrls=[];
   try{
    const chosen=chosenNotes(),metadata=find('[data-reading-meta]').checked;
    const result=await buildReadingBundle(chosen,assets,{attachmentIds:[...included],metadata,title:title()});if(closed)return;
    // 카드 칸·제목·소개: 전에 임시저장한 글이면 그때 값, 아니면 (가린) 기록으로 채운다. 손으로 고친 뒤에는 그대로 두고, 아래 검사에 함께 넣는다
    if(linked){
     const post=getPost(selKey()),cardTitle=find('[data-aidx-title]'),desc=find('[data-aidx-desc]');
     if(post&&!touched.has('area')&&post.area)find('[data-aidx-area]').value=post.area;
     if(post&&!touched.has('kind')&&post.kind)find('[data-aidx-kind]').value=post.kind;
     if(!touched.has('title'))cardTitle.value=post?.title||(title()!==DEFAULT_TITLE?title():chosen[0]?.title||'');
     if(!touched.has('desc')){const text=plain(chosen[0]?.body);desc.value=post?.desc||(text.length>120?text.slice(0,120)+'…':text);}
    }
    scan(chosen,metadata);
    const doc=new DOMParser().parseFromString(result.html,'text/html');
    for(const [path,data] of Object.entries(result.files)){
     if(!path.startsWith('attachments/'))continue;
     const a=assets.find(a=>included.has(a.id)&&path.endsWith('-'+safeName(a.name))),url=URL.createObjectURL(new Blob([data],{type:a?.type||'application/octet-stream'}));nextUrls.push(url);
     const encoded=path.split('/').map(encodeURIComponent).join('/');doc.querySelectorAll('[src],[href]').forEach(el=>{for(const attr of ['src','href'])if(el.getAttribute(attr)===encoded)el.setAttribute(attr,url);});
    }
    revokePreview();urls=nextUrls;bundle=result;const frame=find('iframe');frame.srcdoc='<!doctype html>'+doc.documentElement.outerHTML;frame.hidden=false;
    paintPrivacy();
    if(!keepStatus)status(pending().length?'개인정보 검사에서 찾은 항목을 정리한 뒤 올릴 곳을 고르세요.':'포함된 내용을 확인한 뒤 웹에 게시하거나 ai-dx 지도, ZIP으로 보내세요.');
   }catch(error){nextUrls.forEach(URL.revokeObjectURL);throw error;}
 }
 async function refreshShares(){
  if(!configured){shareStatus('게시 설정을 먼저 연결하세요.');return;}
  await work('list',async()=>{
   shareStatus('게시한 문서를 불러오는 중…');
   try{
    const result=await listReadingShares();if(closed)return;
    shares=result;sharesLoaded=true;paintShares();shareStatus(shares.length?shares.length+'개 문서':'아직 게시한 문서가 없습니다.');
   }catch(error){shareStatus(error.message||'목록을 불러오지 못했습니다.',true);}
  });
 }
 async function configure(){
  const key=find('[data-reading-key]').value.trim();if(!key)return;
  await work('configure',async()=>{
   status('게시 설정을 확인하고 있습니다.');await configurePublisher(key);if(closed)return;
   configured=true;find('[data-reading-key]').value='';find('[data-reading-setup]').open=false;shares=[];sharesLoaded=false;targetId='';lastPublished=null;find('[data-reading-result]').hidden=true;paintShares();
   shareStatus('새로 고침하여 게시한 문서를 확인하세요.');status('게시 설정을 연결했습니다.');
  });
  if(configured&&find('[data-reading-manager]').open)await refreshShares();
 }
 async function makeConnection(){
  if(!configured)return;
  await work('connection',async()=>{
   const result=await createPublisherConnection(find('[data-reading-connect-origin]').value);if(closed)return;
   find('[data-reading-connect-url]').value=result.url;find('[data-reading-connect-result]').hidden=false;
   const until=new Date(result.expiresAt);find('[data-reading-connect-expiry]').textContent=Number.isNaN(until.getTime())?'한 시간 안에 한 번만 쓸 수 있어요.':until.toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'})+'까지, 한 번만 쓸 수 있어요.';
   status('연결 주소를 만들었습니다. 게시할 기기에서 열어 주세요.');
  });
 }
 async function copyConnection(){
  const input=find('[data-reading-connect-url]');if(!input.value)return;
  try{await navigator.clipboard.writeText(input.value);status('연결 주소를 복사했습니다.');}catch{input.focus();input.select();status('주소를 선택했습니다. 복사해 주세요.');}
 }
 async function publish(){
  if(!bundle||!configured)return;
  await work('publish',async()=>{
   status(targetId?'선택한 주소의 내용을 갱신하고 있습니다.':'선택한 내용을 게시하고 있습니다.');
   const result=await publishReadingBundle(bundle,{title:title(),...(targetId?{id:targetId}:{}),onProgress:progress=>{
    if(closed)return;
    if(typeof progress==='string'&&progress)status(progress);
   }});
   if(closed)return;
   showResult(result);targetId=result.id;shares=[result,...shares.filter(share=>share.id!==result.id)];paintShares();
   status('게시했습니다. 아래 주소를 복사해 공유하세요.');toast?.('웹문서가 게시되었습니다.');
  });
 }
 async function removeShare(id){
  const share=shares.find(item=>item.id===id);if(!share||busy)return;
  if(!confirm('「'+(share.title||'제목 없는 문서')+'」의 게시를 삭제할까요? 공유 주소에서 더 이상 읽을 수 없습니다.'))return;
  await work('delete',async()=>{
   status('게시를 삭제하고 있습니다.');await deleteReadingShare(id);if(closed)return;
   shares=shares.filter(item=>item.id!==id);if(targetId===id)targetId='';
   if(lastPublished?.id===id){lastPublished=null;find('[data-reading-result]').hidden=true;find('[data-reading-url]').value='';find('[data-reading-open]').removeAttribute('href');}
   paintShares();shareStatus(shares.length?shares.length+'개 문서':'아직 게시한 문서가 없습니다.');status('게시를 삭제했습니다.');
  });
 }
 async function copyUrl(){
  if(!lastPublished)return;
  try{await navigator.clipboard.writeText(lastPublished.url);if(!closed)status('공유 주소를 복사했습니다.');}
  catch{if(!closed){const input=find('[data-reading-url]');input.focus();input.select();status('주소를 선택했습니다. 복사해 주세요.');}}
 }
 d.addEventListener('input',e=>{
  if(busy)return;if(e.target.matches('[data-reading-search]'))paintNotes();
  if(e.target.matches('[data-reading-title]'))reset();if(e.target.matches('[data-reading-key]'))syncControls();
 });
 d.addEventListener('change',e=>{
  if(busy)return;
  if(e.target.dataset.readingNote){e.target.checked?selected.add(e.target.dataset.readingNote):selected.delete(e.target.dataset.readingNote);reset();paintAssets();}
  if(e.target.dataset.readingAsset){e.target.checked?included.add(e.target.dataset.readingAsset):included.delete(e.target.dataset.readingAsset);reset();paintAssets();}
  if(e.target.matches('[data-reading-meta]'))reset();
  if(e.target.matches('[data-privacy-photo-ok]')){photosOk=e.target.checked;syncControls();}
  if(e.target.matches('[data-aidx-area]'))touched.add('area');if(e.target.matches('[data-aidx-kind]'))touched.add('kind');
  if(e.target.matches('[data-aidx-area],[data-aidx-kind]'))syncControls();
 });
 d.addEventListener('input',e=>{
  if(e.target.matches('[data-aidx-title]'))touched.add('title');if(e.target.matches('[data-aidx-desc]'))touched.add('desc');
  if(e.target.matches('[data-aidx-title],[data-aidx-pin],[data-aidx-desc]'))syncControls();
 });
 find('[data-reading-manager]').addEventListener('toggle',()=>{if(find('[data-reading-manager]').open&&!sharesLoaded&&!busy)void refreshShares();});
 d.addEventListener('click',e=>{
  const button=e.target.closest('[data-reading]'),action=button?.dataset.reading;if(action==='close'){close();return;}if(busy)return;
  if(action==='preview')void preview();
  if(action==='configure')void configure();
  if(action==='make-connection')void makeConnection();
  if(action==='copy-connection')void copyConnection();
  if(action==='publish')void publish();
  if(action==='copy-url')void copyUrl();
  if(action==='refresh-shares')void refreshShares();
  if(action==='new-share'){targetId='';lastPublished=null;find('[data-reading-result]').hidden=true;paintShares();status('새 주소로 게시합니다.');find('[data-reading=publish]').focus();}
  if(action==='update-share'){
   const share=shares.find(item=>item.id===button.dataset.readingShareId);if(!share)return;targetId=share.id;paintShares();status('현재 고른 내용을 미리보기한 뒤 이 주소를 갱신하세요.');find('[data-reading=publish]').focus();
  }
  if(action==='delete-share')void removeShare(button.dataset.readingShareId);
  if(action==='privacy-apply')void applyPrivacy();
  if(action==='privacy-allow'){addAllowName(button.dataset.privacyName);void preview();}
  if(action==='privacy-unkeep'){kept.delete(button.dataset.privacyKey);paintPrivacy();}
  if(action==='goto'){const target=find('#'+button.dataset.goto)?.closest('section');target?.scrollIntoView({behavior:'smooth',block:'start'});target?.querySelector('select,button:not([disabled]),input')?.focus({preventScroll:true});}
  if(action==='aidx-send')void sendAidx();
  if(action==='download'&&bundle){
   try{download(new Blob([zipSync(bundle.files)],{type:'application/zip'}),safeName(title()||'PKOS-함께읽기')+'.zip');toast?.('선택한 기록의 웹문서를 저장했습니다. 압축을 풀고 index.html을 여세요.');}
   catch(error){status(error.message||'ZIP 파일을 만들지 못했습니다.',true);}
  }
 });
 paintNotes();paintAssets();shareStatus('게시 설정을 연결한 뒤 문서를 확인할 수 있습니다.');
 if(focus==='aidx'&&linked&&selected.size)void preview().then(()=>{if(!closed)find('#reading-aidx-heading')?.closest('section')?.scrollIntoView({block:'start'});});
 void Promise.resolve().then(()=>getPublisherStatus()).then(result=>{
  if(closed)return;configured=!!result.configured;find('[data-reading-setup]').open=!configured;
  const here=CONNECT_ORIGINS.find(([o])=>o===location.origin);find('[data-reading-connect-origin]').value=here?here[0]:CONNECT_ORIGINS[0][0];
  shareStatus(configured?'새로 고침하여 게시한 문서를 확인하세요.':'게시 설정을 먼저 연결하세요.');syncControls();
 }).catch(error=>{if(!closed){find('[data-reading-setup]').open=true;status(error.message||'게시 설정을 확인하지 못했습니다.',true);syncControls();}});
}
