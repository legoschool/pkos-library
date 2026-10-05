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
function relationsExact(note,notes){const live=notes.filter(n=>!n.deleted&&n.id!==note.id),out=targets(note,notes);return live.map(n=>{const direct=out.includes(n.id),back=targets(n,notes).includes(note.id),tags=n.tags.filter(t=>note.tags.includes(t));const words=[...new Set(normalize(note.title+' '+note.body).match(/[가-힣a-z]{2,}/g)||[])].filter(w=>normalize(n.title+' '+n.body).includes(w)&&!['있습니다','합니다','그리고'].includes(w));const same=n.folder===note.folder&&n.folder!=='수집함';return {note:n,direct,back,tags,same,words:words.slice(0,8),score:(direct||back?100:0)+tags.length*8+(same?3:0)+Math.min(12,words.length)};}).filter(r=>r.score>=5).sort((a,b)=>b.score-a.score);}
// Large libraries: build title/tag/word indexes once per notes array, shortlist candidates, then score them with the same rule.
const RELATION_STOP=['있습니다','합니다','그리고'],relIndex=new WeakMap();
function relationIndex(notes){
 let x=relIndex.get(notes);if(x)return x;
 const live=notes.filter(n=>!n.deleted),liveIds=new Set(live.map(n=>n.id)),byTitle=new Map(),byTag=new Map(),byWord=new Map(),out=new Map(),back=new Map(),text=new Map();
 const push=(m,k,id)=>{let a=m.get(k);if(!a)m.set(k,a=[]);a.push(id);};
 for(const n of live){push(byTitle,normalize(n.title),n.id);for(const t of n.tags)push(byTag,t,n.id);const t=normalize(n.title+' '+n.body);text.set(n.id,t);for(const w of new Set(t.match(/[가-힣a-z]{2,}/g)||[]))push(byWord,w,n.id);}
 for(const n of live){const o=new Set();for(const id of n.links)if(id!==n.id&&liveIds.has(id))o.add(id);for(const m of n.body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g))for(const id of byTitle.get(normalize(m[1]))||[])if(id!==n.id)o.add(id);out.set(n.id,o);for(const id of o){let b=back.get(id);if(!b)back.set(id,b=new Set());b.add(n.id);}}
 x={byTag,byWord,out,back,text,byId:new Map(live.map(n=>[n.id,n]))};relIndex.set(notes,x);return x;
}
export function relations(note,notes){
 if(notes.length<=400)return relationsExact(note,notes);
 const X=relationIndex(notes),out=X.out.get(note.id)||new Set(targets(note,notes)),back=X.back.get(note.id)||new Set();
 const words=[...new Set(normalize(note.title+' '+note.body).match(/[가-힣a-z]{2,}/g)||[])].filter(w=>!RELATION_STOP.includes(w));
 const cand=new Set([...out,...back]);
 for(const t of note.tags)for(const id of (X.byTag.get(t)||[]).slice(0,800))cand.add(id);
 for(const w of words){const ids=X.byWord.get(w);if(ids&&ids.length<=300)for(const id of ids)cand.add(id);}
 cand.delete(note.id);
 const rows=[];
 for(const id of cand){const n=X.byId.get(id);if(!n)continue;const direct=out.has(id),bk=back.has(id),tags=n.tags.filter(t=>note.tags.includes(t)),txt=X.text.get(id),ws=words.filter(w=>txt.includes(w)),same=n.folder===note.folder&&n.folder!=='수집함';const score=(direct||bk?100:0)+tags.length*8+(same?3:0)+Math.min(12,ws.length);if(score>=5)rows.push({note:n,direct,back:bk,tags,same,words:ws.slice(0,8),score});}
 return rows.sort((a,b)=>b.score-a.score);
}
export const connectionCriteria={body:'본문 단어',title:'제목',synonyms:'비슷한 표현',tags:'태그',folder:'노트북',direct:'직접 연결'};
export const synonymGroups=[['ai','인공지능'],['수업','교수학습'],['평가','assessment'],['독서','책읽기']];
const stopWords=new Set(['있습니다','합니다','그리고','가상','기록입니다','기록','대한','위한','이것은','실제','아닙니다','합니다']);
function wordCounts(text){const map=new Map();for(const w of normalize(text).match(/[가-힣a-z0-9]{2,}/g)||[])if(!stopWords.has(w))map.set(w,(map.get(w)||0)+1);return map;}
// Same result as targets() for every note, but builds the title index once so thousands of records stay fast.
export function prepareConnectionData(notes){
 const live=new Set(notes.filter(n=>!n.deleted).map(n=>n.id)),byTitle=new Map();
 for(const n of notes)if(!n.deleted){const k=normalize(n.title);if(!byTitle.has(k))byTitle.set(k,[]);byTitle.get(k).push(n.id);}
 return new Map(notes.map(n=>{const out=new Set();for(const id of n.links)if(id!==n.id&&live.has(id))out.add(id);for(const m of n.body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g))for(const id of byTitle.get(normalize(m[1]))||[])if(id!==n.id)out.add(id);return [n.id,{body:wordCounts(n.body),title:wordCounts(n.title),all:wordCounts(n.title+' '+n.body),out}];}));
}
export function connectionEvidence(a,b,notes,selected=Object.keys(connectionCriteria),weights={},prepared=null){
 const enabled=new Set(selected),reasons=[];let score=0;
 const add=(key,value,text)=>{if(enabled.has(key)&&value>0){const weight=Number.isFinite(weights[key])?Math.max(0,weights[key]):1;score+=value*weight;if(weight>0)reasons.push(text);}};
 const ap=prepared?.get(a.id),bp=prepared?.get(b.id),ac=ap?.body||wordCounts(a.body),bc=bp?.body||wordCounts(b.body),common=[...ac.keys()].filter(w=>bc.has(w));
 if(common.length>=2)add('body',Math.min(18,common.reduce((n,w)=>n+Math.min(ac.get(w),bc.get(w),3),0)),'본문 공통어: '+common.slice(0,5).join(', '));
 const at=ap?.title||wordCounts(a.title),bt=bp?.title||wordCounts(b.title),titles=[...at.keys()].filter(w=>bt.has(w)||bc.has(w));for(const w of bt.keys())if(ac.has(w)&&!titles.includes(w))titles.push(w);
 add('title',Math.min(15,titles.length*5),'제목 관련어: '+titles.slice(0,5).join(', '));
 const aw=ap?.all||wordCounts(a.title+' '+a.body),bw=bp?.all||wordCounts(b.title+' '+b.body);
 const similar=synonymGroups.filter(group=>group.some(x=>aw.has(x))&&group.some(y=>bw.has(y)&&group.some(x=>x!==y&&aw.has(x))));
 add('synonyms',similar.length*5,'같은 뜻으로 묶은 표현: '+similar.map(g=>g.join(' / ')).join(', '));
 const tags=a.tags.filter(t=>b.tags.includes(t));add('tags',tags.length*8,'같은 태그: '+tags.join(', '));
 if(a.folder===b.folder)add('folder',4,'같은 노트북: '+a.folder);
 else if(a.folder.includes('/')&&b.folder.includes('/')&&a.folder.split('/').slice(0,-1).join('/')===b.folder.split('/').slice(0,-1).join('/'))add('folder',2,'같은 상위 노트북');
 else if(a.folder.split('/').at(-1)===b.folder.split('/').at(-1))add('folder',1,'노트북 끝 이름이 같음');
 if(enabled.has('direct')&&((ap?ap.out.has(b.id):targets(a,notes).includes(b.id))||(bp?bp.out.has(a.id):targets(b,notes).includes(a.id))))add('direct',100,'직접 연결 또는 본문의 기록 링크');
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
