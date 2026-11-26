// 체험용 가상 교사 드라이브.
// 연수장이나 남의 컴퓨터에서도 G 드라이브 지식맵을 보여 줄 수 있게, 초등 교사 한 사람의 드라이브를 흉내 낸 이름 목록을 만든다.
// 실제 사람, 학교, 학생 자료는 하나도 없다. 이름은 모두 지어낸 것이고 파일 내용은 없다.
// 결과는 drive-map-model.js buildModel이 받는 {names, parent, dir} 꼴이다.

const YEARS=[2021,2022,2023,2024,2025,2026];

export function sampleDrive(){
 let seed=20261126;
 const rnd=()=>(seed=(seed*48271)%2147483647)/2147483647;
 const pick=a=>a[Math.floor(rnd()*a.length)];
 const range=(a,b)=>a+Math.floor(rnd()*(b-a+1));
 const names=[],parent=[],dir=[];
 const add=(name,p,isDir)=>{names.push(name);parent.push(p);dir.push(isDir?'1':'0');return names.length-1;};
 const folder=(name,p)=>add(name,p,true);
 const files=(p,list)=>list.forEach(n=>add(n,p,false));
 let shot=1000;
 const photos=(p,n,head='IMG_')=>{for(let i=0;i<n;i++)add(head+(shot+=range(1,3))+'.jpg',p,false);};

 // 수업 한 단원: 지도안, 차시 PPT, 활동지, 기록, 사진, 학생 결과물.
 // share는 다른 칸(강의, 사업)에도 똑같은 이름으로 들어가 「같은 파일」 연결을 만든다.
 const unit=(p,kw,{lessons=8,years=[2024,2025],share=[],extra=[],shots=40}={})=>{
  const f=folder(kw,p);
  for(const y of years){
   const yf=folder(y+' '+kw,f);
   files(yf,[`${y} ${kw} 지도안.hwpx`,`${y} ${kw} 수업 계획.gdoc`,`${kw} 평가 기준 ${y}.gsheet`]);
   for(let i=1;i<=lessons;i++)files(yf,[`${i}차시 ${kw} 수업.pptx`,`${i}차시 ${kw} 활동지.hwpx`,`${i}차시 ${kw} 활동지.pdf`]);
   photos(folder('수업 사진',yf),Math.round(shots*(0.6+rnd()*0.8)));
   const r=folder('학생 결과물',yf);for(let i=1;i<=range(8,18);i++)add(`${kw} 결과물 ${i}.png`,r,false);
  }
  files(f,[...share,...extra,`${kw} 수업 기록.gdoc`,`${kw} 참고 영상 목록.gsheet`]);
  return f;
 };
 // 강의·연수 한 과정: 발표 자료, 실습지, 설문, 사진.
 const course=(p,title,{share=[],extra=[],times=3}={})=>{
  const f=folder(title,p);
  files(f,[`${title} 발표.pptx`,`${title} 발표.pdf`,`${title} 실습지.hwpx`,`${title} 안내.gdoc`,`${title} 만족도 설문.gform`,`${title} 만족도 설문 (응답).gsheet`,...share,...extra]);
  for(let i=1;i<=times;i++){const s=folder(`${i}회차`,f);files(s,[`${i}회차 ${title} 발표.pptx`,`${i}회차 실습 결과 모음.gdoc`]);photos(s,range(12,30));}
  return f;
 };
 // 사업 한 해: 계획, 결과 보고, 회의록, 예산(금액은 없음), 사진.
 const project=(p,title,{share=[],extra=[]}={})=>{
  const f=folder(title,p);
  files(f,[`${title} 운영 계획.hwpx`,`${title} 결과 보고서.hwpx`,`${title} 결과 보고서.pdf`,`${title} 협의회 자료.pptx`,`${title} 일정표.gsheet`,...share,...extra]);
  for(let i=1;i<=range(3,6);i++)add(`${i}차 협의록.hwpx`,f,false);
  photos(folder('활동 사진',f),range(30,90));
  return f;
 };

 // 여러 칸에 같은 이름으로 들어가는 파일들
 const DRONE=['드론 비행 안전 수칙.pdf','코드론 블록 코딩 실습지.hwpx','드론 장애물 경기 규칙.hwpx'];
 const SEL=['감정 카드 48장.pdf','사회정서 학습 6단계 안내.pdf','마음 날씨 기록지.hwpx'];
 const VIBE=['바이브 코딩 프롬프트 모음.gdoc','웹앱 배포 따라 하기.pdf','캔버스로 만든 퀴즈 웹앱.html'];
 const LMS=['수업 관리 LMS 사본 만들기.pdf','LMS 앱스 스크립트 코드.gs','앱스 스크립트 자동화 예시.gsheet'];
 const ETHICS=['AI 윤리 딜레마 카드.pdf','모럴 머신 토론 활동지.hwpx','인공지능 공존 토론 대본.hwpx'];
 const ZEP=['ZEP 교실 맵 만들기.pdf','ZEP 퀴즈 방 설정.gdoc'];
 const MINICAR=['미니카 경주 기록표.gsheet','고무 동력 자동차 설계도.pdf','전기 자동차 회로도.pdf'];
 const STOP=['레고 스톱모션 촬영 순서.pdf','미니 피규어 장면 콘티.hwpx'];
 const PKOS=['PKOS 기록장 사용 안내.pdf','PKOS 자료변환기 실습지.hwpx','흩어진 기록 모으기 점검표.gsheet'];
 const AIDT=['AIDT 수업 설계 양식.hwpx','디지털 교과서 활용 수업 사례.pdf','에듀테크 도구 비교표.gsheet'];
 const DIGI=['디지털 기초 단말기 다루기.pdf','키보드 자리 익히기 활동지.hwpx'];
 const CODE=['엔트리 기초 미션 30.pdf','코딩 한 바퀴 인증 기록표.gsheet'];
 const LIFE=['식물 도감 만들기 활동지.hwpx','동물원 관람 예절 영상 목록.gsheet'];
 const PLAY=['교실 놀이 40가지.pdf','쉬는 시간 컬러링 모음.pdf'];
 const GAME=['과학 게임 햇살 탐사대 안내.pdf','게임 수업 규칙판.hwpx','게이미피케이션 점수판.gsheet'];
 const COUNCIL=['학생 의회 회의 진행 순서.hwpx','학생 자치 회의록 양식.hwpx','학생회 선거 공약 카드.pdf'];

 // ── 01 수업 ──
 const lessons=folder('05_수업',-1);
 const sil=folder('실과',lessons);
 unit(sil,'드론 동아리',{lessons:10,years:[2023,2024,2025],share:DRONE,shots:70});
 unit(sil,'미니카 만들기',{lessons:6,share:MINICAR});
 unit(sil,'전기 자동차 원리',{lessons:5,share:MINICAR});
 unit(sil,'네오봇 코딩 자동차',{lessons:6,share:['네오봇 연결 방법.pdf','코딩 자동차 미션 카드.pdf']});
 unit(sil,'동물 기르기',{lessons:8,share:[...LIFE,...STOP]});
 unit(sil,'식물원 탐방',{lessons:4,share:LIFE});
 unit(sil,'생활 속 요리',{lessons:4});
 unit(sil,'시간 관리',{lessons:3});
 const sci=folder('과학',lessons);
 unit(sci,'태양계와 별',{lessons:9,years:[2022,2025],share:GAME});
 unit(sci,'빛의 성질',{lessons:8,share:GAME});
 unit(sci,'전기의 이용',{lessons:10,share:MINICAR});
 unit(sci,'우리 몸의 구조',{lessons:9});
 unit(sci,'연소와 소화',{lessons:8,share:['불꽃 안전 체험 활동지.hwpx']});
 unit(sci,'날씨와 우리 생활',{lessons:7});
 unit(sci,'과학 게임 수업',{lessons:6,years:[2025,2026],share:GAME});
 const info=folder('정보·디지털',lessons);
 unit(info,'디지털 기초소양',{lessons:8,share:DIGI});
 unit(info,'엔트리 코딩',{lessons:10,share:CODE});
 unit(info,'미디어 리터러시',{lessons:6,share:['가짜 뉴스 찾기 활동지.hwpx']});
 unit(info,'AI 윤리 토론',{lessons:5,share:ETHICS});
 unit(info,'영상 만들기 키네마스터',{lessons:5,share:STOP});
 const sel=folder('사회정서',lessons);
 unit(sel,'마음 날씨',{lessons:6,share:SEL});
 unit(sel,'가족 사랑 편지',{lessons:3,share:SEL});
 unit(sel,'감정 다루기',{lessons:6,share:SEL});
 const club=folder('창체·동아리',lessons);
 unit(club,'학생 자치 회의',{lessons:6,share:COUNCIL});
 unit(club,'메이커 동아리',{lessons:8,share:DRONE.slice(0,1)});
 const play=folder('놀이·체육',lessons);
 unit(play,'교실 놀이',{lessons:6,share:PLAY});
 unit(play,'뉴스포츠',{lessons:5});
 const soc=folder('사회·환경',lessons);
 unit(soc,'기후 위기와 우리',{lessons:6});
 unit(soc,'우리 고장 역사',{lessons:6});

 // ── 02 주제 (코딩·도구 만들기) ──
 const code=folder('00_코딩',-1);
 const pk=folder('20_pkos',code);
 files(pk,[...PKOS,'PKOS 연수 발표.pptx','PKOS 연수 발표.pdf','드라이브 폴더 재구성안.md','드라이브 지식 베이스 운영 규칙.md']);
 for(const s of ['기록장','자료변환기','사이트 만들기','지식맵 실험']){const f=folder(s,pk);files(f,[`${s} 설계 메모.md`,`${s} 화면 사진.png`,`${s} 사용 설명서.pdf`,`${s} 바뀐 점.md`]);for(let i=1;i<=range(20,40);i++)add(`${s} 기록 ${i}.md`,f,false);}
 const lms=folder('LMS 수업 관리',code);
 for(const y of [2024,2025,2026]){const f=folder(`LMS ${y} 버전`,lms);files(f,[...LMS,`LMS ${y} 사용 설명서.pdf`,`LMS ${y} 배포 기록.md`]);for(let i=1;i<=range(15,30);i++)add(`LMS 화면 ${i}.png`,f,false);}
 const vibe=folder('바이브 코딩',code);
 for(const s of ['수업 퀴즈 웹앱','학급 칭찬 기록장','과학 게임 만들기','교실 타이머','게이미피케이션 보드']){const f=folder(s,vibe);files(f,[...VIBE.slice(0,2),`${s}.html`,`${s} 설명.md`,`${s} 프롬프트.gdoc`]);for(let i=1;i<=range(10,25);i++)add(`${s} 화면 ${i}.png`,f,false);}
 const auto=folder('업무 자동화',code);
 for(const s of ['보결 시간표 자동화','서논술 평가 간소화','공문 요약 도우미','출결 대시보드']){const f=folder(s,auto);files(f,[...LMS.slice(1),`${s}.gs`,`${s} 안내.pdf`,`${s} 시트.gsheet`]);for(let i=1;i<=range(8,20);i++)add(`${s} 기록 ${i}.md`,f,false);}
 const ai=folder('인공지능 교육',code);
 for(const s of ['AI 몬스터 만들기','AI 탐험대','로컬 AI 실습']){const f=folder(s,ai);files(f,[...ETHICS.slice(0,2),`${s} 교재.pdf`,`${s} 실습지.hwpx`]);for(let i=1;i<=range(15,35);i++)add(`${s} 장면 ${i}.png`,f,false);}
 const lego=folder('레고학교 영상',code);
 for(const s of ['동물 기르기 1편','동물 기르기 2편','식물 도감','안전 교육']){const f=folder(s,lego);files(f,[...STOP,`${s} 대본.hwpx`,`${s} 썸네일.png`]);photos(f,range(40,80),'장면_');}
 const aidt=folder('AI·디지털 전환',code);
 for(const s of ['AIDT 수업 사례','에듀테크 도구 정리','메타버스 교실']){const f=folder(s,aidt);files(f,[...AIDT,...(s==='메타버스 교실'?ZEP:[]),`${s} 정리.gdoc`]);for(let i=1;i<=range(10,25);i++)add(`${s} 자료 ${i}.pdf`,f,false);}

 // ── 03 사업 ──
 const biz=folder('02_사업',-1);
 const bizYear=(y,list)=>{const f=folder(`${y} 사업`,biz);list.forEach(([t,o])=>project(f,`${y} ${t}`,o));};
 bizYear(2023,[['디지털 선도학교',{share:DIGI}],['드론 교육 지원',{share:DRONE}]]);
 bizYear(2024,[['AI 교육 선도학교',{share:ETHICS}],['사회정서교육 지원단',{share:SEL}],['교실혁명 선도교사',{share:AIDT}]]);
 bizYear(2025,[['AIDT 컨설팅',{share:AIDT}],['수업 나눔 공동체',{}],['학생 자치 활성화',{share:COUNCIL}],['과학 게임 개발',{share:GAME}]]);
 bizYear(2026,[['디지털 전환 자문',{share:[...AIDT.slice(0,1),...PKOS.slice(0,1)]}],['바이브 코딩 교사 연구회',{share:VIBE}],['메타버스 교실 운영',{share:ZEP}]]);

 // ── 04 강의·연수 ──
 const lec=folder('03_강의',-1);
 const lecGroup=(name,list)=>{const f=folder(name,lec);list.forEach(([t,o])=>course(f,t,o));};
 lecGroup('AI·디지털 전환 연수',[['AI 디지털 전환과 교육혁신',{share:AIDT.slice(1)}],['학교 변화 여정',{}],['AI 윤리 수업 연수',{share:ETHICS}]]);
 lecGroup('에듀테크 연수',[['AIDT 활용 연수',{share:AIDT}],['구글 기초 연수',{share:DIGI}]]);
 lecGroup('바이브 코딩 연수',[['바이브 코딩으로 웹앱 만들기',{share:VIBE}],['앱스 스크립트 업무 경감',{share:LMS}],['게이미피케이션 수업 만들기',{share:GAME}]]);
 lecGroup('PKOS 개인지식 연수',[['흩어진 기록 다시 꺼내 쓰기',{share:PKOS}],['기록장과 지식맵 실습',{share:PKOS.slice(0,1)}]]);
 lecGroup('드론·코딩 연수',[['코드론 수업 연수',{share:DRONE}],['엔트리 코딩 연수',{share:CODE}]]);
 lecGroup('사회정서·학부모 연수',[['사회정서교육 연수',{share:SEL}],['학부모 디지털 특강',{share:DIGI.slice(0,1)}]]);
 lecGroup('메타버스 연수',[['ZEP으로 교실 만들기',{share:ZEP}]]);
 lecGroup('학생 자치 연수',[['학생 의회 운영 연수',{share:COUNCIL}]]);

 // ── 05 저서 · 06 채널 (교사 폴더 안) ──
 const me=folder('00_교사 이야기',-1);
 for(const b of ['책 바이브 코딩 교실','책 기록하는 교사']){const f=folder(b,me);files(f,[`${b} 목차.gdoc`,`${b} 원고 전체.hwpx`,`${b} 표지 시안.png`]);for(let i=1;i<=range(10,14);i++)add(`${i}장 원고.hwpx`,f,false);for(let i=1;i<=range(20,40);i++)add(`${b} 그림 ${i}.png`,f,false);}
 const map=folder('ai-dx 전환 지도',me);files(map,[...PKOS.slice(0,1),'지도 카드 목록.gsheet','첫 화면 시안.png']);for(let i=1;i<=60;i++)add(`지도 화면 ${i}.png`,map,false);
 const blog=folder('블로그 글 백업',me);for(const y of YEARS){const f=folder(`${y} 블로그`,blog);for(let i=1;i<=range(15,35);i++)add(`${y} 수업 이야기 ${i}.md`,f,false);}

 // ── 07 사진·영상 ──
 const pic=folder('07_사진모음',-1);
 for(const y of YEARS)for(const e of pick([['운동회','현장 체험 학습','졸업식'],['학예회','과학의 날','수학여행'],['드론 대회','동아리 발표회','운동회']])){photos(folder(`${y} ${e} 사진`,pic),range(60,160));}

 // ── 08 학교 업무 ──
 const sch=folder('01_학교',-1);
 for(const y of [2024,2025,2026]){const f=folder(`${y} 학년 업무`,sch);files(f,[`${y} 교육과정 운영 계획.hwpx`,`${y} 학년 협의록.hwpx`,`${y} 학급 시간표.gsheet`,`${y} 학년 행사 계획.hwpx`,`${y} 정보 업무 정리.gdoc`]);for(let i=1;i<=range(25,45);i++)add(`${y} 공문 사본 ${i}.pdf`,f,false);}
 const rep=folder('04_반복업무',-1);
 for(const s of ['학기 초 준비','방과후 정리','정보 기기 점검','학기 말 정리']){const f=folder(s,rep);files(f,[`${s} 점검표.gsheet`,`${s} 순서.gdoc`,...(s==='정보 기기 점검'?DIGI.slice(0,1):[])]);for(let i=1;i<=range(8,16);i++)add(`${s} 자료 ${i}.hwpx`,f,false);}

 // ── 09 연구·대학원 ──
 const grad=folder('06_대학원',-1);
 for(const s of ['교육공학 수업','논문 자료','게임 기반 학습 연구']){const f=folder(s,grad);files(f,[`${s} 정리.gdoc`,...(s==='게임 기반 학습 연구'?GAME.slice(1):[])]);for(let i=1;i<=range(20,45);i++)add(`${s} 읽을거리 ${i}.pdf`,f,false);}

 // ── 10 도구·참고자료 ──
 const tool=folder('08_도구',-1);
 for(const s of ['글꼴','아이콘','PPT 템플릿','한글 서식']){const f=folder(s,tool);for(let i=1;i<=range(15,35);i++)add(`${s} ${i}${s==='글꼴'?'.ttf':s==='아이콘'?'.svg':s==='PPT 템플릿'?'.pptx':'.hwpx'}`,f,false);}
 const ref=folder('09_학습자료',-1);
 for(const s of ['받은 연수 자료','교육청 안내 자료','에듀테크 설명서']){const f=folder(s,ref);files(f,s==='에듀테크 설명서'?AIDT.slice(2):[]);for(let i=1;i<=range(20,40);i++)add(`${s} ${i}.pdf`,f,false);}

 // ── 98 앱 폴더 · 99 보관 ──
 for(const s of ['Classroom','Colab Notebooks','Google AI Studio']){const f=folder(s,-1);for(let i=1;i<=range(6,14);i++)add(`${s} 항목 ${i}${s==='Colab Notebooks'?'.ipynb':'.gdoc'}`,f,false);}
 const old=folder('99_지난 임시파일',-1);for(let i=1;i<=40;i++)add(`임시 메모 ${i}.txt`,old,false);
 const hobby=folder('00_취미',-1);photos(folder('여행 사진',hobby),80);files(folder('보드게임',hobby),['보드게임 규칙 정리.gdoc','보드게임 기록.gsheet']);

 // ── 맨 위 낱개 파일 ──
 files(-1,['2026 연수 일정 정리.gsheet','수업 공개 준비 메모.gdoc','학급 설문 (응답).gsheet','에듀테크 도구 희망 설문.gform','사업 공모 아이디어.gdoc','레고학교 영상 목록.gsheet','정리 안 된 메모.txt','새 문서.gdoc']);

 return {names,parent,dir:dir.join('')};
}
