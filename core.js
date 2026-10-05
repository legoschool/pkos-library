import {validateHistory} from './note-history.js';
export const SCHEMA=1;
export const statuses=['수집','정리 중','활용','보관'];
export const uid=()=>crypto.randomUUID();
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const normalize=s=>String(s||'').normalize('NFKC').toLocaleLowerCase().trim();
export const tagsOf=s=>[...new Set(String(s).split(/[,#\n]/).map(s=>s.trim()).filter(Boolean))].slice(0,40);
export function makeNote(data={}){const now=new Date().toISOString();return {id:uid(),title:'',body:'',folder:'수집함',tags:[],status:'수집',favorite:false,reviewDate:'',created:now,updated:now,revision:0,deleted:false,attachments:[],links:[],...data};}
export const excerpt=s=>String(s||'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/[#>*`_~\[\]]/g,'').replace(/\s+/g,' ').trim();
export function filterNotes(notes,{view='all',folder='',tag='',q='',fields=['title','body','folder','tags'],status='',sort='updated'}={}){
 const terms=normalize(q).split(/\s+/).filter(Boolean),today=new Date().toLocaleDateString('en-CA');
 return notes.filter(n=>view==='trash'?n.deleted:!n.deleted).filter(n=>!folder||n.folder===folder||n.folder.startsWith(folder+'/')).filter(n=>!tag||n.tags.includes(tag)).filter(n=>!status||n.status===status).filter(n=>view!=='favorites'||n.favorite).filter(n=>view!=='inbox'||n.status==='수집').filter(n=>view!=='review'||!!n.reviewDate&&n.reviewDate<=today).filter(n=>{const hay=normalize(fields.map(f=>Array.isArray(n[f])?n[f].join(' '):n[f]).join(' '));return terms.every(t=>hay.includes(t));}).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'ko'):sort==='created'?b.created.localeCompare(a.created):b.updated.localeCompare(a.updated));
}
export function targets(note,notes){const names=[...note.body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map(m=>normalize(m[1]));return [...new Set([...note.links,...notes.filter(n=>!n.deleted&&names.includes(normalize(n.title))).map(n=>n.id)])].filter(id=>id!==note.id&&notes.some(n=>n.id===id&&!n.deleted));}
// 연결과 추천에 쓰는 낱말. 주소와 숫자는 빼고, 끝의 조사를 떼고, 서술어 꼴(…다, …요, …면서)과 어디에나 나오는 말은 뺀다.
// 서재 전체에서 드물게 나오는 낱말일수록 무겁게 센다(흔한 말 '하는', '많이'가 기록을 잇지 않게).
const STOP=new Set(('그리고 그러나 하지만 그래서 그런데 또는 또한 등의 위한 위해 위해서 대한 대해 대해서 통해 통한 통해서 따라 따른 관한 관련 '
 +'있다 있는 있고 있어 있음 있을 없는 없다 없이 없을 하는 하고 하여 하기 하면 하며 하게 하지 한다 했다 해서 해야 했던 하던 되는 되어 되고 된다 됐다 든다 었다 였다 간다 온다 준다 본다 난다 '
 +'것이 것은 것을 것도 것으로 것과 것의 수가 수는 수도 수를 이번 이런 그런 저런 어떤 모든 많이 많은 같은 같이 함께 다른 다시 '
 +'가장 정말 너무 아주 매우 더욱 조금 바로 계속 먼저 다음 이후 이전 이상 이하 지금 오늘 어제 내일 우리 저는 제가 나는 내가 이것 그것 여기 거기 때문 '
 +'경우 정도 부분 이야기 생각 기록 가상 실제 사본 한글 워드 엑셀 '
 +'the and for with from this that are was were you your our http https www com net org html htm php jpg jpeg png gif pdf hwp hwpx doc docx ppt pptx xls xlsx youtube youtu watch').split(' '));
const TAIL=/(에서는|에서도|으로는|에서|에게|으로|에는|를|은|는)$/,PREDICATE=/(다|요|면서|도록|지만|는데|으며|려고|려|거나|으면|어서|아서)$/,LINK_TEXT=/(?:https?:\/\/|www\.)\S+/g;
export function termCounts(text){const map=new Map();for(let w of normalize(String(text||'').replace(LINK_TEXT,' ')).match(/[가-힣]{2,}|[a-z][a-z0-9]+/g)||[]){if(w.length>=3&&w.charCodeAt(0)>=0xac00){if(PREDICATE.test(w))continue;const s=w.replace(TAIL,'');if(s.length>=2)w=s;}if(!STOP.has(w))map.set(w,(map.get(w)||0)+1);}return map;}
// '수업이', '학생들의'처럼 뒤에 조사가 붙은 말은 한 번만 떼고, 떼어 낸 말이 서재에 따로 있을 때만 그 말로 센다('민주주의'는 그대로).
const RISKY=/(의|을|가|이|과|와|도|로|만|들|에)$/;
const canonWith=vocab=>w=>{if(w.length<3||w.charCodeAt(0)<0xac00)return w;const s=w.replace(RISKY,'');if(s.length<2||s===w||!vocab.has(s))return w;if(s.length>=3&&s.endsWith('들')&&vocab.has(s.slice(0,-1)))return s.slice(0,-1);return s;};
const mergeSorted=(a,b)=>{const r=[];let i=0,j=0;while(i<a.length||j<b.length){const v=j>=b.length||(i<a.length&&a[i]<=b[j])?a[i++]:b[j++];if(r[r.length-1]!==v)r.push(v);}return r;};
// 연도·형식·출처·묶음 표시와 영역(첫 노트북) 이름 태그는 주제가 아니라서 기록을 잇는 근거로 쓰지 않는다.
const META_TAGS=new Set(['한글','PDF','PPT','워드','엑셀','문서','글','웹','사진','소리','영상','블로그','블로그 비공개','유튜브','묶음','영역','기타','드라이브문서']);
export const metaTag=t=>/^(19|20)\d\d$/.test(t)||META_TAGS.has(t);
export const plainTag=(t,n)=>!metaTag(t)&&t!==String(n?.folder||'').split('/')[0];
// 같은 문서: 자료 카드 가운데 제목과 본문 앞부분이 같은 것(드라이브 여러 폴더에 놓인 같은 파일).
// 다른 형식: 제목 끝의 (한글)·(PDF)… 표시만 다른 자료 카드(같은 이름의 한글 파일과 PDF 파일).
const FORMAT_MARK=/\s*\((한글|pdf|ppt|워드|엑셀|문서|글|웹)\)$/;
const isCard=n=>n&&n.updatable===true&&!n.tags.includes('묶음')&&!n.tags.includes('영역');
export const sameDocKey=n=>isCard(n)?normalize(n.title)+'\u0001'+excerpt(n.body).slice(0,200):'';
// 형식만 다른 문서는 연도_묶음_ 이름을 붙인 자료 카드끼리, 같은 노트북 안에서만 찾는다(README처럼 흔한 이름이 서로 묶이지 않게).
const baseKey=n=>isCard(n)&&/^(19|20)\d\d_/.test(n.title)?n.folder+'\u0001'+normalize(n.title).replace(FORMAT_MARK,''):'';
// 서재마다 한 번 색인을 만든다: 제목·태그·낱말 → 기록, 직접 연결과 되짚는 연결, 같은 문서 묶음, 기록마다 낱말 수.
const relIndex=new WeakMap();
function relationIndex(notes){
 let x=relIndex.get(notes);if(x)return x;
 const live=notes.filter(n=>!n.deleted),liveIds=new Set(live.map(n=>n.id)),byTitle=new Map(),byTag=new Map(),bySig=new Map(),byBase=new Map(),out=new Map(),back=new Map(),order=new Map(),raw=new Map();
 const push=(m,k,v)=>{let a=m.get(k);if(!a)m.set(k,a=[]);a.push(v);};
 live.forEach((n,i)=>{order.set(n.id,i);push(byTitle,normalize(n.title),n.id);for(const t of new Set(n.tags))push(byTag,t,n.id);for(const w of termCounts(n.title+' '+n.body).keys())push(raw,w,i);const k=sameDocKey(n);if(k){push(bySig,k,n.id);const b=baseKey(n);if(b)push(byBase,b,n.id);}});
 const canon=canonWith(raw),byWord=new Map(),size=new Uint32Array(live.length);
 for(const [w,list] of raw){const c=canon(w),cur=byWord.get(c);byWord.set(c,cur?mergeSorted(cur,list):list);}
 for(const list of byWord.values())for(const i of list)size[i]++;
 for(const n of live){const o=new Set();for(const id of n.links)if(id!==n.id&&liveIds.has(id))o.add(id);for(const m of n.body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g))for(const id of byTitle.get(normalize(m[1]))||[])if(id!==n.id)o.add(id);out.set(n.id,o);for(const id of o){let b=back.get(id);if(!b)back.set(id,b=new Set());b.add(n.id);}}
 x={live,byTag,byWord,bySig,byBase,out,back,order,size,canon,n:Math.max(2,live.length),byId:new Map(live.map(n=>[n.id,n]))};relIndex.set(notes,x);return x;
}
// 같은 문서의 다른 자리(copies)와 다른 형식(formats). 자기 자신은 뺀다.
export function docFamily(note,notes){
 if(!isCard(note))return {copies:[],formats:[]};const X=relationIndex(notes),k=sameDocKey(note),get=id=>X.byId.get(id);
 const copies=(X.bySig.get(k)||[]).filter(id=>id!==note.id).map(get).filter(Boolean),seen=new Set([note.id,...copies.map(n=>n.id)]);
 const b=baseKey(note),formats=b?(X.byBase.get(b)||[]).filter(id=>!seen.has(id)).map(get).filter(Boolean):[];
 return {copies,formats};
}
// 함께 읽을 기록: 직접 연결(100), 드문 공통 낱말(최대 30, 긴 글은 낮춤), 주제 태그(드물수록 8에 가깝게), 같은 노트북(3).
// 같은 문서와 형식만 다른 문서는 따로 보이므로 빼고, 형식만 다른 기록끼리는 한 줄만 남긴다.
export function relations(note,notes){
 const X=relationIndex(notes),N=X.n,idf=df=>Math.log(1+N/Math.max(1,df))/Math.log(1+N),maxDf=Math.max(30,Math.round(N*.08));
 const out=X.out.get(note.id)||new Set(targets(note,notes)),back=X.back.get(note.id)||new Set(),acc=new Map();
 const get=id=>{let a=acc.get(id);if(!a)acc.set(id,a={w:0,words:[],t:0,tags:[]});return a;};
 for(const w of new Set([...termCounts(note.title+' '+note.body).keys()].map(X.canon))){const list=X.byWord.get(w);if(!list||list.length>maxDf)continue;const v=6*idf(list.length)**2;for(const i of list){const id=X.live[i].id;if(id!==note.id){const a=get(id);a.w+=v;a.words.push([w,v]);}}}
 for(const t of new Set(note.tags)){if(!plainTag(t,note))continue;const ids=X.byTag.get(t)||[],v=8*idf(ids.length);for(const id of ids)if(id!==note.id){const a=get(id);a.t+=v;a.tags.push(t);}}
 for(const id of out)get(id);for(const id of back)get(id);
 const fam=docFamily(note,notes),skip=new Set([...fam.copies,...fam.formats].map(n=>n.id)),rows=[];
 for(const [id,a] of acc){
  const n=X.byId.get(id);if(!n||id===note.id||skip.has(id))continue;
  const direct=out.has(id),bk=back.has(id),same=n.folder===note.folder&&n.folder!=='수집함',words=Math.min(30,a.w/Math.max(1,Math.sqrt(X.size[X.order.get(id)]/80))),score=(direct||bk?100:0)+a.t+(same?3:0)+words;
  if(score<5)continue;
  const top=a.words.sort((p,q)=>q[1]-p[1]).slice(0,8).map(x=>x[0]);
  rows.push({note:n,direct,back:bk,tags:a.tags,same,words:top,score,why:direct?'내가 연결한 기록':bk?'이 기록을 참조함':top.length&&words>=a.t?'공통 낱말 · '+top.slice(0,3).join(', '):a.tags.length?'같은 태그 · '+a.tags.join(', '):'같은 노트북'});
 }
 rows.sort((a,b)=>b.score-a.score||X.order.get(a.note.id)-X.order.get(b.note.id));
 const used=new Set();return rows.filter(r=>{const k=baseKey(r.note);if(!k)return true;if(used.has(k))return false;used.add(k);return true;});
}
export const connectionCriteria={body:'본문 단어',title:'제목',synonyms:'비슷한 표현',tags:'태그',folder:'노트북',direct:'직접 연결'};
export const synonymGroups=[['ai','인공지능'],['수업','교수학습'],['평가','assessment'],['독서','책읽기']];
// Same result as targets() for every note, but builds the title index once so thousands of records stay fast.
// 지도에 올린 기록 안에서 낱말·태그가 나오는 기록 수(df)를 함께 센다. 흔한 낱말일수록 연결 점수가 작다.
export function prepareConnectionData(notes){
 const live=new Set(notes.filter(n=>!n.deleted).map(n=>n.id)),byTitle=new Map();
 for(const n of notes)if(!n.deleted){const k=normalize(n.title);if(!byTitle.has(k))byTitle.set(k,[]);byTitle.get(k).push(n.id);}
 const raws=notes.map(n=>[termCounts(n.body),termCounts(n.title)]),vocab=new Set();for(const [b,t] of raws){for(const w of b.keys())vocab.add(w);for(const w of t.keys())vocab.add(w);}
 const canon=canonWith(vocab),fold=m=>{const r=new Map();for(const [w,c] of m){const k=canon(w);r.set(k,(r.get(k)||0)+c);}return r;};
 const prepared=new Map(notes.map((n,i)=>{const out=new Set();for(const id of n.links)if(id!==n.id&&live.has(id))out.add(id);for(const m of n.body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g))for(const id of byTitle.get(normalize(m[1]))||[])if(id!==n.id)out.add(id);const body=fold(raws[i][0]),title=fold(raws[i][1]),all=new Map(body);for(const [w,c] of title)all.set(w,(all.get(w)||0)+c);return [n.id,{body,title,all,out}];}));
 const df=new Map(),tagDf=new Map();for(const n of notes){if(n.deleted)continue;for(const w of prepared.get(n.id).all.keys())df.set(w,(df.get(w)||0)+1);for(const t of new Set(n.tags))tagDf.set(t,(tagDf.get(t)||0)+1);}
 prepared.df=df;prepared.tagDf=tagDf;prepared.n=Math.max(2,live.size);
 return prepared;
}
const prepCache=new WeakMap();
export function connectionEvidence(a,b,notes,selected=Object.keys(connectionCriteria),weights={},prepared=null){
 if(!prepared){prepared=prepCache.get(notes);if(!prepared){prepared=prepareConnectionData(notes);prepCache.set(notes,prepared);}}
 const enabled=new Set(selected),reasons=[];let score=0;
 const add=(key,value,text)=>{if(enabled.has(key)&&value>0){const weight=Number.isFinite(weights[key])?Math.max(0,weights[key]):1;score+=value*weight;if(weight>0)reasons.push(text);}};
 const N=prepared.n||2,rare=(m,k)=>(Math.log(1+N/Math.max(1,m?.get(k)||1))/Math.log(1+N))**2;
 const own=n=>prepared.get(n.id)||{body:termCounts(n.body),title:termCounts(n.title),all:termCounts(n.title+' '+n.body),out:new Set(targets(n,notes))};
 const ap=own(a),bp=own(b),ac=ap.body,bc=bp.body;
 const common=[...ac.keys()].filter(w=>bc.has(w)).map(w=>[w,Math.min(ac.get(w),bc.get(w),3)*rare(prepared.df,w)]).sort((x,y)=>y[1]-x[1]),body=3*common.reduce((t,x)=>t+x[1],0)/Math.max(1,Math.sqrt(Math.max(ac.size,bc.size)/80));
 if(body>=1.5)add('body',Math.min(18,body),'본문 공통어: '+common.slice(0,5).map(x=>x[0]).join(', '));
 const at=ap.title,bt=bp.title,tw=new Map();for(const w of at.keys())if(bt.has(w)||bc.has(w))tw.set(w,rare(prepared.df,w));for(const w of bt.keys())if(ac.has(w)&&!tw.has(w))tw.set(w,rare(prepared.df,w));
 const titles=[...tw].sort((x,y)=>y[1]-x[1]),title=5*titles.reduce((t,x)=>t+x[1],0);
 if(title>=.5)add('title',Math.min(15,title),'제목 관련어: '+titles.slice(0,5).map(x=>x[0]).join(', '));
 const aw=ap.all,bw=bp.all;
 const similar=synonymGroups.filter(group=>group.some(x=>aw.has(x))&&group.some(y=>bw.has(y)&&group.some(x=>x!==y&&aw.has(x))));
 add('synonyms',similar.length*5,'같은 뜻으로 묶은 표현: '+similar.map(g=>g.join(' / ')).join(', '));
 const tags=a.tags.filter(t=>b.tags.includes(t)&&plainTag(t,a)&&plainTag(t,b));add('tags',tags.reduce((t,x)=>t+8*Math.sqrt(rare(prepared.tagDf,x)),0),'같은 태그: '+tags.join(', '));
 if(a.folder===b.folder)add('folder',4,'같은 노트북: '+a.folder);
 else if(a.folder.includes('/')&&b.folder.includes('/')&&a.folder.split('/').slice(0,-1).join('/')===b.folder.split('/').slice(0,-1).join('/'))add('folder',2,'같은 상위 노트북');
 else if(a.folder.split('/').at(-1)===b.folder.split('/').at(-1))add('folder',1,'노트북 끝 이름이 같음');
 if(enabled.has('direct')&&(ap.out.has(b.id)||bp.out.has(a.id)))add('direct',100,'직접 연결 또는 본문의 기록 링크');
 return {score,reasons};
}
export function safeName(s){let name=String(s||'제목 없음').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,100).replace(/[. ]+$/g,'')||'제목 없음';if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))name='_'+name;return name;}
export function parseMarkdown(source,filename='기록.md'){
 let body=String(source).replace(/^\uFEFF/,''),meta={};
 const fm=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(body);
 if(fm){body=body.slice(fm[0].length).trimStart();for(const line of fm[1].split(/\r?\n/)){const m=/^(title|tags|status|folder|review|created|date|category|url|source):\s*(.*)$/.exec(line);if(m){try{meta[m[1]]=JSON.parse(m[2]);}catch{meta[m[1]]=/^".*"$/.test(m[2].trim())?m[2].trim().slice(1,-1):m[2];}}}}
 let title=typeof meta.title==='string'?meta.title:filename.replace(/\.[^.]+$/,'');const heading=/^# (.+)(?:\r?\n|$)/.exec(body);if(heading){title=heading[1];body=body.slice(heading[0].length).trimStart();}
 const out={title,body,tags:Array.isArray(meta.tags)?meta.tags.filter(t=>typeof t==='string'):tagsOf(meta.tags||''),folder:typeof meta.folder==='string'?meta.folder:'수집함',status:statuses.includes(meta.status)?meta.status:'수집',reviewDate:typeof meta.review==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(meta.review)?meta.review:''};
 // 변환기가 붙인 date·category·url·source와 이 앱이 내보낸 created를 살린다. 블로그 글은 쓴 날을 date로, 변환한 문서는 파일 수정일을 만든 날로 둔다(서재 현황에서 추정 연도).
 const str=v=>typeof v==='string'?v.trim():'',day=[/^\d{4}-\d{2}-\d{2}/.exec(str(meta.date))?.[0]].find(d=>d&&Number.isFinite(Date.parse(d))),url=/^https?:\/\/\S+$/.test(str(meta.url))?str(meta.url):'',category=str(meta.category);
 if(Number.isFinite(Date.parse(str(meta.created))))out.created=new Date(str(meta.created)).toISOString();else if(day)out.created=day+'T00:00:00.000Z';
 if(category&&category.length<=40&&!out.tags.includes(category))out.tags.push(category);
 if(url){out.openUrl=url;if(/blog\.naver\.com|tistory\.com|brunch\.co\.kr/.test(url)){out.kind='blog';out.sourceUrl=url;if(day)out.date=day;}}
 else if(str(meta.source)&&day)out.kind='doc';
 return out;
}
export function validateBackup(data){
 if(!data||data.format!=='pkem-backup'||data.schema!==SCHEMA||!Array.isArray(data.notes)||!Array.isArray(data.folders)||!Array.isArray(data.assets))throw Error('이 앱의 백업 파일이 아닙니다.');
 if(data.notes.length>10000||data.assets.length>5000)throw Error('백업 항목 수가 허용 범위를 넘었습니다.');
 const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id);
 for(const n of data.notes){if(!n||!validId(n.id)||!Array.isArray(n.links)||!n.links.every(validId)||!Array.isArray(n.attachments)||!n.attachments.every(validId)||typeof n.favorite!=='boolean'||typeof n.deleted!=='boolean'||typeof n.reviewDate!=='string')throw Error('기록 식별자 또는 속성이 손상되었습니다.');}
 for(const a of data.assets){if(!a||!validId(a.id)||typeof a.data!=='string'||a.data.length%4!==0)throw Error('첨부 식별자 또는 데이터가 손상되었습니다.');}
 const ids=new Set();for(const n of data.notes){if(typeof n.id!=='string'||!n.id||ids.has(n.id)||typeof n.title!=='string'||typeof n.body!=='string'||n.body.length>2000000||typeof n.folder!=='string'||!Array.isArray(n.tags)||!n.tags.every(t=>typeof t==='string')||!Array.isArray(n.links)||!n.links.every(t=>typeof t==='string')||!Array.isArray(n.attachments)||!n.attachments.every(t=>typeof t==='string')||!statuses.includes(n.status)||!Number.isInteger(n.revision)||typeof n.updated!=='string'||!Number.isFinite(Date.parse(n.updated))||typeof n.created!=='string'||!Number.isFinite(Date.parse(n.created)))throw Error('기록 형식이 손상되었습니다.');ids.add(n.id);}
 const assets=new Set();for(const a of data.assets){if(typeof a.id!=='string'||assets.has(a.id)||typeof a.name!=='string'||typeof a.type!=='string'||typeof a.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(a.data))throw Error('첨부 형식이 손상되었습니다.');assets.add(a.id);}
 if(data.notes.some(n=>n.attachments.some(id=>!assets.has(id))))throw Error('백업에서 첨부 파일이 누락되었습니다.');
 for(const n of data.notes)validateHistory(n);
 if(!data.folders.every(f=>typeof f==='string'&&f.trim()))throw Error('노트북 형식이 손상되었습니다.');return data;
}
export function markdownFile(note,notes,assets){
 const linkName=n=>safeName(n.title)+'--'+n.id;
 let body=note.body.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g,(all,name,label)=>{const n=notes.find(n=>!n.deleted&&normalize(n.title)===normalize(name));return n?'[['+linkName(n)+'|'+(label||name)+']]':all;});
 const fm=['---','title: '+JSON.stringify(note.title),'tags: '+JSON.stringify(note.tags),'folder: '+JSON.stringify(note.folder),'status: '+JSON.stringify(note.status),'created: '+JSON.stringify(note.created),'updated: '+JSON.stringify(note.updated),'review: '+JSON.stringify(note.reviewDate),'---','','# '+(note.title||'제목 없음'),''];
 const outgoing=note.links.map(id=>notes.find(n=>n.id===id&&!n.deleted)).filter(Boolean).map(n=>'[['+linkName(n)+'|'+n.title+']]');
 const files=note.attachments.map(id=>assets.find(a=>a.id===id)).filter(Boolean).map(a=>'['+a.name.replace(/[\[\]]/g,'')+'](attachments/'+encodeURIComponent(a.id+'-'+safeName(a.name))+')');
 return [...fm,body,...(outgoing.length?['','## 연결된 기록',...outgoing]:[]),...(files.length?['','## 첨부 파일',...files]:[])].join('\n');
}
