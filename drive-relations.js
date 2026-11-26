// G 드라이브 지식맵의 연결 계산.
// 드라이브를 「묶음」(뜻이 통하는 폴더 단위)으로 나누고, 묶음끼리 어디서 어떻게 이어지는지 이유와 함께 찾는다.
// 이어지는 이유는 세 가지다. 같은 이름의 파일이 두 곳에 있음, 같은 주제(주제 사전), 이름에 함께 쓰인 낱말.
// 파일 내용은 보지 않고 이름만 쓴다.
import {TOPICS} from './drive-map-rules.js';

const SPLIT=1200,MAX_DEPTH=3,MIN_FILES=2,TOP_WORDS=14,PER_NODE=6,MIN_SCORE=1.6;
const STOP=new Set(['사본','최종','수정','수정본','파일','자료','폴더','기타','모음','정리','버전','new','old','copy','final','the','and','for','of','to','in','이미지','image','img','사진','영상','동영상','png','jpg','jpeg','pdf','pptx','ppt','hwp','hwpx','docx','xlsx','gsheet','gdoc','gslides','gform','zip','mp4','mp3','txt','md','html','js','css','json','py','csv','에서','으로','하는','하기','위한','관련','및','의','을','를','이','가','은','는','에','와','과','도','안','외','등','제목','없음','untitled','제목없음','공유','원본','백업','임시','test','index','readme','main','src','assets','scripts','data','file','files','page','pages','temp','tmp','download','다운로드','초','중','고','학년','반','차시','1학기','2학기','학기','년','월','일','kakaotalk','카카오톡','캡처','screenshot','스크린샷','exported','크기변환','dsc','dcim','photo','video','output','www','node','lib','dist','build','thumb','thumbnail','icon','icons','font','fonts','media','sample','samples','ver','v1','v2','v3','편집','완성','최신','작업','작업본','초안','검토','확인','제출','결과','계획','계획서','보고서','양식','서식','안내','협의록']);
const GENERIC_FILE=/^(index|readme|main|app|style|script|package|package-lock|license|thumbs|desktop|image|img|photo|screenshot|untitled|제목 없음|제목없음|새 문서|새 텍스트 문서|copy|사본|\d+)(\s*\(\d+\))?\.[a-z0-9]+$/i;

const words=name=>name.toLowerCase().replace(/\.[a-z0-9]{1,6}$/,'').split(/[^0-9a-z가-힣]+/).filter(w=>w.length>=2&&!STOP.has(w)&&!/^\d+$/.test(w)&&!/^20\d\d/.test(w)&&!/^\d+(차|회|기|번|장|강|편|부)$/.test(w)&&!(/\d/.test(w)&&/[a-z]/.test(w))&&!/^[a-z]{2}$/.test(w));
// 「(1)」, 「의 사본」, 「사본 -」 같은 꼬리를 떼어 같은 파일을 알아본다.
const sameKey=name=>{const n=name.toLowerCase().replace(/^사본\s*-\s*/,'').replace(/의 사본/g,'').replace(/\s*\(\d+\)(?=\.[a-z0-9]+$|$)/,'').replace(/\s+/g,' ').trim();return n.replace(/\.[a-z0-9]+$/,'').length>=6&&!GENERIC_FILE.test(n)?n:'';};

export function buildRelations(m){
 const N=m.N,isNode=new Uint8Array(N),nodes=[];
 // 1) 묶음 고르기: 맨 위 폴더부터 보고, 파일이 많고 아래 폴더가 여럿이면 한 단계씩 나눈다.
 const expand=d=>{
  const kids=[];for(let c=m.first[d];c>=0;c=m.next[c])if(m.isDir[c]&&m.tot[c]>=MIN_FILES)kids.push(c);
  if(m.tot[d]>SPLIT&&m.depth[d]<MAX_DEPTH&&kids.length>=2){isNode[d]=2;nodes.push(d);kids.forEach(expand);}
  else if(m.tot[d]>=MIN_FILES){isNode[d]=1;nodes.push(d);}
 };
 for(let c=m.rootFirst;c>=0;c=m.next[c])if(m.isDir[c])expand(c);
 const nodeIdx=new Map(nodes.map((d,k)=>[d,k])),owner=new Int32Array(N).fill(-1);
 for(let i=0;i<N;i++){const p=m.parent[i];owner[i]=isNode[i]?nodeIdx.get(i):p>=0?owner[p]:-1;}
 const K=nodes.length,files=new Int32Array(K),topicCount=nodes.map(()=>new Int32Array(TOPICS.length)),tf=nodes.map(()=>new Map()),sameMap=new Map();
 // 묶음을 담은 위 묶음(나뉜 폴더)은 연결 계산에서 서로 겹치지 않게 「자기 몫」만 센다.
 const container=new Int32Array(K).fill(-1);
 nodes.forEach((d,k)=>{const p=m.parent[d];if(p>=0&&owner[p]>=0)container[k]=owner[p];});
 for(let i=0;i<N;i++){
  const k=owner[i];if(k<0||isNode[i])continue;
  const name=m.names[i];
  for(const w of words(name)){const t=tf[k];t.set(w,(t.get(w)||0)+(m.isDir[i]?3:1));}
  if(!m.isDir[i]){
   files[k]++;const mk=m.mask[i];if(mk)for(let t=0;t<TOPICS.length;t++)if(mk&(1<<t))topicCount[k][t]++;
   const s=sameKey(name);if(s){let set=sameMap.get(s);if(!set){set=new Set();sameMap.set(s,set);}if(set.size<8)set.add(k);}
  }
 }
 nodes.forEach((d,k)=>{for(const w of words(m.names[d]))tf[k].set(w,(tf[k].get(w)||0)+6);});
 // 2) 묶음마다 두드러진 낱말(여러 묶음에 고루 쓰이는 낱말은 덜 친다).
 const df=new Map();tf.forEach(t=>t.forEach((_,w)=>df.set(w,(df.get(w)||0)+1)));
 const top=tf.map(t=>[...t].filter(([w])=>{const f=df.get(w);return f>=2&&f<=Math.max(8,K*.12);}).map(([w,c])=>[w,Math.log(1+c)*Math.log(K/df.get(w))]).sort((a,b)=>b[1]-a[1]).slice(0,TOP_WORDS));
 // 3) 쌍마다 이유를 모은다.
 const pairs=new Map(),pairOf=(a,b)=>{if(a===b)return null;if(a>b)[a,b]=[b,a];const key=a*65536+b;let p=pairs.get(key);if(!p){p={a,b,same:0,sample:[],topics:[],words:[]};pairs.set(key,p);}return p;};
 const related=(a,b)=>container[a]===b||container[b]===a;
 sameMap.forEach((set,name)=>{if(set.size<2||set.size>6)return;const arr=[...set];for(let x=0;x<arr.length;x++)for(let y=x+1;y<arr.length;y++){if(related(arr[x],arr[y]))continue;const p=pairOf(arr[x],arr[y]);p.same++;if(p.sample.length<4)p.sample.push(name);}});
 for(let t=0;t<TOPICS.length;t++){
  const has=[];for(let k=0;k<K;k++)if(topicCount[k][t]>=2||(topicCount[k][t]>=1&&files[k]<=6))has.push(k);
  if(has.length>160)has.sort((a,b)=>topicCount[b][t]-topicCount[a][t]).length=160;
  for(let x=0;x<has.length;x++)for(let y=x+1;y<has.length;y++){if(related(has[x],has[y]))continue;pairOf(has[x],has[y]).topics.push(t);}
 }
 const byWord=new Map();top.forEach((list,k)=>list.forEach(([w])=>{let a=byWord.get(w);if(!a){a=[];byWord.set(w,a);}a.push(k);}));
 byWord.forEach((list,w)=>{for(let x=0;x<list.length;x++)for(let y=x+1;y<list.length;y++){if(related(list[x],list[y]))continue;pairOf(list[x],list[y]).words.push(w);}});
 const score=p=>(p.same>=2?2+3*Math.min(1,p.same/20):p.same?.7:0)+Math.min(3,p.topics.length*1.2)+Math.min(3.5,p.words.length*.9);
 const all=[...pairs.values()].map(p=>({...p,score:score(p)})).filter(p=>p.score>=MIN_SCORE);
 // 4) 묶음마다 가장 센 연결 몇 개만 남겨 지도가 실타래가 되지 않게 한다.
 const per=nodes.map(()=>[]);all.forEach(p=>{per[p.a].push(p);per[p.b].push(p);});
 const keep=new Set();per.forEach(list=>{list.sort((x,y)=>y.score-x.score);list.slice(0,PER_NODE).forEach(p=>keep.add(p));});
 const edges=[...keep].sort((x,y)=>y.score-x.score);
 const neighbors=nodes.map(()=>[]);edges.forEach((e,i)=>{neighbors[e.a].push(i);neighbors[e.b].push(i);});
 return {nodes,files,topicCount,top,container,edges,neighbors,owner,nodeIdx};
}

// 연결 이유를 사람이 읽는 말로.
export function reasonText(e){
 const out=[];
 if(e.same)out.push('같은 이름 파일 '+e.same+'개');
 if(e.topics.length)out.push('주제 '+e.topics.slice(0,3).map(t=>TOPICS[t][0]).join('·'));
 if(e.words.length)out.push('낱말 '+e.words.slice(0,4).map(w=>'「'+w+'」').join(' '));
 return out.join(' · ');
}
