// G 드라이브 지도 분류·찾기 시험. 실제 드라이브 대신 지어낸 이름만 쓴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,search,pathOf,childrenOf,subsOf,cleanRaw} from '../drive-map-model.js';
import {CATS,SENSITIVE} from '../drive-map-rules.js';

// [이름, 부모 번호, 폴더 여부]
const rows=[
 ['05_수업',-1,1],          //0
 ['2026. 과학 2학기',0,1],   //1
 ['태양 고도.pptx',1,0],     //2
 ['00_코딩',-1,1],          //3
 ['18_과학 게임',3,1],       //4
 ['index.html',4,0],        //5
 ['13_LMS 2026 버전',3,1],   //6
 ['code.gs',6,0],           //7
 ['98_레고학교',-1,1],        //8
 ['#22. 드론',8,1],          //9
 ['장면1.png',9,0],          //10
 ['수업 메모.gdoc',-1,0],     //11
 ['알 수 없는 폴더',-1,1],     //12
 ['메모.txt',12,0],          //13
 ['02_사업',-1,1],           //14
 ['2025. 연구학교 연수',14,1],  //15
 ['결과.hwp',15,0]           //16
];
const raw={names:rows.map(r=>r[0]),parent:rows.map(r=>r[1]),dir:rows.map(r=>r[2]).join('')};
const m=buildModel(raw);
const where=i=>CATS[m.cat[i]].key+' '+m.subNames[m.sub[i]];

test('7판 칸과 소분류로 나눈다',()=>{
 assert.equal(where(2),'01 02_과학');
 assert.equal(where(5),'01 02_과학','과학 게임 코드는 01 수업 › 과학');
 assert.equal(where(7),'02 07_업무 자동화·수업 관리 도구');
 assert.equal(where(10),'06 레고학교');
 assert.equal(where(11),'01 낱개 파일','맨 위 낱개 파일은 이름 낱말로 짐작');
 assert.equal(where(13),'00 알 수 없는 폴더','규칙에 없는 맨 위 폴더는 분류 전');
 assert.equal(where(16),'03 2025');
});

test('파일 수와 묶음을 센다',()=>{
 assert.equal(m.files,7);assert.equal(m.dirs,10);
 assert.equal(m.tot[3],2);
 const science=subsOf(m,CATS.findIndex(c=>c.key==='01')).find(g=>g.label==='02_과학');
 assert.equal(science.files,2);assert.deepEqual(science.anchors.sort((a,b)=>a-b),[1,4]);
 assert.deepEqual(childrenOf(m,3),[4,6]);
 assert.deepEqual(pathOf(m,10),['98_레고학교','#22. 드론','장면1.png']);
});

test('주제 사전으로 칸을 가로질러 찾는다',()=>{
 const drone=0;assert.ok(m.mask[10]&(1<<drone),'드론 폴더 안 파일은 드론 주제');
});

test('띄어 쓴 낱말은 모두 든 것만 찾는다',()=>{
 assert.equal(search(m,'과학').total,2);
 assert.deepEqual(search(m,'pptx 과학').items,[2]);
 assert.equal(search(m,'없는낱말').total,0);
});

test('민감한 이름은 거른다',()=>{
 for(const n of ['강사카드 모음','개인정보 동의서.pdf','통장 사본.jpg','학생명부_Images','90_행정(비공개)','오픈AI API 키.gsheet','01_공필재 스마트점핑'])assert.ok(SENSITIVE.test(n),n);
 for(const n of ['2026. 과학 2학기','드론 수업','학업성적관리지침 해설'])assert.ok(!SENSITIVE.test(n),n);
});

test('맨 위 낱개 파일을 이름으로 나눈다',()=>{
 const names=['제목 없는 스프레드시트 (31).gsheet','표로 만들어줘.gsheet','학급온도계 V1의 사본.gsheet','베리어프리 키오스크 대회 (3).gsheet','3. 안전관리 서약서_코딩큐브.hwp','부기 사용자 계정 목록 V2.gsheet','index (12).html','에듀테크 도구 희망.gform','어디에도 안 맞는 이름.gsheet'];
 const raw={names,parent:names.map(()=>-1),dir:names.map(()=>'0').join('')};
 const mm=buildModel(raw),key=i=>CATS[mm.cat[i]].key+' '+mm.subNames[mm.sub[i]];
 assert.deepEqual(names.map((_,i)=>key(i)),['99 제목 없는·시험 파일','99 AI 대화·공유로 생긴 파일','02 07_업무 자동화·수업 관리 도구','04 07_학생 대상','03 낱개 파일','02 11_부기','99 AI 대화·공유로 생긴 파일','98 설문·응답','00 맨 위 낱개 파일']);
});

test('사업 칸의 첫 폴더는 낱말이 안 맞으면 폴더 이름을 소분류로 쓴다',()=>{
 const raw={names:['02_사업','07_(가상) 마을 연결 프로젝트','계획.hwpx'],parent:[-1,0,1],dir:'110'};
 const mm=buildModel(raw);assert.equal(mm.subNames[mm.sub[2]],'07_(가상) 마을 연결 프로젝트');
});

test('저장해 둔 색인에 남은 민감한 이름은 열 때 안쪽까지 뺀다',()=>{
 const raw={names:['05_수업','재직증명서','사본.pdf','수업.pptx'],parent:[-1,0,1,0],dir:'1100'};
 const c=cleanRaw(raw);assert.deepEqual(c.names,['05_수업','수업.pptx']);assert.deepEqual(c.parent,[-1,0]);
 assert.equal(buildModel(raw).N,2);
});
