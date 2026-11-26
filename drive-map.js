// G 드라이브 지도: 이 컴퓨터의 G:\내 드라이브를 연결해 파일 이름만 훑고, 7판 분류대로 지도를 그린다.
// 훑은 색인은 이 브라우저(IndexedDB)에만 저장하고 어디로도 보내지 않는다. 파일 내용은 누를 때만 읽는다.
import {CATS,TOPICS,SKIP_TOP,SKIP_NAME,SENSITIVE} from './drive-map-rules.js';
import {buildModel,pathOf,childrenOf,subsOf,anchorsSorted,search,GOOGLE_EXT} from './drive-map-model.js';
import {esc} from './core.js';
import {buildRelations,reasonText} from './drive-relations.js';
import {mountDriveGraph} from './drive-graph.js';
import {buildDriveCards} from './drive-cards.js';
import {buildPlacer} from './drive-placement.js';

const supported=typeof window.showDirectoryPicker==='function';
const MAX_ITEMS=900000,STALE_MS=24*3600*1000;
let handle=null;
// 다른 폴더 선택 창도 G 드라이브에서 열리게 한다.
export function driveStartIn(){return handle||undefined;}
export function pickerOptions(base,id){return handle?{...base,startIn:handle}:{...base,id};}
// 기록을 드라이브 구성대로 저장할 때 쓰는 G 드라이브(내 드라이브) 손잡이.
export function getDriveHandle(){return handle;}

function openKV(name){
 return new Promise((res,rej)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('kv',{keyPath:'id'});r.onsuccess=()=>{const db=r.result;const tx=(mode,fn)=>new Promise((ok,no)=>{const t=db.transaction('kv',mode),s=t.objectStore('kv'),q=fn(s);t.oncomplete=()=>ok(q?.result);t.onerror=()=>no(t.error);t.onabort=()=>no(t.error);});res({get:id=>tx('readonly',s=>s.get(id)),put:v=>tx('readwrite',s=>s.put(v)),del:id=>tx('readwrite',s=>s.delete(id))});};r.onerror=()=>rej(r.error);});
}
async function gzip(text){return await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();}
async function gunzip(blob){return await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();}
const fmt=n=>Number(n||0).toLocaleString('ko-KR');
const ago=t=>{if(!t)return '';const m=Math.round((Date.now()-t)/60000);if(m<1)return '방금';if(m<60)return m+'분 전';const h=Math.round(m/60);if(h<48)return h+'시간 전';return Math.round(h/24)+'일 전';};
const VIEWABLE=/\.(pdf|png|jpe?g|gif|webp|svg|bmp|txt|md|csv|json|html?|mp4|webm|mp3|wav|m4a|ogg)$/i;
const TYPES={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',bmp:'image/bmp',txt:'text/plain;charset=utf-8',md:'text/plain;charset=utf-8',csv:'text/plain;charset=utf-8',json:'text/plain;charset=utf-8',html:'text/plain;charset=utf-8',htm:'text/plain;charset=utf-8',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',ogg:'audio/ogg'};

export function createDriveMap({demo,toast,driveRoot,icon}){
 let rel=null,graph=null,graphHost=null,graphFor=null,cardCache=null,cardFor=null;
 // 묶음 카드를 기록 목록·서재 현황·지식맵에도 보일지(기본 켬). 이 브라우저에만 기억한다.
 const CARD_KEY='pkos-drive-cards';let cardsOn=localStorage.getItem(CARD_KEY)!=='0';
 let raw=null,placerCache=null,placerFor=null,saveTimer=null;
 let kv=null,model=null,meta=null,state='loading',scan=null,el=null,mode='graph',focusCat=-1,panel={type:'overview'},query='',error='',ready=null,abort=null;
 const listeners=new Set();
 const notify=()=>{listeners.forEach(f=>{try{f();}catch{}});paint();};

 async function init(){
  try{
   // 체험 서재(?demo=1)는 지어낸 교사 드라이브로 바로 그린다. 연수장 컴퓨터에서도 지도를 보여 줄 수 있게.
   if(demo){state='opening';paint();const {sampleDrive}=await import('./drive-sample.js');raw=sampleDrive();model=buildModel(raw);meta={at:0,root:'가상 교사 드라이브'};resetGraph();state='ready';notify();return;}
   kv=await openKV('pkos-drive-map-v1');
   const h=await kv.get('handle');handle=h?.handle||null;meta=(await kv.get('index-meta'))||null;
   const idx=await kv.get('index');
   if(idx?.blob){state='opening';paint();raw=JSON.parse(await gunzip(idx.blob));model=buildModel(raw);resetGraph();}
   state=model?'ready':handle?'need-scan':'empty';
  }catch(e){state=handle?'need-scan':'empty';error='저장해 둔 지도를 읽지 못했습니다. 다시 훑어 주세요. ('+e.message+')';}
  notify();
  // 이 컴퓨터에서 「매번 허용」해 두었으면 하루 지난 지도는 조용히 다시 훑는다.
  if(handle&&(!meta||Date.now()-meta.at>STALE_MS)){try{if(await handle.queryPermission({mode:'read'})==='granted')void rescan(false);}catch{}}
 }
 ready=init();

 async function connect(){
  if(!supported){toast('이 브라우저는 컴퓨터 폴더 연결을 지원하지 않습니다. PC의 Chrome이나 Edge에서 열어 주세요.');return;}
  let picked;
  try{picked=await window.showDirectoryPicker({mode:'read',id:'pkos-gdrive'});}catch(e){if(e.name!=='AbortError')toast(e.message);return;}
  // G: 드라이브 맨 위를 골랐으면 안의 「내 드라이브」로 들어간다.
  let root=picked;
  for(const n of ['내 드라이브','My Drive']){try{root=await picked.getDirectoryHandle(n);break;}catch{}}
  handle=root;try{await kv.put({id:'handle',handle:root,picked:picked.name,at:Date.now()});}catch(e){toast('연결은 했지만 이 브라우저가 연결을 기억하지 못했습니다. 다음에 다시 골라 주세요.');}
  if(!/^(내 드라이브|My Drive)$/.test(root.name))toast('「'+root.name+'」 폴더만 연결했습니다. G 드라이브 전체를 보려면 「내 드라이브」를 골라 주세요.');
  await rescan(true);
 }

 async function permission(ask){
  if(!handle)return false;let p=await handle.queryPermission({mode:'read'});
  if(p!=='granted'&&ask)p=await handle.requestPermission({mode:'read'});
  return p==='granted';
 }

 async function rescan(ask=true){
  if(scan)return;
  if(!handle){await connect();return;}
  try{if(!await permission(ask)){if(ask)toast('G 드라이브 읽기를 허용해야 다시 훑을 수 있습니다.');return;}}catch(e){toast(e.message);return;}
  const started=Date.now(),names=[],parent=[],dirs=[];let excluded=0,unreadable=0,last='',limited=false;
  abort=new AbortController();const signal=abort.signal;
  scan={count:0,last:'',quiet:!ask};paint();
  let tick=0;
  const listDir=async(job)=>{
   try{
    for await(const [name,h] of job.h.entries()){
     if(signal.aborted)return;
     if(name.startsWith('.')||name.startsWith('~$')||SKIP_NAME.has(name)||(job.d===0&&SKIP_TOP.has(name))||SENSITIVE.test(name)){excluded++;continue;}
     if(names.length>=MAX_ITEMS){limited=true;return;}
     const i=names.length,isDir=h.kind==='directory';names.push(name);parent.push(job.i);dirs.push(isDir?'1':'0');
     if(isDir)queue.push({h,i,d:job.d+1});
    }
   }catch{unreadable++;}
   last=job.h.name;
   if(Date.now()-tick>300){tick=Date.now();scan.count=names.length;scan.last=last;paintProgress();}
  };
  const queue=[{h:handle,i:-1,d:0}];
  try{
   await new Promise((resolve)=>{let active=0;const pump=()=>{if(signal.aborted&&!active){resolve();return;}while(!signal.aborted&&active<12&&queue.length){const job=queue.pop();active++;listDir(job).finally(()=>{active--;if(!queue.length&&!active)resolve();else pump();});}if(!queue.length&&!active)resolve();};pump();});
   if(signal.aborted){scan=null;toast('훑기를 멈췄습니다. 전에 만든 지도는 그대로입니다.');paint();return;}
   raw={names,parent,dir:dirs.join('')};
   model=buildModel(raw);resetGraph();
   meta={id:'index-meta',at:Date.now(),ms:Date.now()-started,count:names.length,files:model.files,dirs:model.dirs,excluded,unreadable,limited,root:handle.name};
   await kv.put({id:'index',blob:await gzip(JSON.stringify(raw))});await kv.put(meta);
   state='ready';error='';
   if(ask)toast('G 드라이브 '+fmt(model.files)+'개 파일을 지도에 올렸습니다.');
  }catch(e){error='훑는 중 문제가 생겼습니다: '+e.message;}
  finally{scan=null;abort=null;notify();}
 }

 // ── 파일 열기 ──
 async function fileHandleOf(i){
  const parts=pathOf(model,i);let dir=handle;
  for(const p of parts.slice(0,-1))dir=await dir.getDirectoryHandle(p);
  return model.isDir[i]?await dir.getDirectoryHandle(parts.at(-1)):await dir.getFileHandle(parts.at(-1));
 }
 const winPath=i=>{const base=driveRoot().replace(/[\\/]+$/,'')+'\\';return /^(내 드라이브|My Drive)$/.test(handle?.name||meta?.root||'내 드라이브')?base+pathOf(model,i).join('\\'):base+'…\\'+pathOf(model,i).join('\\');};
 const driveSearch=i=>'https://drive.google.com/drive/search?q='+encodeURIComponent(model.names[i].replace(GOOGLE_EXT,''));
 async function act(kind,i){
  if(!model||!(i>=0&&i<model.N))return;
  if(demo){toast('체험용 가상 드라이브라 실제 파일은 없습니다. 내 G 드라이브를 연결하면 여기서 바로 열립니다.');return;}
  if(kind==='copy'){const t=winPath(i);try{await navigator.clipboard.writeText(t);toast('경로를 복사했습니다. 탐색기 주소 칸에 붙여 넣으면 열립니다.');}catch{prompt('경로를 복사하세요',t);}return;}
  if(kind==='find'){window.open(driveSearch(i),'_blank','noopener');return;}
  if(kind==='open'){
   const name=model.names[i];
   if(GOOGLE_EXT.test(name)){window.open(driveSearch(i),'_blank','noopener');return;}
   const view=VIEWABLE.test(name),win=view?window.open('about:blank','_blank'):null;
   try{
    if(!await permission(true))throw Error('G 드라이브 읽기를 허용해 주세요.');
    const file=await(await fileHandleOf(i)).getFile(),ext=name.split('.').pop().toLowerCase();
    const url=URL.createObjectURL(view?new Blob([file],{type:TYPES[ext]||file.type}):file);setTimeout(()=>URL.revokeObjectURL(url),120000);
    if(win){win.location.href=url;}else{const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();toast('「'+name+'」을 내려받았습니다. 원본은 G 드라이브에 그대로 있습니다.');}
   }catch(e){win?.close();toast('열지 못했습니다: '+(e.name==='NotFoundError'?'그 사이 옮기거나 지운 파일입니다. 다시 훑어 주세요.':e.message));}
  }
 }
 document.addEventListener('click',e=>{const b=e.target.closest('[data-drive-act]');if(!b)return;e.preventDefault();e.stopPropagation();void act(b.dataset.driveAct,Number(b.dataset.i));},true);

 // ── 그리기 ──
 const chip=i=>{const c=CATS[model.cat[i]];return `<span class="drive-chip" style="--c:${c.color}">${esc(c.key+' '+c.label)}<i>›</i>${esc(model.subNames[model.sub[i]])}</span>`;};
 const where=i=>{const p=pathOf(model,i);p.pop();return p.length?p.join(' / '):'내 드라이브 맨 위';};
 function itemHTML(i,{showChip=true,count='same'}={}){
  const dir=model.isDir[i],n=count==='tot'?model.tot[i]:model.same[i];
  return `<li class="drive-item ${dir?'is-dir':''}"><span class="drive-ico">${icon(dir?'folder':'file')}</span><div class="drive-item-main">${dir?`<button type="button" class="drive-name" data-drive-folder="${i}">${esc(model.names[i])}</button>`:`<button type="button" class="drive-name" data-drive-act="open" data-i="${i}" title="열기">${esc(model.names[i])}</button>`}<small>${showChip?chip(i):''}<span class="drive-where">${esc(where(i))}</span></small></div><span class="drive-count">${dir?fmt(n)+'개':''}</span><span class="drive-acts">${dir?'':`<button type="button" data-drive-act="open" data-i="${i}">${GOOGLE_EXT.test(model.names[i])?'드라이브에서 열기':'열기'}</button>`}<button type="button" data-drive-act="copy" data-i="${i}">경로 복사</button>${dir?`<button type="button" data-drive-act="find" data-i="${i}">드라이브에서 찾기</button>`:''}</span></li>`;
 }
 function panelHTML(){
  if(query.trim()){
   const r=search(model,query.trim());
   return `<div class="drive-panel-head"><h2>「${esc(query.trim())}」 찾은 결과</h2><p>${fmt(r.total)}개${r.total>r.items.length?' · 앞의 '+fmt(r.items.length)+'개만 보입니다. 낱말을 더 띄어 쓰면 좁혀집니다.':''}</p></div>${r.items.length?`<ul class="drive-list">${r.items.map(i=>itemHTML(i)).join('')}</ul>`:'<p class="drive-empty">이름에 이 낱말이 든 파일·폴더가 없습니다. 다른 낱말이나 띄어 쓴 두 낱말로 찾아보세요.</p>'}`;
  }
  if(panel.type==='node'&&rel&&rel.nodes[panel.k]!==undefined)return nodePanelHTML(panel.k);
  if(panel.type==='group'){
   const g=model.groups.get(panel.key);if(!g){panel={type:'overview'};return panelHTML();}
   const c=CATS[g.cat],list=anchorsSorted(model,g.anchors);
   return `<div class="drive-panel-head"><button type="button" class="drive-back" data-drive-cat="${g.cat}">← ${esc(c.key+' '+c.label)}</button><h2>${esc(g.label)}</h2><p>파일 ${fmt(g.files)}개 · 묶음 ${fmt(list.length)}개</p></div><ul class="drive-list">${list.slice(0,400).map(i=>itemHTML(i,{showChip:false})).join('')}</ul>${list.length>400?'<p class="drive-empty">묶음이 많아 앞의 400개만 보입니다. 위 찾기 칸을 써 주세요.</p>':''}`;
  }
  if(panel.type==='topic'){
   const t=panel.topic,list=anchorsSorted(model,model.topicAnchors[t]).sort((a,b)=>model.tot[b]-model.tot[a]);
   return `<div class="drive-panel-head"><h2>주제 · ${esc(TOPICS[t][0])}</h2><p>파일 ${fmt(model.topicFiles[t])}개가 ${fmt(list.length)}곳에 흩어져 있습니다. 칸 이름표로 어디에 있는지 봅니다.</p></div><ul class="drive-list">${list.slice(0,400).map(i=>itemHTML(i,{count:'tot'})).join('')}</ul>`;
  }
  if(panel.type==='folder'){
   const i=panel.i,kids=childrenOf(model,i).sort((a,b)=>model.isDir[b]-model.isDir[a]||model.names[a].localeCompare(model.names[b],'ko',{numeric:true}));
   const crumbs=[];for(let x=i;x>=0;x=model.parent[x])crumbs.unshift(x);
   return `<div class="drive-panel-head"><nav class="drive-crumbs"><button type="button" data-drive-folder="-1">내 드라이브</button>${crumbs.map(x=>`<span>/</span><button type="button" data-drive-folder="${x}">${esc(model.names[x])}</button>`).join('')}</nav>${i>=0?`<p>${chip(i)} 파일 ${fmt(model.tot[i])}개</p>`:''}</div><ul class="drive-list">${kids.slice(0,600).map(k=>itemHTML(k,{showChip:false,count:'tot'})).join('')}</ul>${kids.length>600?'<p class="drive-empty">항목이 많아 앞의 600개만 보입니다.</p>':''}`;
  }
  if(mode==='graph'&&rel)return graphOverviewHTML();
  if(focusCat>=0){
   const c=CATS[focusCat],subs=subsOf(model,focusCat).filter(g=>g.files>0).sort((a,b)=>b.files-a.files);
   return `<div class="drive-panel-head"><button type="button" class="drive-back" data-drive-home>← 전체 지도</button><h2>${esc(c.key+' '+c.label)}</h2><p>${esc(c.note)} · 파일 ${fmt(model.catFiles[focusCat])}개</p></div><ul class="drive-groups">${subs.map(g=>`<li><button type="button" data-drive-group="${g.cat*65536+g.sub}"><span>${esc(g.label)}</span><small>${fmt(g.files)}개 · 묶음 ${fmt(g.anchors.length)}</small></button></li>`).join('')}</ul>`;
  }
  return `<div class="drive-panel-head"><h2>7판 분류로 본 G 드라이브</h2><p>칸을 누르면 소분류가, 소분류를 누르면 실제 폴더가 나옵니다.</p></div><ul class="drive-groups">${CATS.map((c,k)=>model.catFiles[k]||model.catDirs[k]?`<li><button type="button" data-drive-cat="${k}" style="--c:${c.color}"><span><b class="dot"></b>${esc(c.key+' '+c.label)}</span><small>${fmt(model.catFiles[k])}개 · ${esc(c.note)}</small></button></li>`:'').join('')}</ul><p class="drive-note">강사카드·동의서·계약서·통장·명단 같은 이름 ${fmt(meta?.excluded||0)}개와 00_개인자력관리, GPKI는 지도에 올리지 않았습니다. 지도는 이 브라우저에만 저장됩니다.</p>`;
 }

 // ── 연결 지도 ──
 function resetGraph(){graph?.dispose();graph=null;graphHost=null;rel=null;graphFor=null;}
 const nodeName=k=>model.names[rel.nodes[k]];
 const nodePath=k=>pathOf(model,rel.nodes[k]).join(' / ');
 const nodeChip=k=>chip(rel.nodes[k]);
 function ensureGraph(){
  if(!model)return null;
  if(!rel)rel=buildRelations(model);
  if(graphHost&&graphFor===model)return graphHost;
  graph?.dispose();graphHost=document.createElement('div');graphHost.className='dg-host';graphFor=model;
  const present=[...new Set(rel.nodes.map(d=>model.cat[d]))].sort((a,b)=>a-b),cl=new Map(present.map((c,k)=>[c,k]));
  const clusters=present.map(c=>({label:CATS[c].key+' '+CATS[c].label,color:CATS[c].color,cat:c}));
  const nodes=rel.nodes.map((d,k)=>({label:model.names[d],sub:CATS[model.cat[d]].label+' · 파일 '+fmt(rel.files[k])+'개 · 연결 '+rel.neighbors[k].length+'곳',color:CATS[model.cat[d]].color,r:Math.min(30,3.5+Math.sqrt(rel.files[k])*.75),cluster:cl.get(model.cat[d])}));
  const edges=rel.edges.map(e=>({a:e.a,b:e.b,w:Math.min(4,e.score/2.5)}));
  graph=mountDriveGraph(graphHost,{nodes,edges,clusters,onSelect:k=>{query='';const q=el?.querySelector('[data-drive-query]');if(q)q.value='';panel=k>=0?{type:'node',k}:{type:'overview'};graph.highlight(null);paintPanel();}});
  graph.clusters=clusters;
  return graphHost;
 }
 const relItem=(k,e)=>{const o=e.a===k?e.b:e.a;return `<li class="dg-rel"><button type="button" class="drive-name" data-dg-node="${o}">${esc(nodeName(o))}</button><small>${nodeChip(o)}<span class="drive-where">${esc(nodePath(o))}</span></small><p class="dg-why">${esc(reasonText(e))}</p>${e.sample.length?`<p class="dg-sample">같은 파일 예: ${e.sample.slice(0,3).map(n=>'<code>'+esc(n)+'</code>').join(' ')}</p>`:''}</li>`;};
 function nodePanelHTML(k){
  const d=rel.nodes[k],list=rel.neighbors[k].map(i=>rel.edges[i]).sort((a,b)=>b.score-a.score);
  const topics=[...rel.topicCount[k]].map((c,t)=>[t,c]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const cross=list.filter(e=>model.cat[rel.nodes[e.a]]!==model.cat[rel.nodes[e.b]]).length;
  return `<div class="drive-panel-head"><button type="button" class="drive-back" data-dg-home>← 전체 연결</button><h2>${esc(model.names[d])}</h2><p>${chip(d)} 파일 ${fmt(rel.files[k])}개</p><p class="drive-where">${esc(nodePath(k))}</p>${rel.top[k].length?`<div class="dg-words">${rel.top[k].slice(0,8).map(([w])=>`<span>${esc(w)}</span>`).join('')}</div>`:''}${topics.length?`<div class="dg-words topics">${topics.map(([t,c])=>`<button type="button" data-drive-topic="${t}">${esc(TOPICS[t][0])} ${fmt(c)}</button>`).join('')}</div>`:''}<div class="drive-acts"><button type="button" data-drive-folder="${d}">폴더 안 보기</button><button type="button" data-drive-act="copy" data-i="${d}">경로 복사</button><button type="button" data-drive-act="find" data-i="${d}">드라이브에서 찾기</button></div></div><h3 class="dg-h3">관련 자료 ${fmt(list.length)}곳${cross?` · 다른 칸 ${fmt(cross)}곳`:''}</h3>${list.length?`<ul class="drive-list dg-rels">${list.map(e=>relItem(k,e)).join('')}</ul>`:'<p class="drive-empty">이름으로 찾은 뚜렷한 연결이 없습니다. 이 묶음은 혼자 쓰인 자료일 가능성이 큽니다.</p>'}`;
 }
 function graphOverviewHTML(){
  const cross=rel.edges.filter(e=>model.cat[rel.nodes[e.a]]!==model.cat[rel.nodes[e.b]]).slice(0,14);
  const hubs=rel.nodes.map((d,k)=>k).sort((a,b)=>rel.neighbors[b].length-rel.neighbors[a].length||rel.files[b]-rel.files[a]).slice(0,8);
  return `<div class="drive-panel-head"><h2>G 드라이브 지식맵</h2><p>드라이브를 묶음 ${fmt(rel.nodes.length)}개로 나누고, 이름만 보고 찾은 연결 ${fmt(rel.edges.length)}개를 그렸습니다. 같은 칸은 한 무리로 모이고, 보라색 선은 서로 다른 칸을 잇습니다.</p><ul class="dg-keys"><li><b>같은 이름 파일</b> 한 자료가 두 곳에 있음</li><li><b>주제</b> 주제 사전(드론, 학생자치 등)이 함께 나옴</li><li><b>낱말</b> 폴더·파일 이름에 같은 낱말이 두드러짐</li></ul></div><h3 class="dg-h3">칸을 건너는 연결</h3><ul class="drive-list dg-rels">${cross.map(e=>`<li class="dg-rel"><button type="button" class="drive-name" data-dg-node="${e.a}">${esc(nodeName(e.a))}</button><span class="dg-arrow">↔</span><button type="button" class="drive-name" data-dg-node="${e.b}">${esc(nodeName(e.b))}</button><small>${nodeChip(e.a)}${nodeChip(e.b)}</small><p class="dg-why">${esc(reasonText(e))}</p></li>`).join('')}</ul><h3 class="dg-h3">많이 이어진 묶음</h3><ul class="drive-groups">${hubs.map(k=>`<li><button type="button" data-dg-node="${k}" style="--c:${CATS[model.cat[rel.nodes[k]]].color}"><span><b class="dot"></b>${esc(nodeName(k))}</span><small>연결 ${fmt(rel.neighbors[k].length)}곳 · 파일 ${fmt(rel.files[k])}개</small></button></li>`).join('')}</ul><p class="drive-note">강사카드·동의서·계약서·통장·명단 같은 이름 ${fmt(meta?.excluded||0)}개와 00_개인자력관리, GPKI는 지도에 올리지 않았습니다. 지도는 이 브라우저에만 저장됩니다.</p>`;
 }
 function graphBodyHTML(){
  ensureGraph();
  const hidden=graph?.hidden()||new Set();
  return `<div class="drive-body is-graph"><div class="drive-canvas dg-wrap"><div class="dg-legend" role="group" aria-label="칸 보이기·숨기기">${graph.clusters.map((c,k)=>`<button type="button" data-dg-cluster="${k}" aria-pressed="${!hidden.has(k)}" style="--c:${c.color}"><b class="dot"></b>${esc(c.label)}</button>`).join('')}</div><div class="dg-slot"></div><div class="dg-zoom"><button type="button" data-dg-zoom="in" aria-label="확대">+</button><button type="button" data-dg-zoom="out" aria-label="축소">−</button><button type="button" data-dg-zoom="fit">전체</button></div><p class="drive-legend">원 크기는 파일 수, 선 굵기는 연결의 세기입니다. 휠로 확대하고 빈 곳을 끌어 옮깁니다. 원을 누르면 어떻게 이어지는지 나옵니다.</p></div><aside class="drive-panel">${panelHTML()}</aside></div>`;
 }
 function highlightFromQuery(){
  if(!graph||!rel)return;const q=query.trim().toLowerCase();if(!q){graph.highlight(null);return;}
  const set=new Set();search(model,q,{limit:300}).items.forEach(i=>{const k=rel.owner[i];if(k>=0)set.add(k);});
  rel.nodes.forEach((d,k)=>{if(model.low[d].includes(q))set.add(k);});graph.highlight(set);
 }

 function bubble(x,y,r,label,sub,color,attr,active){
  let lines=[label];if(label.length>9){const mid=label.length/2,sp=[...label].map((ch,k)=>ch===' '?k:-1).filter(k=>k>0);const cut=sp.length?sp.reduce((a,b)=>Math.abs(b-mid)<Math.abs(a-mid)?b:a):-1;lines=cut>0?[label.slice(0,cut),label.slice(cut+1)]:[label.slice(0,Math.ceil(mid)),label.slice(Math.ceil(mid))];}
  return `<g class="drive-node ${active?'active':''}" ${attr} tabindex="0" role="button" aria-label="${esc(label+' '+sub)}"><circle cx="${x}" cy="${y}" r="${r}" fill="${color}" fill-opacity=".16" stroke="${color}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="${Math.max(4,r*.18)}" fill="${color}"/>${lines.map((l,k)=>`<text x="${x}" y="${y+r+19+k*19}" text-anchor="middle" class="drive-label">${esc(l)}</text>`).join('')}<text x="${x}" y="${y+r+18+lines.length*19}" text-anchor="middle" class="drive-sub">${esc(sub)}</text></g>`;
 }
 function svgHTML(){
  const W=820,H=640,cx=W/2,cy=H/2-12;
  let nodes=[],center;
  if(mode==='topics'){
   const max=Math.max(1,...model.topicFiles);
   nodes=TOPICS.map((t,k)=>({label:t[0],sub:fmt(model.topicFiles[k])+'개',val:model.topicFiles[k],color:'#7c3aed',attr:`data-drive-topic="${k}"`,active:panel.type==='topic'&&panel.topic===k})).filter(n=>n.val>0);
   nodes.forEach(n=>n.r=14+32*Math.sqrt(n.val/max));
   center={label:'주제',sub:'칸을 가로질러 찾기',color:'#7c3aed'};
  }else if(focusCat>=0){
   const c=CATS[focusCat],subs=subsOf(model,focusCat).filter(g=>g.files>0).sort((a,b)=>b.files-a.files),top=subs.slice(0,16),max=Math.max(1,...top.map(g=>g.files));
   nodes=top.map(g=>{const key=g.cat*65536+g.sub;return {label:g.label.replace(/^\d+_/,''),sub:fmt(g.files)+'개',val:g.files,color:c.color,attr:`data-drive-group="${key}"`,active:panel.type==='group'&&panel.key===key};});
   nodes.forEach(n=>n.r=14+38*Math.sqrt(n.val/max));
   center={label:c.key+' '+c.label,sub:fmt(model.catFiles[focusCat])+'개'+(subs.length>16?' · 그 밖 '+(subs.length-16)+'칸':''),color:c.color,attr:'data-drive-home'};
  }else{
   const max=Math.max(1,...model.catFiles);
   nodes=CATS.map((c,k)=>({label:c.key+' '+c.label,sub:fmt(model.catFiles[k])+'개',val:model.catFiles[k],color:c.color,attr:`data-drive-cat="${k}"`})).filter(n=>n.val>0);
   nodes.forEach(n=>n.r=16+42*Math.sqrt(n.val/max));
   center={label:'내 드라이브',sub:fmt(model.files)+'개 파일',color:'#172B43'};
  }
  const n=nodes.length,rx=W/2-112,ry=H/2-100;
  nodes.forEach((d,k)=>{const a=-Math.PI/2+k*2*Math.PI/Math.max(n,1);d.x=cx+rx*Math.cos(a);d.y=cy+ry*Math.sin(a);});
  const total=nodes.reduce((s,d)=>s+d.val,0)||1;
  const links=nodes.map(d=>`<line x1="${cx}" y1="${cy}" x2="${d.x}" y2="${d.y}" stroke="${d.color}" stroke-opacity=".35" stroke-width="${1+10*d.val/total}"/>`).join('');
  return `<svg class="drive-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="G 드라이브 지식맵">${links}${bubble(cx,cy,44,center.label,center.sub,center.color,center.attr||'',false)}${nodes.map(d=>bubble(d.x,d.y,d.r,d.label,d.sub,d.color,d.attr,d.active)).join('')}</svg>`;
 }

 function progressHTML(){return scan?`<div class="drive-progress" role="status"><span class="drive-spinner"></span><span data-drive-progress>G 드라이브 이름을 훑는 중 · ${fmt(scan.count)}개 · ${esc(scan.last)}</span><button type="button" data-drive-stop>멈추기</button></div>`:'';}
 function paintProgress(){const p=el?.querySelector('[data-drive-progress]');if(p)p.textContent='G 드라이브 이름을 훑는 중 · '+fmt(scan.count)+'개 · '+scan.last;else paint();}

 function headHTML(){
  const status=model?demo?`파일 ${fmt(model.files)}개 · 폴더 ${fmt(model.dirs)}개 · 지어낸 이름이라 실제 파일은 없습니다 · <a href="./#v=drive">내 G 드라이브 연결하기</a>`:`파일 ${fmt(model.files)}개 · 폴더 ${fmt(model.dirs)}개 · ${ago(meta?.at)} 훑음${meta?.limited?' · 너무 많아 일부만':''}`:'';
  return `<header class="drive-head"><div class="drive-title"><span class="eyebrow">${demo?'체험용 가상 교사 드라이브':'이 컴퓨터의 G: 드라이브'}</span><h1>G 드라이브 지식맵</h1>${status?`<p class="drive-status">${status}</p>`:''}</div><div class="drive-tools">${model?`<label class="drive-search">${icon('search')}<input type="search" data-drive-query placeholder="G 드라이브에서 찾기 (예: 드론 수업)" value="${esc(query)}" aria-label="G 드라이브에서 찾기"></label><div class="drive-modes" role="group" aria-label="지도 보기"><button type="button" data-drive-mode="graph" aria-pressed="${mode==='graph'}">연결 지도</button><button type="button" data-drive-mode="cats" aria-pressed="${mode==='cats'}">분류 기준</button><button type="button" data-drive-folder="-1">실제 폴더</button></div><button type="button" class="quiet small drive-cards-toggle" data-drive-cards aria-pressed="${cardsOn}" title="묶음마다 읽기 전용 카드를 만들어 모든 기록·서재 현황·지식맵·찾기에 함께 보입니다">${cardsOn?'기록에 함께 보기 켜짐':'기록에 함께 보기 꺼짐'}</button>`:''}${handle?`<button type="button" class="quiet small" data-drive-rescan ${scan?'disabled':''}>다시 훑기</button><button type="button" class="quiet small" data-drive-connect ${scan?'disabled':''}>다른 폴더 연결</button>`:''}</div></header>`;
 }
 function bodyHTML(){
  if(state==='loading'||state==='opening')return `<div class="drive-card"><p>${state==='opening'?'저장해 둔 G 드라이브 지도를 펴는 중입니다.':'G 드라이브 지도를 준비하는 중입니다.'}</p></div>`;
  if(!model){
   if(!supported)return `<div class="drive-card"><h2>이 브라우저에서는 G 드라이브를 열 수 없습니다</h2><p>휴대폰과 Safari는 컴퓨터 폴더를 읽지 못합니다.<br>PC의 Chrome이나 Edge에서 이 주소를 열어 주세요.</p><a class="text-link drive-demo-link" href="?demo=1#v=drive">가상 교사 드라이브로 지도 살펴보기</a></div>`;
   return `<div class="drive-card"><span class="drive-card-icon">${icon('folder')}</span><h2>${handle?'G 드라이브를 한 번 더 허용해 주세요':'G 드라이브를 연결해 주세요'}</h2><p>구글 드라이브 앱이 깔린 PC에는 G: 드라이브가 있습니다.<br>연결 창에서 <b>G:</b> 또는 그 안의 <b>내 드라이브</b>를 고르면 됩니다.</p><ol><li>파일 이름만 읽고, 내용은 누를 때만 엽니다.</li><li>지도는 이 브라우저에만 저장하고 인터넷으로 보내지 않습니다.</li><li>PC마다 처음 한 번만 고르면 다음부터 기억합니다.<br>「매번 허용」을 고르면 다시 묻지 않습니다.</li></ol><button type="button" class="primary" ${handle?'data-drive-rescan':'data-drive-connect'} ${scan?'disabled':''}>${handle?'G 드라이브 다시 허용하기':'G 드라이브 연결하기'}</button><a class="text-link drive-demo-link" href="?demo=1#v=drive">가상 교사 드라이브로 먼저 살펴보기</a>${error?`<p class="error">${esc(error)}</p>`:''}</div>`;
  }
  if(mode==='graph')return `${error?`<p class="error drive-error">${esc(error)}</p>`:''}${graphBodyHTML()}`;
  return `${error?`<p class="error drive-error">${esc(error)}</p>`:''}<div class="drive-body"><div class="drive-canvas">${svgHTML()}<p class="drive-legend">${mode==='topics'?'주제 사전의 낱말이 이름에 든 파일 수입니다. 한 파일이 여러 주제에 들 수 있습니다.':focusCat>=0?'원 크기는 파일 수입니다. 가운데를 누르면 전체 지도로 돌아갑니다.':'「드라이브 폴더 재구성안」 7판의 칸입니다. 원 크기는 파일 수입니다.'}</p></div><aside class="drive-panel">${panelHTML()}</aside></div>`;
 }
 function paint(){
  if(!el?.isConnected)return;
  const focused=document.activeElement?.matches?.('[data-drive-query]'),pos=focused?document.activeElement.selectionStart:0;
  el.innerHTML=`<section class="drive-map">${headHTML()}${progressHTML()}${bodyHTML()}</section>`;
  const slot=el.querySelector('.dg-slot');if(slot&&graphHost){slot.replaceWith(graphHost);highlightFromQuery();}
  if(focused){const q=el.querySelector('[data-drive-query]');q?.focus();try{q.setSelectionRange(pos,pos);}catch{}}
 }
 let qTimer=null;
 function bind(){
  el.addEventListener('input',e=>{if(!e.target.matches('[data-drive-query]'))return;clearTimeout(qTimer);const v=e.target.value;qTimer=setTimeout(()=>{query=v;paintPanel();highlightFromQuery();},160);});
  el.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.drive-node')){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
  el.addEventListener('click',e=>{
   const g=e.target.closest('[data-dg-node],[data-dg-cluster],[data-dg-zoom],[data-dg-home]');
   if(g&&graph){
    if(g.matches('[data-dg-node]')){const k=Number(g.dataset.dgNode);query='';panel={type:'node',k};graph.highlight(null);graph.select(k);paintPanel();}
    else if(g.matches('[data-dg-home]')){panel={type:'overview'};graph.select(-1,{center:false});graph.highlight(null);paintPanel();}
    else if(g.matches('[data-dg-cluster]')){graph.toggleCluster(Number(g.dataset.dgCluster));g.setAttribute('aria-pressed',String(!graph.hidden().has(Number(g.dataset.dgCluster))));}
    else {const z=g.dataset.dgZoom;z==='fit'?graph.fit():graph.zoom(z==='in'?1.3:1/1.3);}
    return;
   }
   if(e.target.closest('[data-drive-cards]')){cardsOn=!cardsOn;localStorage.setItem(CARD_KEY,cardsOn?'1':'0');toast(cardsOn?'G 드라이브 묶음을 모든 기록·서재 현황·지식맵에 함께 보입니다.':'G 드라이브 묶음 카드를 기록 목록에서 뺐습니다.');notify();return;}
   const t=e.target.closest('[data-drive-connect],[data-drive-rescan],[data-drive-stop],[data-drive-mode],[data-drive-cat],[data-drive-group],[data-drive-topic],[data-drive-folder],[data-drive-home]');if(!t)return;
   if(t.matches('[data-drive-connect]'))return void connect();
   if(t.matches('[data-drive-rescan]'))return void rescan(true);
   if(t.matches('[data-drive-stop]')){abort?.abort();return;}
   query='';
   if(t.matches('[data-drive-mode]')){mode=t.dataset.driveMode;focusCat=-1;panel={type:'overview'};}
   else if(t.matches('[data-drive-home]')){focusCat=-1;panel={type:'overview'};}
   else if(t.matches('[data-drive-cat]')){mode='cats';focusCat=Number(t.dataset.driveCat);panel={type:'overview'};}
   else if(t.matches('[data-drive-group]')){const key=Number(t.dataset.driveGroup);mode='cats';focusCat=Math.floor(key/65536);panel={type:'group',key};}
   else if(t.matches('[data-drive-topic]')){const tp=Number(t.dataset.driveTopic);panel={type:'topic',topic:tp};if(mode==='graph'&&rel&&graph){graph.highlight(new Set(rel.nodes.map((d,k)=>k).filter(k=>rel.topicCount[k][tp]>0)));paintPanel();return;}mode='cats';}
   else if(t.matches('[data-drive-folder]')){panel={type:'folder',i:Number(t.dataset.driveFolder)};if(mode==='graph'&&graph){paintPanel();return;}}
   paint();el.querySelector('.drive-panel')?.scrollTo(0,0);
  });
 }
 function paintPanel(){const p=el?.querySelector('.drive-panel');if(p){p.innerHTML=panelHTML();p.scrollTo(0,0);}else paint();}

 return {
  ready:()=>ready,
  mount(target){el=target;bind();paint();},
  hasModel:()=>!!model,
  // 묶음마다 읽기 전용 기록 카드(drive-cards.js). 드라이브 지도가 바뀔 때만 다시 만든다.
  cards(){if(!model||!cardsOn)return [];if(cardFor!==model){if(!rel)rel=buildRelations(model);cardCache=buildDriveCards(model,rel,{at:meta?.at||Date.now(),root:demo?'가상 교사 드라이브':(meta?.root||'내 드라이브')});cardFor=model;}return cardCache;},
  files:()=>model?.files||0,
  // 기록을 어느 드라이브 폴더에 저장할지 고르는 함수(drive-placement.js). 지도가 바뀔 때만 다시 만든다.
  placer(){if(!model)return null;if(placerFor!==model){if(!rel)rel=buildRelations(model);placerCache=buildPlacer(model,rel);placerFor=model;}return placerCache;},
  // 기록장이 G 드라이브에 새로 쓴 파일을 다시 훑지 않고 지도에 바로 더한다(경로는 내 드라이브 기준 「a/b/c.md」).
  addWritten(paths,gone=[]){
   if(demo||!raw||!Array.isArray(paths)||(!paths.length&&!gone.length))return;
   const key=(p,n)=>p+'/'+n,known=new Map();
   for(let i=0;i<raw.names.length;i++)known.set(key(raw.parent[i],raw.names[i]),i);
   let added=0;const dir=raw.dir.split('');
   for(const path of paths){
    const parts=String(path).split('/').filter(Boolean);let p=-1;
    parts.forEach((name,j)=>{
     let i=known.get(key(p,name));
     if(i===undefined){i=raw.names.length;raw.names.push(name);raw.parent.push(p);dir.push(j<parts.length-1?'1':'0');known.set(key(p,name),i);added++;}
     p=i;
    });
   }
   raw.dir=dir.join('');
   // 옮기거나 지운 파일은 지도에서 뺀다(파일만, 폴더는 그대로).
   let removed=0;
   if(gone.length){
    const drop=new Uint8Array(raw.names.length);
    for(const path of gone){const parts=String(path).split('/').filter(Boolean);let p=-1;for(const name of parts){const i=known.get(key(p,name));if(i===undefined){p=-2;break;}p=i;}if(p>=0&&raw.dir[p]==='0'){drop[p]=1;removed++;}}
    if(removed){const map=new Int32Array(raw.names.length).fill(-1),names=[],parent=[],d=[];for(let i=0;i<raw.names.length;i++){if(drop[i])continue;map[i]=names.length;names.push(raw.names[i]);parent.push(raw.parent[i]>=0?map[raw.parent[i]]:-1);d.push(raw.dir[i]);}raw={names,parent,dir:d.join('')};}
   }
   if(!added&&!removed)return;model=buildModel(raw);resetGraph();
   if(meta){meta={...meta,files:model.files,dirs:model.dirs};}
   clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{try{await kv?.put({id:'index',blob:await gzip(JSON.stringify(raw))});if(meta)await kv?.put(meta);}catch{}},1500);
   notify();
  },
  // 다른 화면에서 G 드라이브 지도로 넘어올 때: 찾을 낱말이나 보여 줄 항목을 미리 정해 둔다.
  focus({q,item}={}){if(q!==undefined)query=q;if(item>=0&&model){query='';const i=Number(item);panel=model.isDir[i]?{type:'folder',i}:{type:'folder',i:model.parent[i]};}},
  // 기록 목록의 찾기 결과 아래에 붙는 G 드라이브 결과.
  searchHTML(q){
   q=(q||'').trim();if(!q)return '';
   if(!model)return `<div class="drive-inline"><p>${handle?'G 드라이브 지도를 다시 훑으면 드라이브 파일도 함께 찾습니다.':'G 드라이브를 연결하면 드라이브 파일 이름도 함께 찾습니다.'}</p><button type="button" class="quiet small" data-drive-all="">G 드라이브 지도 열기</button></div>`;
   const r=search(model,q,{limit:8});if(!r.total)return `<div class="drive-inline"><p>G 드라이브에도 「${esc(q)}」이 든 이름이 없습니다.</p></div>`;
   return `<div class="drive-inline"><h3>G 드라이브에서 ${fmt(r.total)}개</h3><ul class="drive-list compact">${r.items.map(i=>`<li class="drive-item ${model.isDir[i]?'is-dir':''}"><span class="drive-ico">${icon(model.isDir[i]?'folder':'file')}</span><div class="drive-item-main"><button type="button" class="drive-name" data-drive-go="${i}">${esc(model.names[i])}</button><small>${chip(i)}</small></div></li>`).join('')}</ul><button type="button" class="quiet small" data-drive-all="${esc(q)}">G 드라이브 지도에서 모두 보기</button></div>`;
  },
  onChange(f){listeners.add(f);return ()=>listeners.delete(f);}
 };
}
