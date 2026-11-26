// 기록을 G 드라이브의 어느 폴더에 저장할지 고른다.
// 드라이브 지식맵의 묶음(폴더)마다 폴더 이름, 소분류, 두드러진 낱말, 주제를 보고
// 기록의 제목·태그·노트북·본문 앞부분과 가장 잘 맞는 폴더를 찾는다. 파일 내용은 보지 않는다.
// 맞는 곳이 없으면 드라이브 맨 위 「00_PKOS」 폴더에 둔다(없으면 만든다).
import {CATS,TOPICS} from './drive-map-rules.js';
import {pathOf} from './drive-map-model.js';
import {words} from './drive-relations.js';

export const INBOX_NAME='00_PKOS';
export const ATTACH_DIR='PKOS 첨부';
const INBOX_RE=/^(\d+[_ .-]*)?PKOS$/i;
// 사진·영상 원본, 앱·제출물 폴더, 보관 칸에는 기록을 넣지 않는다.
const SKIP_CATS=new Set(['07','98','99']);
const MIN_SCORE=4,MIN_SIGNALS=2,MAX_PREFIX=8;

const plain=text=>String(text||'').replace(/```[\s\S]*?```/g,' ').replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/[#>*_`~|\[\]]/g,' ');
// 한국어 낱말 뒤에 붙은 조사(「드론을」)도 앞부분으로 맞춰 보도록, 낱말마다 앞에서 2글자 이상 자른 조각을 함께 쓴다.
const variants=w=>{const out=[w];for(let n=Math.min(w.length-1,MAX_PREFIX);n>=2;n--)out.push(w.slice(0,n));return out;};

function noteText(note){
 return {
  strong:[note.title,...(Array.isArray(note.tags)?note.tags:[]),String(note.folder||'').split('/').pop()].join(' '),
  body:plain(String(note.body||'').slice(0,2000))
 };
}

/** 드라이브 모델과 연결 계산으로 「자리 찾기」 함수를 만든다. 모델이 바뀌면 다시 만든다. */
export function buildPlacer(m,rel){
 if(!m||!rel)return null;
 // 맞는 곳이 없을 때 쓰는 폴더: 맨 위에 「00_PKOS」가 있으면 그 이름, 없으면 새로 만들 이름
 let inbox=null;for(let c=m.rootFirst;c>=0;c=m.next[c])if(m.isDir[c]&&INBOX_RE.test(m.names[c])){inbox=m.names[c];break;}
 const inboxPlace={dir:[inbox||INBOX_NAME],create:inbox?1:0,label:(inbox||INBOX_NAME),reason:'맞는 폴더를 찾지 못해 00_PKOS 폴더에 둡니다.',inbox:true,score:0};
 const K=rel.nodes.length,index=new Map(),info=new Array(K);
 const add=(w,k,weight,kind)=>{let list=index.get(w);if(!list){list=[];index.set(w,list);}list.push([k,weight,kind]);};
 for(let k=0;k<K;k++){
  const d=rel.nodes[k],cat=CATS[m.cat[d]];
  const skip=!m.isDir[d]||SKIP_CATS.has(cat.key);
  const parts=pathOf(m,d),sub=m.subNames[m.sub[d]];
  info[k]={d,parts,cat,sub,skip,label:parts.join(' › ')};
  if(skip)continue;
  for(const w of words(m.names[d]))add(w,k,4,'name');
  for(const p of parts.slice(0,-1))for(const w of words(p))add(w,k,1.2,'path');
  if(sub&&sub!=='기타'&&sub!=='낱개 파일')for(const w of words(sub.replace(/^\d+_/,'')))add(w,k,2,'sub');
  for(const [w] of rel.top[k]||[])add(w,k,1.2,'word');
 }
 // 여러 폴더에 흔히 쓰이는 낱말(「수업」, 「연수」, 「자료」)은 덜 친다. 한두 폴더에만 있는 낱말이 자리를 정한다.
 const idf=new Map(),logK=Math.log2(Math.max(4,K));
 for(const [w,list] of index){const df=new Set(list.map(x=>x[0])).size;idf.set(w,df<=2?1:Math.max(.2,1-Math.log2(df)/logK));}
 // 묶음 안에 더 작은 묶음이 있으면 바깥 묶음보다 안쪽을 조금 더 친다.
 const hasInner=new Uint8Array(K);for(let k=0;k<K;k++)if(rel.container[k]>=0)hasInner[rel.container[k]]=1;

 function place(note){
  const {strong,body}=noteText(note);
  const scores=new Float64Array(K),why=new Map();
  const hit=(k,kind,w)=>{let r=why.get(k);if(!r){r={name:new Set(),word:new Set(),topic:new Set()};why.set(k,r);}(kind==='topic'?r.topic:kind==='name'||kind==='sub'?r.name:r.word).add(w);};
  const seen=new Set();
  const feed=(text,boost)=>{
   for(const raw of words(text)){
    for(const v of variants(raw)){
     const key=v+'|'+boost;if(seen.has(key))continue;seen.add(key);
     const list=index.get(v);if(!list)continue;
     const f=idf.get(v);for(const [k,weight,kind] of list){scores[k]+=weight*boost*f;if(f>=.45)hit(k,kind,v);}
     break; // 가장 긴 조각 하나만 센다(「드론을」→「드론」)
    }
   }
  };
  feed(strong,1);feed(body,.45);
  // 주제 사전: 기록에 든 주제가 그 묶음 파일 이름에도 있으면 더한다.
  const text=strong+' '+body;
  for(let t=0;t<TOPICS.length;t++){
   if(!TOPICS[t][1].test(text))continue;
   for(let k=0;k<K;k++){const n=rel.topicCount[k][t];if(n>0&&!info[k].skip){scores[k]+=Math.min(3,1.5+Math.log10(1+n));hit(k,'topic',TOPICS[t][0]);}}
  }
  const ranked=[];
  for(let k=0;k<K;k++){if(!scores[k]||info[k].skip)continue;ranked.push([k,scores[k]+(hasInner[k]?0:.3)+Math.min(m.depth[info[k].d],4)*.1]);}
  ranked.sort((a,b)=>b[1]-a[1]);
  const candidates=ranked.slice(0,6).map(([k,s])=>{
   const r=why.get(k)||{name:new Set(),word:new Set(),topic:new Set()},bits=[];
   if(r.name.size)bits.push('폴더 이름 '+[...r.name].slice(0,3).map(w=>'「'+w+'」').join(' '));
   if(r.topic.size)bits.push('주제 '+[...r.topic].slice(0,2).join('·'));
   if(r.word.size)bits.push('자주 쓰인 낱말 '+[...r.word].slice(0,3).map(w=>'「'+w+'」').join(' '));
   return {dir:info[k].parts,create:info[k].parts.length,label:info[k].label,cat:info[k].cat.key+' '+info[k].cat.label,reason:bits.join(' · ')||'흔한 낱말만 겹칩니다',score:Math.round(s*10)/10,node:k};
  });
  const best=candidates[0];
  // 근거(드문 낱말이나 주제)가 두 가지 이상 맞아야 그 폴더로 정한다. 낱말 하나만 겹치면 00_PKOS에 둔다.
  const r=best?why.get(best.node):null,signals=r?new Set([...r.name,...r.word]).size+r.topic.size:0;
  return {...(best&&best.score>=MIN_SCORE&&signals>=MIN_SIGNALS?best:inboxPlace),candidates,fallback:inboxPlace};
 }
 return {place,inbox:inboxPlace,count:K};
}

/** 저장할 때 쓰는 자리 문자열(「a/b/c」)과 새로 만들어도 되는 단계 수를 하나로. */
export const placeKey=p=>p.dir.join('/')+'|'+p.create;
export function parsePlaceKey(value){
 if(typeof value!=='string')return null;
 const at=value.lastIndexOf('|'),dir=value.slice(0,at).split('/').filter(Boolean),create=Number(value.slice(at+1));
 if(!dir.length||!Number.isInteger(create)||create<0||create>dir.length||dir.some(p=>p==='.'||p==='..'||/[<>:"\\|?*\x00-\x1f]/.test(p)))return null;
 return {dir,create};
}
