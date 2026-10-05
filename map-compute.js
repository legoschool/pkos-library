import {connectionEvidence,prepareConnectionData,normalize,plainTag} from './core.js';
import {layoutGraph} from './graph-layout.js';
// Knowledge-map computation shared by the worker and the main-thread fallback:
// choose which records to show, find each record's strongest links, and lay them out.

export const MAP_ORDERS={balanced:'주제별 고르게',recent:'최근 수정',links:'연결 많은 순',content:'내용 많은 순'};
export const MAP_COUNTS=[100,200,500,1000,2000,0];// 0 = 전체
const EXACT_MAX=250,PER_NODE=3,CANDIDATES=14;
const topicKey=n=>n.folder||'수집함';
const volume=n=>(n.body||'').length+3000*(n.attachments||[]).length;

// Each record keeps its PER_NODE highest-scoring links (the same rule the map always used).
export function buildEdges(list,criteria,weights={}){
 if(list.length<2||!criteria.length)return [];
 const prepared=prepareConnectionData(list),seen=new Map();
 const keep=(i,scored)=>{scored.sort((a,b)=>b.score-a.score);for(const e of scored.slice(0,PER_NODE)){const key=e.a<e.b?e.a+'|'+e.b:e.b+'|'+e.a;if(!seen.has(key))seen.set(key,e);}};
 if(list.length<=EXACT_MAX){
  const all=[];for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const ev=connectionEvidence(list[i],list[j],list,criteria,weights,prepared);if(ev.score>0)all.push({a:list[i].id,b:list[j].id,...ev});}
  list.forEach((n,i)=>keep(i,all.filter(e=>e.a===n.id||e.b===n.id)));
  return [...seen.values()];
 }
 // Large maps: shortlist neighbours through shared rare words, tags, notebooks and direct links, then score only those.
 const n=list.length,index=new Map(list.map((x,i)=>[x.id,i])),postings=new Map(),tokens=list.map(()=>[]);
 const add=(i,t)=>{let p=postings.get(t);if(!p)postings.set(t,p=[]);if(p[p.length-1]!==i){p.push(i);tokens[i].push(t);}};
 list.forEach((x,i)=>{for(const t of x.tags||[])if(plainTag(t,x))add(i,'#'+normalize(t));add(i,'@'+topicKey(x));const d=prepared.get(x.id);for(const w of d.all.keys())add(i,w);});
 const linked=list.map(()=>new Set());
 list.forEach((x,i)=>{for(const id of prepared.get(x.id).out){const j=index.get(id);if(j!==undefined){linked[i].add(j);linked[j].add(i);}}});
 const maxDf=Math.max(40,Math.min(120,Math.round(n*.02))),WINDOW=8,score=new Float64Array(n),touched=[];
 for(let i=0;i<n;i++){
  for(const t of tokens[i]){
   const p=postings.get(t);if(p.length<2)continue;
   const w=1/Math.log(2+p.length);
   if(p.length<=maxDf){for(const j of p)if(j!==i){if(!score[j])touched.push(j);score[j]+=w;}}
   else{let lo=0,hi=p.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(p[mid]<i)lo=mid+1;else hi=mid;}
    for(let q=Math.max(0,lo-WINDOW);q<=Math.min(p.length-1,lo+WINDOW);q++){const j=p[q];if(j!==i){if(!score[j])touched.push(j);score[j]+=w*.5;}}}
  }
  for(const j of linked[i]){if(!score[j])touched.push(j);score[j]+=100;}
  const short=touched.sort((a,b)=>score[b]-score[a]).slice(0,CANDIDATES);
  for(const j of touched)score[j]=0;touched.length=0;
  const scored=[];for(const j of short){const ev=connectionEvidence(list[i],list[j],list,criteria,weights,prepared);if(ev.score>0)scored.push({a:list[i].id,b:list[j].id,...ev});}
  keep(i,scored);
 }
 return [...seen.values()];
}

// Records to draw. topic narrows to one top-level notebook; count 0 means all.
export function selectNotes(notes,{count=500,order='balanced',topic=''}={},criteria=[],weights={}){
 let pool=topic?notes.filter(n=>topicKey(n)===topic||topicKey(n).startsWith(topic+'/')):notes.slice();
 const total=pool.length,limit=count>0?Math.min(count,total):total;
 if(order==='recent')pool.sort((a,b)=>b.updated.localeCompare(a.updated));
 else if(order==='content')pool.sort((a,b)=>volume(b)-volume(a)||b.updated.localeCompare(a.updated));
 else if(order==='links'){
  const edges=buildEdges(pool,criteria.length?criteria:['direct','tags','folder','title','body'],weights),w=new Map(pool.map(n=>[n.id,(n.links||[]).length*50]));
  for(const e of edges){w.set(e.a,w.get(e.a)+e.score);w.set(e.b,w.get(e.b)+e.score);}
  pool.sort((a,b)=>w.get(b.id)-w.get(a.id)||b.updated.localeCompare(a.updated));
 }else{
  // 주제별 고르게: every notebook gets a share in proportion to its size (at least two), richest records first.
  const groups=new Map();for(const n of pool){const k=topicKey(n);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(n);}
  const inbound=new Map();for(const n of pool)for(const id of n.links||[])inbound.set(id,(inbound.get(id)||0)+1);
  const rich=n=>((n.links||[]).length+(inbound.get(n.id)||0))*400+volume(n);
  const keys=[...groups.keys()].sort((a,b)=>groups.get(b).length-groups.get(a).length||a.localeCompare(b,'ko'));
  for(const k of keys)groups.get(k).sort((a,b)=>rich(b)-rich(a)||b.updated.localeCompare(a.updated));
  const share=new Map(keys.map(k=>[k,Math.min(groups.get(k).length,Math.max(2,Math.floor(limit*groups.get(k).length/Math.max(1,total))))]));
  let picked=[];for(const k of keys)picked.push(...groups.get(k).slice(0,share.get(k)));
  if(picked.length>limit){// too many small notebooks: take shares round-robin so every topic still appears
   const lanes=keys.map(k=>groups.get(k).slice(0,share.get(k)));picked=[];for(let r=0;picked.length<limit;r++){let any=false;for(const lane of lanes){if(r<lane.length&&picked.length<limit){picked.push(lane[r]);any=true;}}if(!any)break;}
  }else if(picked.length<limit){const chosen=new Set(picked.map(n=>n.id));for(const k of keys)for(const n of groups.get(k))if(picked.length<limit&&!chosen.has(n.id)){picked.push(n);chosen.add(n.id);}}
  pool=picked;
 }
 return {list:pool.slice(0,limit),total};
}

export function computeMap(notes,opts,criteria,weights){
 const {list,total}=selectNotes(notes,opts,criteria,weights);
 const edges=buildEdges(list,criteria,weights),layout=layoutGraph(list.map(n=>n.id),edges);
 return {ids:list.map(n=>n.id),edges,positions:list.map(n=>{const p=layout.get(n.id);return [p.x,p.y];}),total};
}
