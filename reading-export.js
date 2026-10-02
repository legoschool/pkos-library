import {marked} from './vendor/marked.js';
import DOMPurify from './vendor/purify.js';
import {zipSync,strToU8} from './vendor/fflate.js';
import {esc,safeName} from './core.js';
export async function buildReadingBundle(notes,assets,{attachmentIds=[],metadata=false,title='나의지식서재 · 함께 읽기'}={}){
 if(!notes.length||notes.length>50)throw Error('기록은 1개부터 50개까지 고르세요.');
 if(notes.reduce((n,r)=>n+r.body.length,0)>2000000)throw Error('한 묶음의 본문은 200만 글자까지입니다.');
 const selected=new Map(notes.map((n,i)=>[n.id,'record-'+(i+1)])),byTitle=new Map(notes.map(n=>[n.title.trim().toLowerCase(),n])),allowed=new Set(notes.flatMap(n=>n.attachments));
 const chosen=assets.filter(a=>allowed.has(a.id)&&attachmentIds.includes(a.id)),files={},paths=new Map();let bytes=0;
 for(const [i,a] of chosen.entries()){bytes+=a.blob.size;if(bytes>50*1024*1024)throw Error('첨부는 한 묶음에 50MB까지 넣을 수 있습니다.');const path='attachments/'+(i+1)+'-'+safeName(a.name);paths.set(a.id,path);files[path]=new Uint8Array(await a.blob.arrayBuffer());}
 function body(note){
  const md=note.body.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g,(_,name,label)=>{const target=byTitle.get(name.trim().toLowerCase());return target?'['+(label||name)+'](#'+selected.get(target.id)+')':esc(label||name)+' (연결 기록 미포함)';});
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
  return container.innerHTML;
 }
 const articles=notes.map(n=>{
  const attachments=chosen.filter(a=>n.attachments.includes(a.id)).map(a=>{const path=paths.get(a.id),url=path.split('/').map(encodeURIComponent).join('/');const preview=/\.(png|jpe?g|gif|webp)$/i.test(a.name)?'<img loading="lazy" src="'+url+'" alt="'+esc(a.name)+'">':/\.(mp3|wav|ogg|m4a)$/i.test(a.name)?'<audio controls preload="none" src="'+url+'"></audio>':/\.(mp4|webm)$/i.test(a.name)?'<video controls preload="none" src="'+url+'"></video>':'';return '<figure>'+preview+'<figcaption><a href="'+url+'" download="'+esc(a.name)+'">'+esc(a.name)+' 다운로드</a></figcaption></figure>';}).join('');
  const related=n.links.filter(id=>selected.has(id)).map(id=>{const target=notes.find(n=>n.id===id);return '<a href="#'+selected.get(id)+'">'+esc(target.title||'제목 없음')+'</a>';});
  return '<article id="'+selected.get(n.id)+'"><h1>'+esc(n.title||'제목 없음')+'</h1>'+(metadata?'<p class="meta">'+esc(n.folder)+(n.tags.length?' · '+n.tags.map(t=>'#'+esc(t)).join(' '):'')+'</p>':'')+'<div class="body">'+body(n)+'</div>'+(attachments?'<section class="attachments"><h2>함께 담은 첨부</h2>'+attachments+'</section>':'')+(related.length?'<aside><h2>함께 읽는 기록</h2>'+related.join(' · ')+'</aside>':'')+'<a class="top" href="#contents">목차로</a></article>';
 }).join('');
 const css=':root{font-family:system-ui,"Malgun Gothic",sans-serif;color:#26382f;background:#f7f7f2;line-height:1.8}*{box-sizing:border-box}body{margin:0}header,main{width:min(880px,100%);margin:auto;padding:32px 24px}header{border-bottom:1px solid #dce1d8}header p,.meta,.top{color:#657468;font-size:14px}h1,h2{line-height:1.4;word-break:keep-all;overflow-wrap:anywhere}h1{font-size:30px}h2{font-size:21px}a{color:#37664d;overflow-wrap:anywhere}nav ol{padding-left:24px}article{padding:32px 0 48px;border-bottom:1px solid #dce1d8;overflow-wrap:anywhere}.body{font-size:17px}.body table{display:block;overflow:auto;border-collapse:collapse;max-width:100%}th,td{padding:8px 12px;border:1px solid #cad3c6}pre{overflow:auto;padding:16px;background:#eaf0e7;border-radius:8px}code{font-size:.92em}blockquote{margin-left:0;padding-left:18px;border-left:3px solid #90aa8f;color:#4b624f}img,video{max-width:100%;height:auto;border-radius:8px}audio{width:100%}figure{margin:18px 0}figcaption{font-size:14px}aside,.attachments{margin-top:30px}.top{display:block;margin-top:24px}@media(max-width:500px){header,main{padding:20px 18px}h1{font-size:25px}}@media print{header nav,.top{display:none}body{background:white}article{break-before:page}a{color:inherit}pre{white-space:pre-wrap}}';
 const html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src \'self\' blob: data:; media-src \'self\' blob: data:; base-uri \'none\'; form-action \'none\'"><meta name="referrer" content="no-referrer"><title>'+esc(title)+'</title><style>'+css+'</style></head><body><header id="contents"><p>PKOS · 나의지식서재</p><h1>'+esc(title)+'</h1><p>선택한 '+notes.length+'개 기록 · '+chosen.length+'개 첨부</p><nav aria-label="기록 목차"><ol>'+notes.map(n=>'<li><a href="#'+selected.get(n.id)+'">'+esc(n.title||'제목 없음')+'</a></li>').join('')+'</ol></nav></header><main>'+articles+'</main></body></html>';
 files['index.html']=strToU8(html);files['읽어주세요.txt']=strToU8('압축을 풀고 index.html을 여세요. attachments 폴더가 있으면 함께 보관하세요.\n이 묶음은 선택한 글과 첨부를 읽는 용도입니다. 앱 전체 백업이나 접근 제한 기능은 아닙니다.\n인터넷에 자동 게시하지 않았습니다.\n');
 return {html,files};
}
export function showReadingExport({notes,assets,currentId,download,toast}){
 notes=notes.filter(n=>!n.deleted).sort((a,b)=>b.updated.localeCompare(a.updated));const selected=new Set(currentId&&notes.some(n=>n.id===currentId)?[currentId]:[]),included=new Set();
 let bundle=null,urls=[],busy=false,closed=false;
 const d=document.createElement('dialog');d.className='reading-export-dialog';d.setAttribute('aria-labelledby','reading-export-title');
 d.innerHTML='<header><h2 id="reading-export-title">읽기용 웹문서 만들기</h2><button type="button" data-reading="close">닫기 ×</button></header><p>선택한 글과 첨부로 인터넷 없이 열 수 있는 웹문서 묶음을 만듭니다. 인터넷에 게시하거나 다른 사람에게 전송하지 않습니다.</p><label>묶음 제목<input data-reading-title value="나의지식서재 · 함께 읽기" maxlength="200"></label><label>기록 찾기<input type="search" data-reading-search placeholder="제목으로 찾기"></label><div data-reading-notes></div><p data-reading-count role="status"></p><details><summary>포함할 첨부 선택 · 기본은 글만</summary><div data-reading-assets></div></details><label class="reading-check"><input type="checkbox" data-reading-meta> 노트북 이름과 태그도 포함</label><p class="hint">이 창을 연 시점의 저장된 글을 사용합니다. 미선택 기록·원본 위치·휴지통·앱의 저장 정보는 내보내지 않습니다. 본문에 직접 적은 내용과 링크는 포함됩니다. 최대 50개 기록·첨부 50MB까지입니다.</p><div class="reading-actions"><button type="button" data-reading="preview">포함 내용 미리보기</button><button type="button" class="primary" data-reading="download" disabled>웹문서 ZIP 저장</button></div><p data-reading-status role="status"></p><iframe title="내보낼 웹문서 미리보기" sandbox="allow-same-origin" hidden></iframe>';
 document.body.append(d);d.showModal();
 const reset=()=>{bundle=null;urls.forEach(URL.revokeObjectURL);urls=[];const frame=d.querySelector('iframe');frame.hidden=true;frame.removeAttribute('srcdoc');d.querySelector('[data-reading=download]').disabled=true;d.querySelector('[data-reading-status]').textContent='';};
 function paintNotes(){const q=d.querySelector('[data-reading-search]').value.trim().toLowerCase(),shown=notes.filter(n=>n.title.toLowerCase().includes(q)).slice(0,200);d.querySelector('[data-reading-notes]').innerHTML=shown.map(n=>'<label class="reading-check"><input type="checkbox" data-reading-note="'+n.id+'" '+(selected.has(n.id)?'checked':'')+'><span>'+esc(n.title||'제목 없음')+'</span></label>').join('')+(notes.filter(n=>n.title.toLowerCase().includes(q)).length>200?'<p class="hint">200개까지 표시합니다. 검색으로 범위를 줄이세요.</p>':'');}
 function paintAssets(){const allowed=new Set(notes.filter(n=>selected.has(n.id)).flatMap(n=>n.attachments));for(const id of included)if(!allowed.has(id))included.delete(id);d.querySelector('[data-reading-assets]').innerHTML=assets.filter(a=>allowed.has(a.id)).map(a=>'<label class="reading-check"><input type="checkbox" data-reading-asset="'+a.id+'" '+(included.has(a.id)?'checked':'')+'><span>'+esc(a.name)+' · '+Math.ceil(a.blob.size/1024)+' KB</span></label>').join('')||'<p class="hint">선택한 기록에 첨부가 없습니다.</p>';d.querySelector('[data-reading-count]').textContent=selected.size+'개 기록 선택 · '+included.size+'개 첨부 포함';d.querySelector('[data-reading=preview]').disabled=!selected.size||selected.size>50;}
 function close(){closed=true;reset();d.close();d.remove();document.removeEventListener('keydown',guard,true);}
 const guard=e=>{if((e.ctrlKey||e.metaKey)&&['s','k'].includes(e.key.toLowerCase())){e.preventDefault();e.stopImmediatePropagation();}};
 document.addEventListener('keydown',guard,true);d.addEventListener('cancel',e=>{e.preventDefault();close();});
 d.addEventListener('input',e=>{if(e.target.matches('[data-reading-search]'))paintNotes();if(e.target.matches('[data-reading-title]'))reset();});
 d.addEventListener('change',e=>{if(e.target.dataset.readingNote){e.target.checked?selected.add(e.target.dataset.readingNote):selected.delete(e.target.dataset.readingNote);reset();paintAssets();}if(e.target.dataset.readingAsset){e.target.checked?included.add(e.target.dataset.readingAsset):included.delete(e.target.dataset.readingAsset);reset();paintAssets();}if(e.target.matches('[data-reading-meta]'))reset();});
 async function preview(){
  if(busy)return;reset();busy=true;d.querySelectorAll('input,button:not([data-reading=close])').forEach(el=>el.disabled=true);
  try{
   const result=await buildReadingBundle(notes.filter(n=>selected.has(n.id)),assets,{attachmentIds:[...included],metadata:d.querySelector('[data-reading-meta]').checked,title:d.querySelector('[data-reading-title]').value.trim()||'함께 읽기'});if(closed)return;
   const doc=new DOMParser().parseFromString(result.html,'text/html');
   for(const [path,data] of Object.entries(result.files)){if(!path.startsWith('attachments/'))continue;const a=assets.find(a=>included.has(a.id)&&path.endsWith('-'+safeName(a.name))),url=URL.createObjectURL(new Blob([data],{type:a?.type||'application/octet-stream'}));urls.push(url);const encoded=path.split('/').map(encodeURIComponent).join('/');doc.querySelectorAll('[src],[href]').forEach(el=>{for(const attr of ['src','href'])if(el.getAttribute(attr)===encoded)el.setAttribute(attr,url);});}
   bundle=result;const frame=d.querySelector('iframe');frame.srcdoc='<!doctype html>'+doc.documentElement.outerHTML;frame.hidden=false;d.querySelector('[data-reading-status]').textContent='미리보기와 포함 파일을 확인한 뒤 ZIP으로 저장하세요.';
  }catch(e){d.querySelector('[data-reading-status]').textContent=e.message;}
  finally{busy=false;if(!closed){d.querySelectorAll('input,button').forEach(el=>el.disabled=false);d.querySelector('[data-reading=download]').disabled=!bundle;paintAssets();}}
 }
 d.addEventListener('click',e=>{const a=e.target.closest('[data-reading]')?.dataset.reading;if(a==='close')close();if(a==='preview')void preview();if(a==='download'&&bundle){download(new Blob([zipSync(bundle.files)],{type:'application/zip'}),safeName(d.querySelector('[data-reading-title]').value||'PKOS-함께읽기')+'.zip');toast('선택한 기록의 웹문서를 저장했습니다. 압축을 풀고 index.html을 여세요.');}});
 paintNotes();paintAssets();
}
