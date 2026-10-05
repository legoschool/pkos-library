import {normalize,excerpt} from './core.js';
// 서재 현황·찾기와 조합에 쓰는 자료 속성(출처·연도·형식·영역·주제).
// 카드에 써 넣지 않고 서재를 열 때 계산한다. 카드 동기화는 사용자가 고치지 않은 카드만 새 판으로 바꾸기 때문이다(store.js mergeBackup).
export const KINDS={note:'직접 쓴 기록',doc:'문서',blog:'블로그 글',video:'영상',hub:'묶음·영역'};
export const KIND_ORDER=['note','doc','blog','video','hub'];
const EXT={hwp:'한글',hwpx:'한글',pdf:'PDF',ppt:'PPT',pptx:'PPT',doc:'워드',docx:'워드',odt:'문서',rtf:'문서',xls:'엑셀',xlsx:'엑셀',xlsm:'엑셀',csv:'엑셀',md:'글',txt:'글',html:'웹',htm:'웹',png:'사진',jpg:'사진',jpeg:'사진',gif:'사진',webp:'사진',heic:'사진',mp3:'소리',m4a:'소리',wav:'소리',mp4:'영상',mov:'영상',webm:'영상'};
const FORMAT_TAGS=new Set(['한글','PDF','PPT','워드','엑셀','문서','글','웹','사진','소리','영상']);
const YEAR=/^(19|20)\d\d$/;
// 주제 낱말 규칙의 기본값. 레고학교 서재에서 쓰던 21가지이고, 설정의 「주제 규칙」에서 고친다.
export const THEME_PRESET=[
 ['ai','AI·인공지능','인공지능, AI, GPT, 챗GPT, chatGPT, 제미니, 제미나이, Gemini, bard, 노트북LM, 노트북 LM, 뤼튼, wrtn, 프롬프트, 생성형, 머신러닝, 딥러닝, AIDT, AI-DT, 바이브코딩, 바이브 코딩, SUNO, gneGPT, 나노바나나, AIEDAP, DALL-E, Claude, 클로드, 써로게이트'],
 ['sw','SW·코딩·로봇','SW, 소프트웨어, 코딩, 엔트리, 스크래치, 로봇, 네오봇, 스파이크, 부스트, 마이크로비트, 코들, IOT, 파이썬, 웹앱, 앱스 스크립트, 플랫폼, 해커톤, 자율주행, 구글 시트, LMS, uKit, 프로그래밍, 만든 도구'],
 ['lego','레고·스톱모션·영상','레고, LEGO, 스톱모션, 영상, 키네마스터, 브루, vrew, 캡컷, 유튜브, 미니피규어, 촬영, 편집, 송메이커'],
 ['drone','드론','드론'],
 ['meta','메타버스·ZEP','메타버스, ZEP, 젭, 제페토, zepeto, wecan, 게더, 메타스쿨, 에듀버스, 오큘러스, VR'],
 ['digital','디지털 리터러시·기초소양','디지털 리터러시, 디지털리터러시, 기초소양, 미디어 리터러시, Digital Literacy, 디지털 소양, 타자, 아이북, 키보드, 윈도우, 인터랜드, 정보통신 윤리, 정보통신윤리, 가짜뉴스, 저작권, 개인정보, 디지털 마을, 스마트 단말기, 스마트단말기, 아이톡톡, 디지털 역량, 디지털새싹, 에듀테크, 캔바, canva, 웨일, 구글, 미리캔버스, 디지털 전환, 디지털 교과서, 로그인, 북마크, 지딜, G-DEAL'],
 ['coop','협동학습·배움중심·혁신학교','협동학습, 배움중심, 배움 중심, 배움의 공동체, 혁신학교, 행복학교, 하브루타, 수업명사, 수업전문가, 새학년 세미나, 모둠, 행복나눔학교'],
 ['sel','사회정서·관계·생활교육','사회정서, 아이함께, 발도르프, 감정코칭, 에니어그램, 애니어그램, PDC, 학급회의, 갈등, 자존감, 학교폭력, 대안교실, 상담, 존중, 교육활동보호, 교육활동 보호, 교육활동 침해, ^인성, 마음공부, 공감, 생활지도, 두드림, 성장 상처, 발달'],
 ['student','학생자치·민주시민','학생자치, 학생의회, 학생회, 자치, 선거, 민주시민, 참정권, 국회, 페일콘, 자원봉사'],
 ['curr','교육과정·평가·학습과학','교육과정, 백워드, 평가, 수행평가, 개념기반, 학교자율시간, 학습과학, 질문, 수업혁신, 수업 설계, 교수학습, 깊이있는 학습, PBL, 성취기준'],
 ['science','과학·환경·실과·보건','과학, 기후, 환경, 탄소, ^실과, 동물, 미니카, 생태, 전기자동차, 식물, 광합성, STEAM, 텃밭, 보건, 성교육, 안전, 자동차, ^화성, 현미경'],
 ['reading','독서·글쓰기·국어','독서, 그림책, 도서, 슬로리딩, 온작품, 온책, 글쓰기, ^국어, 문해력, 소설, 시화, 한글날, 부기, BOOKIE, 편지'],
 ['career','진로·미래교육','진로, 직업, 미래교육, 미래형, 미래 사회, 미래사회, 4차산업, 생애주기, 미래학교, 미래수업, 기업가, 공간혁신'],
 ['grad','연구·대학원','대학원, 박사과정, 논문, 연구학교, 연구대회, 빅카인즈, 빅데이터, 워드클라우드, 연구노트, OECD, 선도학교, 모델학교, 전학공, 연구'],
 ['play','교실놀이·체육','피구, 축구, 놀이, 체육, 교실놀이, 쏭쌤, 운동회, 계주, 배구, 스키, 줄넘기, 점핑'],
 ['train','연수·강의·컨설팅','연수, 강의, 세미나, 워크숍, 컨설팅, 특강, 웨비나, 포럼, 한마당, 박람회, 연구회, 협의회, 지원단, 위원'],
 ['class','학급 운영·수업 일지','학기초, 첫만남, 학급, 공개수업, 가족사랑, 체험학습, 수업 디테일, 영화 활용, 학급신문, 수학여행, 전학생, 답사'],
 ['society','사회·시사','코로나, 저출산, 혐오, 차별, 통일, 특수 학교, 연금, 자본주의, 시사기획, 문화유산, 세바시'],
 ['self','공부법·자기관리','시간 관리, 시간관리, 학습법, 불안, 자기관리'],
 ['policy','교육정책·학교 업무','교육부, 업무 계획, 교무실, 업무, 정책, ^고시, 생기부, 학부모, 교육전문직'],
 ['record','기록·지식관리','PKOS, 개인지식, 기록의 가치, 지식관리, 인수인계'],
].map(([id,label,words])=>({id,label,words:words.split(',').map(s=>s.trim()).filter(Boolean)}));
// 영문 짧은 낱말(AI, SW, VR …)은 낱말 경계로만 맞춘다. "email", "Daily" 같은 말에 AI가 붙지 않게.
// 앞에 ^를 붙인 낱말은 앞에 한글이 붙지 않은 경우만 맞춘다(^실과는 「실과 수업」에는 맞고 「사실과」에는 안 맞음).
export function compileRules(rules){
 return (Array.isArray(rules)?rules:THEME_PRESET).filter(r=>r&&r.id&&r.label&&Array.isArray(r.words)).map(r=>({id:String(r.id),label:String(r.label),
  tests:r.words.map(w=>normalize(w)).filter(Boolean).map(w=>w.startsWith('^')&&w.length>1?new RegExp('(^|[^가-힣])'+w.slice(1).replace(/[.*+?()[\]{}|\\]/g,'\\$&')):/^[a-z0-9-]{1,4}$/.test(w)?new RegExp('(^|[^a-z0-9])'+w.replace(/-/g,'\\-')+'([^a-z0-9]|$)'):w)}));
}
export const themesOf=(text,compiled)=>{const t=normalize(text);return compiled.filter(r=>r.tests.some(w=>typeof w==='string'?t.includes(w):w.test(t))).map(r=>r.id);};
export function kindOf(n){
 if(KINDS[n.kind])return n.kind;
 const t=n.tags||[];
 if(t.includes('묶음')||t.includes('영역'))return 'hub';
 const u=(n.sourceUrl||'')+' '+(n.openUrl||'');
 if(/youtu\.?be/.test(u))return 'video';
 if(/blog\.naver\.com|tistory\.com|brunch\.co\.kr/.test(u))return 'blog';
 if(n.sourcePath||n.localPath||/^https:\/\/(drive|docs)\.google\.com/.test(n.openUrl||''))return 'doc';
 return 'note';
}
// 연도: 직접 적힌 날짜 → 연도 태그 → 제목 앞 연도 → 만든 날짜. 문서 카드의 만든 날짜는 파일 수정일이라 「추정」으로 둔다.
export function yearOf(n,kind=kindOf(n)){
 const d=/^(\d{4})-\d\d/.exec(n.date||'');if(d)return {year:+d[1],guess:false};
 for(const t of n.tags||[])if(YEAR.test(t))return {year:+t,guess:false};
 const p=/^((?:19|20)\d\d)[_. -]/.exec(n.title||'');if(p)return {year:+p[1],guess:false};
 if(kind==='hub')return {year:0,guess:false};
 const c=Date.parse(n.created);
 return Number.isFinite(c)?{year:new Date(c).getFullYear(),guess:kind==='doc'}:{year:0,guess:false};
}
export function formatOf(n,kind=kindOf(n)){
 if(kind!=='doc')return '';
 for(const t of n.tags||[])if(FORMAT_TAGS.has(t))return t;
 const m=/\.([a-z0-9]{1,5})$/i.exec(n.sourcePath||n.localPath||n.title||'');
 return (m&&EXT[m[1].toLowerCase()])||'기타';
}
// 주제 낱말을 찾는 글: 출처를 나타내는 태그(블로그·유튜브·영역·묶음)와 블로그·영상의 노트북 이름은 뺀다. 「유튜브」가 모든 영상에 영상 주제를 붙이지 않게.
const SOURCE_TAGS=new Set(['블로그','유튜브','블로그 비공개','영역','묶음']);
const themeText=(n,kind)=>{const tags=(n.tags||[]).filter(t=>!SOURCE_TAGS.has(t)).join(' ');
 if(kind==='blog'||kind==='video')return n.title+' '+tags;
 const info=Array.isArray(n.info)?n.info.map(r=>Array.isArray(r)?String(r[1]??''):'').join(' '):null;
 if(kind==='doc')return [n.title,tags,n.folder,info??String(n.body||'').slice(0,400)].join(' ');
 if(kind==='hub')return [n.title,tags,n.folder,info||'',String(n.body||'').slice(0,400)].join(' ');
 return [n.title,tags,n.folder,kind==='note'?String(n.body||'').slice(0,1000):''].join(' ');};
// 기록마다 한 줄씩: 출처, 연도, 형식, 영역(첫 노트북), 묶음(두 단계 노트북), 주제.
// 파일 수정일로 짐작한 연도는 year에 넣지 않고 yearGuess에 둔다. 연도 표·연도 조건은 확실한 연도만 센다.
export function buildIndex(notes,rules){
 const compiled=compileRules(rules),rows=[],linked=new Set(),today=new Date().toLocaleDateString('en-CA');
 const live=notes.filter(n=>!n.deleted);
 for(const n of live)for(const id of n.links||[])linked.add(id);
 for(const n of live){
  const kind=kindOf(n),y=yearOf(n,kind),parts=(n.folder||'수집함').split('/');
  rows.push({id:n.id,kind,year:y.guess?0:y.year,yearGuess:y.guess?y.year:0,guess:y.guess&&!!y.year,format:formatOf(n,kind),area:parts[0],group:parts.slice(0,2).join('/'),themes:themesOf(themeText(n,kind),compiled),tags:n.tags||[],
   unlinked:!(n.links||[]).length&&!linked.has(n.id),due:!!n.reviewDate&&n.reviewDate<=today,thin:kind==='doc'&&excerpt(n.body).length<300,untagged:!(n.tags||[]).length});
 }
 return {rows,byId:new Map(rows.map(r=>[r.id,r])),rules:compiled,label:Object.fromEntries(compiled.map(r=>[r.id,r.label]))};
}
// 조건: {kinds,y0,y1,areas,formats,themes,themeMode,tags,tagMode,special}
export const condEmpty=c=>!c||!Object.entries(c).some(([k,v])=>Array.isArray(v)?v.length:k==='themeMode'||k==='tagMode'?false:!!v);
export function matchCond(r,c){
 if(!r)return false;
 if(c.kinds?.length&&!c.kinds.includes(r.kind))return false;
 if(c.y0&&(!r.year||r.year<c.y0))return false;
 if(c.y1&&(!r.year||r.year>c.y1))return false;
 if(c.areas?.length&&!c.areas.includes(r.area))return false;
 if(c.formats?.length&&!c.formats.includes(r.format))return false;
 if(c.themes?.length){const has=t=>r.themes.includes(t);if(c.themeMode==='or'?!c.themes.some(has):!c.themes.every(has))return false;}
 if(c.tags?.length){const has=t=>r.tags.includes(t);if(c.tagMode==='or'?!c.tags.some(has):!c.tags.every(has))return false;}
 if(c.special==='untagged'&&!(r.untagged&&!r.themes.length))return false;
 if(c.special==='unlinked'&&!r.unlinked)return false;
 if(c.special==='due'&&!r.due)return false;
 if(c.special==='thin'&&!r.thin)return false;
 if(c.special==='guess'&&!r.guess)return false;
 return true;
}
export const SPECIALS={untagged:'태그·주제 없는 기록',unlinked:'연결이 없는 기록',due:'다시 볼 날이 지난 기록',thin:'본문 앞부분이 없는 문서',guess:'연도를 추정한 기록'};
const count=(m,k,n=1)=>m.set(k,(m.get(k)||0)+n);
const sorted=m=>[...m.entries()].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),'ko'));
// 조건 줄 단추의 숫자: 지금 목록(rows)에서 그 값을 더했을 때 남는 수
export function facetCounts(rows){
 const k=new Map(),y=new Map(),a=new Map(),f=new Map(),t=new Map(),g=new Map();
 for(const r of rows){count(k,r.kind);if(r.year)count(y,r.year);count(a,r.area);if(r.format)count(f,r.format);for(const x of r.themes)count(t,x);for(const x of r.tags)if(!YEAR.test(x))count(g,x);}
 return {kinds:k,years:new Map([...y.entries()].sort((p,q)=>p[0]-q[0])),areas:sorted(a),formats:sorted(f),themes:sorted(t),tags:sorted(g)};
}
// 한 기록에 함께 붙은 주제 쌍. 한 주제가 목록을 다 차지하지 않게 주제마다 세 번까지만 싣는다.
export function themePairs(rows,minEach){
 const tot=new Map(),co=new Map();
 for(const r of rows){for(const t of r.themes)count(tot,t);const s=[...new Set(r.themes)].sort();for(let i=0;i<s.length;i++)for(let j=i+1;j<s.length;j++)count(co,s[i]+'|'+s[j]);}
 const cap=(list,k=10)=>{const seen=new Map(),out=[];for(const p of list){if((seen.get(p.a)||0)<3&&(seen.get(p.b)||0)<3){out.push(p);count(seen,p.a);count(seen,p.b);}if(out.length===k)break;}return out;};
 const common=cap(sorted(co).map(([k,n])=>{const [a,b]=k.split('|');return {a,b,n};}));
 const ids=sorted(tot).map(([t])=>t),rare=[];
 for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const a=ids[i],b=ids[j];if(tot.get(a)>=minEach&&tot.get(b)>=minEach){const n=co.get([a,b].sort().join('|'))||0;if(n<=1)rare.push({a,b,n,na:tot.get(a),nb:tot.get(b)});}}
 rare.sort((p,q)=>p.n-q.n||Math.min(q.na,q.nb)-Math.min(p.na,p.nb));
 return {common,rare:cap(rare),totals:tot};
}
// 서재 현황에 쓰는 숫자 묶음
export function overviewStats(index){
 const rows=index.rows,years=[...new Set(rows.map(r=>r.year).filter(Boolean))].sort((a,b)=>a-b);
 const byKind=new Map(KIND_ORDER.map(k=>[k,0]));for(const r of rows)count(byKind,r.kind);
 const yearRows=years.map(y=>{const rs=rows.filter(r=>r.year===y),k=new Map(),th=new Map();for(const r of rs){count(k,r.kind);for(const t of r.themes)count(th,t);}return {year:y,total:rs.length,kinds:k,themes:sorted(th).slice(0,3)};});
 const firstYear=new Map();for(const r of rows)if(r.year&&r.group.includes('/')&&(!firstYear.has(r.group)||r.year<firstYear.get(r.group)))firstYear.set(r.group,r.year);
 for(const yr of yearRows)yr.started=[...firstYear.entries()].filter(([,y])=>y===yr.year).map(([g])=>g.split('/').pop());
 const themeTot=new Map(),themeYear=new Map(),areaTot=new Map(),areaYear=new Map(),formats=new Map();
 for(const r of rows){for(const t of r.themes){count(themeTot,t);if(r.year)count(themeYear,t+'|'+r.year);}count(areaTot,r.area);if(r.year)count(areaYear,r.area+'|'+r.year);if(r.format)count(formats,r.format);}
 const minEach=Math.max(5,Math.round(rows.length*0.005));
 return {total:rows.length,byKind,years,yearRows,themes:sorted(themeTot),themeYear,areas:sorted(areaTot),areaYear,formats:sorted(formats),pairs:themePairs(rows,minEach),minEach,
  special:Object.fromEntries(Object.keys(SPECIALS).map(k=>[k,rows.filter(r=>matchCond(r,{special:k})).length])),
  notebooks:new Set(rows.map(r=>r.group)).size,tags:new Set(rows.flatMap(r=>r.tags.filter(t=>!YEAR.test(t)))).size};
}
// 같은 시기·같은 주제: 연도가 같고(앞뒤 1년) 주제가 하나 이상 겹치는 기록
export function sameTime(row,index,limit=5){
 if(!row||!row.year||!row.themes.length)return [];
 return index.rows.filter(r=>r.id!==row.id&&r.year&&Math.abs(r.year-row.year)<=1&&r.kind!=='hub').map(r=>({r,s:r.themes.filter(t=>row.themes.includes(t)).length,d:Math.abs(r.year-row.year)})).filter(x=>x.s).sort((a,b)=>b.s-a.s||a.d-b.d).slice(0,limit);
}
// AI에게 건넬 글: 질문, 고른 기록의 날짜·출처·노트북·제목·주소, 고른 범위만큼의 본문
export function handoffText(list,index,{question='',include='meta',limit=0}={}){
 const pick=limit?list.slice(0,limit):list,lines=['# PKOS에서 고른 기록 '+pick.length.toLocaleString()+'개',''];
 if(question.trim())lines.push('## 질문','',question.trim(),'');
 lines.push('## 기록','');
 for(const n of pick){
  const r=index.byId.get(n.id),url=/^https?:\/\//.test(n.sourceUrl||'')?n.sourceUrl:/^https?:\/\//.test(n.openUrl||'')?n.openUrl:'';
  lines.push('### '+(n.title||'제목 없는 기록'),'',[r?.year||(r?.yearGuess?r.yearGuess+'(추정)':''),KINDS[r?.kind]||'',n.folder,r?.themes.map(t=>index.label[t]).join(', ')].filter(Boolean).join(' · ')+(url?'\n'+url:''));
  if(include==='excerpt'){const e=excerpt(n.body).slice(0,300);if(e)lines.push('',e+(excerpt(n.body).length>300?' …':''));}
  if(include==='full'&&n.body.trim())lines.push('',n.body.trim());
  lines.push('');
 }
 return lines.join('\n');
}
