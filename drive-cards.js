// G 드라이브 묶음 카드: 지식맵의 묶음(뜻이 통하는 폴더)마다 읽기 전용 기록 카드를 만든다.
// 카드는 브라우저 저장소에 쓰지 않고 열 때마다 드라이브 색인에서 다시 만든다. 그래서 백업·폴더 저장·동기화에 섞이지 않는다.
// 모든 기록·서재 현황·지식맵·찾기에서 드라이브 자료를 기록처럼 찾고, 묶음끼리 이어진 이유를 따라간다.
import {CATS,TOPICS} from './drive-map-rules.js';
import {pathOf} from './drive-map-model.js';
import {reasonText} from './drive-relations.js';

export const DRIVE_ROOT_FOLDER='G 드라이브';
export const isDriveCard=n=>!!n&&typeof n.id==='string'&&n.id.startsWith('gd-');
// 경로로 늘 같은 번호를 만든다(다시 훑어도 같은 묶음은 같은 카드, 다른 기록이 걸어 둔 연결이 이어진다).
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);};
const MAX_FILES=60,MAX_LINKS=12;

export function driveFolderOf(catIndex){const c=CATS[catIndex];return DRIVE_ROOT_FOLDER+'/'+c.key+' '+c.label;}

export function buildDriveCards(m,rel,{at=Date.now(),root='내 드라이브'}={}){
 if(!m||!rel)return [];
 const K=rel.nodes.length,stamp=new Date(at||Date.now()).toISOString();
 const paths=rel.nodes.map(d=>pathOf(m,d));
 // 같은 이름 묶음이 여럿이면 위 폴더 이름을 붙여 구별한다.
 const nameCount=new Map();rel.nodes.forEach(d=>nameCount.set(m.names[d],(nameCount.get(m.names[d])||0)+1));
 const titles=rel.nodes.map((d,k)=>{const n=m.names[d];if(nameCount.get(n)<2)return n;const p=paths[k];return p.length>1?n+' · '+p[p.length-2]:n;});
 const ids=paths.map(p=>'gd-'+hash(p.join('/')));
 // 묶음마다 자기 몫 파일(다른 묶음 안쪽은 빼고)을 앞에서부터 모은다.
 const filesOf=new Array(K);
 for(let k=0;k<K;k++){
  const out=[],stack=[];for(let c=m.first[rel.nodes[k]];c>=0;c=m.next[c])stack.push(c);
  while(stack.length&&out.length<MAX_FILES){const i=stack.shift();if(rel.nodeIdx.has(i))continue;if(m.isDir[i]){for(let c=m.first[i];c>=0;c=m.next[c])stack.push(c);}else out.push(i);}
  filesOf[k]=out;
 }
 return rel.nodes.map((d,k)=>{
  const c=CATS[m.cat[d]],sub=m.subNames[m.sub[d]],p=paths[k];
  const topics=TOPICS.map((t,i)=>[t[0],rel.topicCount[k][i]]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>x[0]);
  const words=rel.top[k].slice(0,8).map(([w])=>w);
  const near=rel.neighbors[k].map(i=>rel.edges[i]).sort((a,b)=>b.score-a.score).slice(0,MAX_LINKS);
  const lines=[
   `> G 드라이브 묶음 · ${c.key} ${c.label} › ${sub} · 파일 ${rel.files[k].toLocaleString('ko-KR')}개`,
   '',`자리: \`${root}/${p.join('/')}\``];
  if(near.length){lines.push('','## 이어진 자료');for(const e of near){const o=e.a===k?e.b:e.a;lines.push(`- [[${titles[o]}]] — ${reasonText(e)}`);}}
  if(words.length)lines.push('','## 자주 쓰인 낱말',words.map(w=>'`'+w+'`').join(' '));
  const fl=filesOf[k];
  if(fl.length){lines.push('',`## 들어 있는 파일${rel.files[k]>fl.length?` (앞의 ${fl.length}개)`:''}`);for(const i of fl){const q=pathOf(m,i).slice(p.length);lines.push('- '+q.join(' / '));}}
  const tags=[...new Set([DRIVE_ROOT_FOLDER,sub!=='기타'&&sub!=='낱개 파일'?sub.replace(/^\d+_/,''):'',...topics].filter(Boolean))];
  return {id:ids[k],title:titles[k],body:lines.join('\n'),folder:driveFolderOf(m.cat[d]),tags,status:'활용',favorite:false,reviewDate:'',
   created:stamp,updated:stamp,revision:0,deleted:false,attachments:[],links:near.map(e=>ids[e.a===k?e.b:e.a]),
   kind:'drive',virtual:true,localPath:p.join('/'),driveItem:d,driveFiles:rel.files[k]};
 });
}
