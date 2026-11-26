// G 드라이브 이름 색인을 7판 분류로 나누고, 칸·소분류·주제별로 세고, 이름으로 찾는다.
// 파일 내용은 열지 않는다. 입력은 {names, parent, dir}: parent[i]는 부모 번호(맨 위는 -1)이고
// 부모 번호는 늘 자식보다 작다(폴더를 먼저 적고 안을 나중에 적는다).
import {CATS,SUBS,TOP_RULES,LOOSE_RULES,TOPICS,SENSITIVE,SUB_FOLDER_FALLBACK} from './drive-map-rules.js';

const UNSET=-1;
export const GOOGLE_EXT=/\.(gdoc|gsheet|gslides|gform|gdraw|gmap|gsite|gjam|gscript|gtable)$/i;

// 저장해 둔 색인에 나중에 민감하다고 정한 이름이 남아 있으면 그 이름과 안쪽을 통째로 뺀다(다시 훑지 않아도 바로 숨김).
export function cleanRaw(raw){
 const n=raw.names.length,drop=new Uint8Array(n);let any=false;
 for(let i=0;i<n;i++){const p=raw.parent[i];if((p>=0&&drop[p])||SENSITIVE.test(raw.names[i])){drop[i]=1;any=true;}}
 if(!any)return raw;
 const map=new Int32Array(n).fill(-1),names=[],parent=[],dir=[];
 for(let i=0;i<n;i++){if(drop[i])continue;map[i]=names.length;names.push(raw.names[i]);const p=raw.parent[i];parent.push(p>=0?map[p]:-1);dir.push(raw.dir[i]);}
 return {names,parent,dir:dir.join('')};
}

export function buildModel(raw){
 raw=cleanRaw(raw);
 const names=raw.names,N=names.length,parent=Int32Array.from(raw.parent),isDir=new Uint8Array(N);
 for(let i=0;i<N;i++)isDir[i]=raw.dir.charCodeAt(i)===49;
 const catIndex=new Map(CATS.map((c,i)=>[c.key,i]));
 const subNames=[],subIds=new Map();
 const subId=s=>{let id=subIds.get(s);if(id===undefined){id=subNames.length;subNames.push(s);subIds.set(s,id);}return id;};
 const ETC=subId('기타'),LOOSE=subId('낱개 파일'),TOP_LOOSE=subId('맨 위 낱개 파일');
 const dict=(cat,name,dir)=>{const s=SUBS[cat];if(s==='folder')return dir?subId(name):UNSET;if(!s)return UNSET;for(const [label,re] of s)if(re.test(name))return subId(label);return UNSET;};
 const cat=new Uint8Array(N),sub=new Int32Array(N),depth=new Uint8Array(N),rule=new Int16Array(N).fill(-1),mask=new Int32Array(N);
 const allTopics=new RegExp(TOPICS.map(t=>t[1].source).join('|'),'i');
 const topicsOf=name=>{if(!allTopics.test(name))return 0;let m=0;for(let t=0;t<TOPICS.length;t++)if(TOPICS[t][1].test(name))m|=1<<t;return m;};
 for(let i=0;i<N;i++){
  const p=parent[i],name=names[i],dir=isDir[i];
  if(p<0){
   depth[i]=0;
   if(dir){
    const r=TOP_RULES.findIndex(([re])=>re.test(name));
    if(r>=0){const v=TOP_RULES[r][1];rule[i]=r;cat[i]=catIndex.get(v.cat);sub[i]=v.sub?subId(v.sub):UNSET;}
    else{cat[i]=catIndex.get('00');sub[i]=subId(name);}
   }else{
    const hit=LOOSE_RULES.find(([re])=>re.test(name));
    if(hit){cat[i]=catIndex.get(hit[1]);sub[i]=hit[2]?subId(hit[2]):dict(hit[1],name,false);}
    else{cat[i]=catIndex.get('00');sub[i]=TOP_LOOSE;}
    if(sub[i]===UNSET)sub[i]=LOOSE;
   }
  }else{
   depth[i]=Math.min(255,depth[p]+1);
   const pr=depth[p]===0?rule[p]:-1,v=pr>=0?TOP_RULES[pr][1]:null;
   const hit=v?.children?.find(([re])=>re.test(name));
   if(hit){cat[i]=catIndex.get(hit[1]);sub[i]=hit[2]?subId(hit[2]):dict(hit[1],name,dir);}
   else{
    cat[i]=cat[p];sub[i]=sub[p];
    if(sub[i]===UNSET&&(dir||depth[i]===1)&&depth[i]<=4)sub[i]=dict(CATS[cat[i]].key,name,dir);
    if(sub[i]===UNSET&&dir&&depth[i]===1&&SUB_FOLDER_FALLBACK.has(CATS[cat[i]].key))sub[i]=subId(name);
   }
  }
  mask[i]=(p<0?0:mask[p])|topicsOf(name);
 }
 // 소분류를 못 정한 것은 「기타」, 폴더 이름을 소분류로 쓰는 칸의 맨 앞 낱개 파일은 「낱개 파일」.
 for(let i=0;i<N;i++)if(sub[i]===UNSET)sub[i]=(SUBS[CATS[cat[i]].key]==='folder'&&parent[i]>=0&&depth[i]===1)?LOOSE:ETC;
 // 개수: tot는 폴더 안 모든 파일, same은 같은 칸·소분류로 이어진 파일.
 const tot=new Int32Array(N),same=new Int32Array(N),first=new Int32Array(N).fill(-1),next=new Int32Array(N).fill(-1);let rootFirst=-1;
 for(let i=N-1;i>=0;i--){
  if(!isDir[i]){tot[i]+=1;same[i]+=1;}
  const p=parent[i];
  if(p>=0){tot[p]+=tot[i];if(cat[p]===cat[i]&&sub[p]===sub[i])same[p]+=same[i];next[i]=first[p];first[p]=i;}
  else{next[i]=rootFirst;rootFirst=i;}
 }
 // 칸·소분류마다: 파일 수, 묶음(그 칸이 시작되는 폴더나 파일).
 const groups=new Map(),catFiles=new Array(CATS.length).fill(0),catDirs=new Array(CATS.length).fill(0);
 const keyOf=i=>cat[i]*65536+sub[i];
 for(let i=0;i<N;i++){
  const k=keyOf(i);let g=groups.get(k);if(!g){g={cat:cat[i],sub:sub[i],label:subNames[sub[i]],files:0,anchors:[]};groups.set(k,g);}
  if(isDir[i])catDirs[cat[i]]++;else{g.files++;catFiles[cat[i]]++;}
  const p=parent[i];if(p<0||keyOf(p)!==k)g.anchors.push(i);
 }
 const topicFiles=new Array(TOPICS.length).fill(0),topicAnchors=TOPICS.map(()=>[]);
 for(let i=0;i<N;i++){
  const m=mask[i];if(!m)continue;const pm=parent[i]>=0?mask[parent[i]]:0;
  for(let t=0;t<TOPICS.length;t++){const b=1<<t;if(m&b){if(!isDir[i])topicFiles[t]++;if(!(pm&b))topicAnchors[t].push(i);}}
 }
 const low=names.map(n=>n.toLowerCase());
 return {N,names,low,parent,isDir,cat,sub,depth,mask,tot,same,first,next,rootFirst,subNames,groups,catFiles,catDirs,topicFiles,topicAnchors,
  files:catFiles.reduce((a,b)=>a+b,0),dirs:catDirs.reduce((a,b)=>a+b,0)};
}

export function pathOf(m,i){const parts=[];for(let x=i;x>=0;x=m.parent[x])parts.push(m.names[x]);return parts.reverse();}
export function childrenOf(m,i){const out=[];for(let c=i<0?m.rootFirst:m.first[i];c>=0;c=m.next[c])out.push(c);return out;}
export function subsOf(m,catIdx){return [...m.groups.values()].filter(g=>g.cat===catIdx).sort((a,b)=>a.label.localeCompare(b.label,'ko',{numeric:true}));}
// 묶음은 큰 것부터. 폴더는 같은 칸으로 이어진 파일 수, 파일은 1로 센다.
export function anchorsSorted(m,list){return list.slice().sort((a,b)=>m.same[b]-m.same[a]||m.depth[a]-m.depth[b]);}

// 낱말을 띄어 쓰면 모두 든 것만 찾는다. 첫 낱말은 이름에서, 나머지는 경로 전체에서 찾는다.
export function search(m,query,{limit=300}={}){
 const words=query.toLowerCase().split(/\s+/).filter(Boolean);if(!words.length)return {items:[],total:0};
 const [w0,...rest]=words,hits=[];let total=0;
 for(let i=0;i<m.N;i++){
  if(!m.low[i].includes(w0))continue;
  if(rest.length){const p=pathOf(m,i).join('/').toLowerCase();if(!rest.every(w=>p.includes(w)))continue;}
  total++;if(hits.length<5000)hits.push(i);
 }
 const score=i=>(m.low[i]===words.join(' ')?0:1)*4+(m.isDir[i]?0:2)+Math.min(m.depth[i],9)/10;
 hits.sort((a,b)=>score(a)-score(b)||m.names[a].localeCompare(m.names[b],'ko',{numeric:true}));
 return {items:hits.slice(0,limit),total};
}
