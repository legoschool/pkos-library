// 게시 전 개인정보 검사. 글은 이 브라우저 안에서만 읽고 어디에도 보내지 않는다.
// 규칙 원본: 06_대학원 pkos_자료변환기 engine/privacy.py(학교 문서용)와 privacy_guard.py(논문·수업 자료 오탐 보정).
// 파이썬 \b 는 한글을 낱말로 보지만 자바스크립트 \b 는 영문·숫자만 보므로 앞뒤 확인을 직접 적었다.

export const KINDS=['주민등록번호','카드번호','전화번호','이메일','계좌번호','주소','생년월일','차량번호','이름'];

const SURNAMES=new Set('김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길위표명기반라왕금옥육인맹제모');
const COMPOUND=['남궁','황보','제갈','사공','선우','서문','독고','동방'];
const STOP=new Set(('김치 이번 이것 이후 이전 이상 이하 이내 이때 이런 이날 정도 정리 정보 조사 조치 장소 장면 한국 한번 한글 한다 고등 고민 문의 문제 양식 양성 손님 백지 허용 유지 유의 남녀 심리 하나 하기 성적 성장 성과 차이 차시 주요 주제 우리 구성 구분 민원 진행 지도 지원 엄격 원인 원격 천천 방법 방과 공고 공유 현재 현장 함께 변경 여기 추가 도움 소개 석식 선택 설명 마련 길이 위해 위한 표시 명단 기록 반드 라도 왕성 금지 옥상 육성 인원 제출 제작 모두 모집 장기 박수 최고 최종 강사 강의 학생 교사 학교 교육 연수 '+
 '성명 이름 직위 직급 소속 주소 전화 번호 연락 생년 월일 계좌 은행 예금 서명 날인 비고 합계 금액 기간 대상 내용 제목 담당 확인 신청 동의 수집 현황 장학사 차담회 위원장 지정 기능 진의 결과 계획 운영 평가 지침 예산 실적 추진 협의 심의 보고 부서 학년 학급 교시 단원 영역 과목 학기 연차 참석 출장 복무 근무 휴가 연가 조퇴 출석 결석 지각 제공 활용 적용 구축 개선 강화 확대 지속 완료 예정 안내 안내장 이동 도박 선물 노트 우선 여러분 주도성 선발 설문 만족 협조 관찰 배치 발송 게시 작품 교실 '+
 '마우스 노트북 모니터 키보드 스피커 프린터 유튜브 인터넷 파이썬 브라우저 서버실 디스크 메모리 라디오 위젯 변수명 함수명 파일명 폴더명 모듈명 문자열 정수형 실수형 배열형 조건문 반복문 조건식 주석문 오류값 반환값 최소값 최대값 초기값 기본값 구조체 매개체 저장소 실행문 선언문 연산식 라벨 박스 원본 모둠 모둠원 기입란 소집단 강의실 강의안 지도자 신청자 제출물 채점표 문항수 정답률 오답률 방향성 심화반 백업본 안내문 전환점 최적화 참가자 발표자 학습자 교수자 대상자 연구자 평가지 정답지 배부물 유인물 설계자 제공자 진단자 설명자 전달자 조정자').split(' '));
const TAIL='을를은는이가의에도만과와로며고서요다죠함및후꼭님등외내별용측간';
const NONPERSON_TAIL='(?:에서|로써|하[는다며여였지기게]|했|한다|할|한(?!테)|해[서야도]|적(?:인|으로|이)?|화(?:된|하|를|가|는)?|성(?:이|을|은|의|과)?|된|되[어는고지며]|될|시키|스러|롭)';
const STRONG=['성명','성 명','이름','예금주','신청인','작성자','대표자','담당자','책임자','인솔자','지도교사'];
const WEAK=['담당','강사','교사','학생','선생님','보호자','학부모','참가자','수강생','발표자','위원','부장'];
// 기록장에 흔한 「이름 + 호칭」 꼴(김민준 학생이, 박서연 어머님께). 원본 규칙에는 없어서 더했다
const AFTER=['학생','어린이','선생님','어머님','아버님','어머니','아버지','학부모','보호자'];
const BANK='(?:[가-힣]{2,6}(?:은행|저축은행|상호금융|증권|생명|화재)|[가-힣]{2,4}뱅크|국민|신한|우리|하나|농협|기업|산업|수협|신협|새마을|우체국|카카오|토스|케이|씨티|SC제일|제일|부산|경남|대구|광주|전북|제주|IBK|KB|NH|BNK|DGB)';
// 이름 뒤에 올 수 있는 조사. 이름 바로 뒤에 다른 한글이 붙으면 이름으로 보지 않되 이것들은 허용한다
const END='(?=$|[^가-힣]|(?:이|가|은|는|을|를|의|도|과|와|랑|께|께서|에게|한테|이가|이는|이를|이의|이랑|이도|이와|이에게|들)(?![가-힣]))';
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const NAME_BODY='([가-힣]{2,3}|[가-힣](?:[ \\t][가-힣]){1,3})(?![가-힣])',SEP='[ \\t]*[:：]?[ \\t]*[)\\]]?[ \\t\\n]+';

const RE={
 rrn:/(?<![\d-])(\d{6})[-\s]?([1-8]\d{6})(?![\d-])/g,
 card:/(?<![0-9A-Za-z])(?:\d{4}[-\s]?){3}\d{4}(?![0-9A-Za-z])/g,
 phone:/(?<![\d-])(?:0(?:1[016789]|2|[3-6]\d)[-.\s]?\d{3,4}[-.\s]?\d{4})(?![\d-])/g,
 email:/(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![A-Za-z0-9])/g,
 account:new RegExp('(?:계좌\\s*(?:번호)?|입금\\s*계좌|송금\\s*계좌|환불\\s*계좌|예금\\s*주?|account)[은는이가을를]?\\s*[:：]?\\s*(?:[(\\[]?\\s*'+BANK+'\\s*[)\\]]?\\s*[:：]?\\s*)?[(\\[]?\\s*(\\d[\\d-]{7,20}\\d)','gi'),
 address:/(?:[가-힣]+(?:특별시|광역시|특별자치시|특별자치도)[ \t]*)?[가-힣]{2,10}(?:시|군|구)[ \t]+[가-힣0-9]{2,15}(?:로|길|동|읍|면|리)[ \t]*[0-9][0-9-]{0,9}[가-힣0-9 \t,()-]{0,40}/g,
 birth:/(?<![0-9A-Za-z])(\d{4})[.\-/년]\s?(0?[1-9]|1[0-2])[.\-/월]\s?(0?[1-9]|[12]\d|3[01])일?(?![0-9])/g,
 car:/(?<![0-9A-Za-z가-힣])\d{2,3}[가-힣]\s?\d{4}(?![0-9])/g,
 strong:new RegExp('(?:'+STRONG.map(esc).join('|')+')'+SEP+NAME_BODY,'g'),
 weak:new RegExp('(?:'+WEAK.map(esc).join('|')+')'+SEP+NAME_BODY,'g'),
 after:new RegExp('(?<![가-힣])([가-힣]{3})[ \\t]?(?:'+AFTER.join('|')+')'+END,'g'),
 protect:/\]\([^)\n]*\)|https?:\/\/[^\s)>\]]+|<!--[\s\S]*?-->/g
};

const stars=n=>'*'.repeat(Math.max(n,1));
const surnameLen=s=>COMPOUND.includes(s.slice(0,2))?2:1;
const MASK={
 주민등록번호:s=>(s.includes('-')?s.split('-')[0]:s.slice(0,6))+'-*******',
 전화번호:s=>{const d=s.replace(/\D/g,''),head=d.startsWith('02')?'02':d.slice(0,3),rest=d.slice(head.length);return head+(rest.length>=8?'-****-****':'-***-****');},
 이메일:s=>{const [user,domain]=s.split('@'),keep=user.length>2?user.slice(0,2):user.slice(0,1);return keep+stars(Math.max(user.length-keep.length,3))+'@'+domain;},
 계좌번호:s=>{let kept=0;return [...s].reverse().map(c=>/\d/.test(c)?(kept++<3?c:'*'):c).reverse().join('');},
 카드번호:s=>'****-****-****-'+s.replace(/\D/g,'').slice(-4),
 이름:s=>{const n=s.replace(/[ \t]+/g,''),k=surnameLen(n);return n.slice(0,k)+stars(n.length-k);},
 주소:s=>{const m=(s+' ').match(/^(.*?[시군구])\s/);return m?m[1]+' ****':s.slice(0,6)+' ****';},
 생년월일:s=>{const m=s.match(/^(\d{4})/);return m?m[1]+'년 **월 **일':stars(s.length);},
 차량번호:s=>s.replace(/\d{4}$/,'****')
};

function token(text,start,end){let s=start,e=end;while(s>0&&!/\s/.test(text[s-1]))s--;while(e<text.length&&!/\s/.test(text[e]))e++;return text.slice(s,e);}
function isReference(text,start,end){
 if(/doi|https?:\/\/|www\.|arxiv|pmid|pmc\d|isbn|issn|10\.\d{4,9}\//i.test(token(text,start,end)))return true;
 if(start>0&&text[start-1]==='/')return true;
 const before=text.slice(Math.max(0,start-30),start).replace(/\n/g,' ');
 return /(?:doi|isbn|issn|arxiv|pmid|pmcid)\s*[:：]?\s*$/i.test(before)||/10\.\s?\d{4,9}\s?\/\s?(?:[A-Za-z]{1,3}\s?:)?\s*$/.test(before);
}
function luhn(d){let t=0;[...d].reverse().forEach((c,i)=>{let n=+c;if(i%2)n=n>4?n*2-9:n*2;t+=n;});return t%10===0;}
function notCard(text,start,end){
 const v=text.slice(start,end),groups=v.match(/\d+/g)||[];
 if(v.includes(' ')&&(/\d\s+$/.test(text.slice(Math.max(0,start-6),start))||/^\s+\d/.test(text.slice(end,end+6))))return true;
 if(groups.length===4&&groups.every(g=>+g>=1900&&+g<=2099))return true;
 if(/(?:카드|card|결제|신용|체크)/i.test(text.slice(Math.max(0,start-20),start)))return false;
 return !luhn(groups.join(''));
}
const urlDate=(text,start,end)=>/[=&?]|:\/\/|www\./.test(token(text,start,end))||(start>0&&text[start-1]==='/'&&text[end]==='/');
const looksDate=s=>{const m=s.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);return !!m&&+m[1]>=1900&&+m[1]<=2100&&+m[2]>=1&&+m[2]<=12&&+m[3]>=1&&+m[3]<=31;};
function validRrn(d){if(d.length!==13)return false;const w=[2,3,4,5,6,7,8,9,2,3,4,5];let t=0;for(let i=0;i<12;i++)t+=+d[i]*w[i];return (11-t%11)%10===+d[12];}
export function looksLikeName(s){
 if(s.length<2||s.length>4||STOP.has(s))return false;
 if(s.length>=3&&TAIL.includes(s.at(-1)))return false;
 if(COMPOUND.includes(s.slice(0,2)))return s.length>=3;
 return s.length<=3&&SURNAMES.has(s[0]);
}
// 문서 안에서 이름이 아닌 쓰임새(-하다, -적, -화 …)로 나오거나, 논문 인용 저자 꼴이면 사람 이름으로 보지 않는다
function commonWord(w,text){
 if(STOP.has(w))return true;
 if(new RegExp('(?<![가-힣])'+esc(w)+NONPERSON_TAIL).test(text))return true;
 const n=esc(w),y='(?:19|20)\\d{2}[a-z]?';
 return new RegExp(n+'\\s*\\(\\s*'+y+'\\s*[),]|'+n+'\\s*(?:,|외|등|et al\\.?)\\s*'+y+'\\s*\\)|'+n+'\\s*(?:외|등|et al\\.?)\\s*\\(\\s*'+y).test(text);
}

// text 에서 개인정보로 보이는 곳을 찾는다. allowNames 에 든 이름(공개해도 되는 이름)은 건너뛴다.
// knownNames 는 다른 기록에서 확인한 이름이다. 같은 이름이 여기 나오면 표시가 없어도 찾는다.
export function scanText(text,{allowNames=[],knownNames=[]}={}){
 text=String(text||'');
 const hits=[],taken=[],allow=new Set(allowNames.map(n=>n.replace(/\s+/g,''))),found=new Set(),notPerson=new Map();
 const protectedSpans=[...text.matchAll(RE.protect)].map(m=>[m.index,m.index+m[0].length]);
 const overlap=(s,e,list)=>list.some(([a,b])=>s<b&&e>a);
 const add=(kind,start,original,confidence='보통')=>{
  const end=start+original.length;if(!original||overlap(start,end,taken)||overlap(start,end,protectedSpans))return;
  taken.push([start,end]);hits.push({kind,original,masked:MASK[kind](original),start,end,confidence,context:text.slice(Math.max(0,start-18),end+18).replace(/\s+/g,' ').trim()});
 };
 for(const m of text.matchAll(RE.rrn)){const d=m[1]+m[2],mm=+d.slice(2,4),dd=+d.slice(4,6);if(mm<1||mm>12||dd<1||dd>31||isReference(text,m.index,m.index+m[0].length))continue;add('주민등록번호',m.index,m[0],validRrn(d)?'확실':'보통');}
 for(const m of text.matchAll(RE.card)){const e=m.index+m[0].length;if(isReference(text,m.index,e)||notCard(text,m.index,e))continue;add('카드번호',m.index,m[0]);}
 for(const m of text.matchAll(RE.phone))add('전화번호',m.index,m[0],'확실');
 for(const m of text.matchAll(RE.email))add('이메일',m.index,m[0],'확실');
 for(const m of text.matchAll(RE.account)){const v=m[1],s=m.index+m[0].lastIndexOf(v);if(looksDate(v)||v.replace(/\D/g,'').length<9||isReference(text,s,s+v.length))continue;add('계좌번호',s,v,'확실');}
 for(const m of text.matchAll(RE.address)){const v=m[0].trimEnd();add('주소',m.index,v);}
 for(const m of text.matchAll(RE.birth)){
  const year=+m[1],labeled=/생년월일|생 년 월 일|생일|출생/.test(text.slice(Math.max(0,m.index-20),m.index));
  if(!labeled&&!(year>=1900&&year<=2015))continue;if(urlDate(text,m.index,m.index+m[0].length))continue;
  add('생년월일',m.index,m[0],labeled?'확실':'낮음');
 }
 for(const m of text.matchAll(RE.car))add('차량번호',m.index,m[0],'낮음');
 const isPerson=n=>{if(allow.has(n))return false;if(!notPerson.has(n))notPerson.set(n,commonWord(n,text));return !notPerson.get(n);};
 for(const [rex,min] of [[RE.strong,2],[RE.weak,3]])for(const m of text.matchAll(rex)){
  const raw=m[1],n=raw.replace(/[ \t]+/g,'');if(n.length<min||!looksLikeName(n)||!isPerson(n))continue;
  found.add(n);add('이름',m.index+m[0].length-raw.length,raw,'확실');
 }
 for(const m of text.matchAll(RE.after)){const n=m[1];if(!looksLikeName(n)||!isPerson(n))continue;found.add(n);add('이름',m.index,n,'보통');}
 const names=[...new Set([...found,...knownNames.map(n=>n.replace(/\s+/g,''))])].filter(n=>!allow.has(n)).sort((a,b)=>b.length-a.length);
 if(names.length){
  const rex=new RegExp('(?<![가-힣])('+names.map(n=>[...n].map(esc).join('[ \\t]*')).join('|')+')'+END,'g');
  for(const m of text.matchAll(rex))add('이름',m.index,m[1],'확실');
 }
 hits.sort((a,b)=>a.start-b.start);
 return {hits,names:[...found]};
}

// 고른 곳만 가린다. keys 는 hitKey() 값의 모음이다
export const hitKey=h=>h.kind+'|'+h.original.replace(/[ \t]+/g,'');
export function maskText(text,hits,keys){
 let out='',last=0;
 for(const h of [...hits].sort((a,b)=>a.start-b.start)){if(h.start<last||(keys&&!keys.has(hitKey(h))))continue;out+=text.slice(last,h.start)+h.masked;last=h.end;}
 return out+text.slice(last);
}

// 고른 기록 전체를 검사한다. 한 기록에서 확인한 이름은 다른 기록에서도 찾는다.
// fields: title, body(가릴 수 있음), extra(표 안 내용 등, 읽기만), folder·tags(포함할 때만)
export function scanNotes(items,{allowNames=[]}={}){
 const pass=(known)=>items.map(item=>({id:item.id,title:item.title,fields:Object.fromEntries(Object.entries(item.fields).map(([name,text])=>[name,scanText(text,{allowNames,knownNames:known})]))}));
 const first=pass([]),known=[...new Set(first.flatMap(r=>Object.values(r.fields).flatMap(f=>f.names)))];
 return (known.length?pass(known):first).map(r=>({id:r.id,title:r.title,fields:Object.fromEntries(Object.entries(r.fields).map(([k,v])=>[k,v.hits]))}));
}
