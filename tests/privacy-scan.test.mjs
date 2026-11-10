import test from 'node:test';import assert from 'node:assert/strict';
import {scanText,scanNotes,maskText,hitKey} from '../privacy-scan.js';
const kinds=t=>scanText(t).hits.map(h=>h.kind+':'+h.original);

test('번호류를 찾는다',()=>{
 assert.deepEqual(kinds('연락처 010-1234-5678, 메일 abc.def@school.kr'),['전화번호:010-1234-5678','이메일:abc.def@school.kr']);
 assert.deepEqual(kinds('주민번호 900101-1234568'),['주민등록번호:900101-1234568']);
 assert.deepEqual(kinds('환급 계좌는 국민은행 123456-78-901234 입니다'),['계좌번호:123456-78-901234']);
 assert.deepEqual(kinds('카드 4111-1111-1111-1111 결제'),['카드번호:4111-1111-1111-1111']);
 assert.deepEqual(kinds('생년월일: 2014.3.15'),['생년월일:2014.3.15']);
});
test('문서 날짜·DOI·주소 속 숫자는 건너뛴다',()=>{
 assert.deepEqual(kinds('2026.11.10 수업 기록'),[]);
 assert.deepEqual(kinds('https://doi.org/10.1177/1365480216659733'),[]);
 assert.deepEqual(kinds('연도 2016 2017 2018 2019 비교'),[]);
 assert.deepEqual(kinds('[사진](https://example.com/010-1234-5678)'),[]);
});
test('이름: 표시 옆, 호칭 앞, 다른 곳에 다시 나온 이름',()=>{
 const r=scanText('작성자: 홍길동\n오늘 김민준 학생이 발표했다. 홍길동 선생님 도움.');
 assert.deepEqual(r.hits.map(h=>h.original),['홍길동','김민준','홍길동']);
 assert.equal(r.hits[0].masked,'홍**');
});
test('이름처럼 보이는 낱말과 인용 저자는 건너뛴다',()=>{
 assert.deepEqual(kinds('학생 정리하기 활동'),[]);
 assert.deepEqual(kinds('담당자 설계자 확인'),[]);
 assert.deepEqual(kinds('이상수(2024)의 연구에서 이상수 학생 사례'),[]);
});
test('공개해도 되는 이름은 건너뛴다',()=>{
 assert.deepEqual(scanText('작성자: 이운희',{allowNames:['이운희']}).hits,[]);
});
test('한 기록에서 찾은 이름을 다른 기록에서도 찾고, 고른 곳만 가린다',()=>{
 const res=scanNotes([{id:'a',title:'A',fields:{body:'작성자: 박서연'}},{id:'b',title:'B',fields:{body:'박서연이 웃었다. 010-2222-3333'}}]);
 const b=res[1].fields.body;assert.deepEqual(b.map(h=>h.kind),['이름','전화번호']);
 const text='박서연이 웃었다. 010-2222-3333';
 assert.equal(maskText(text,b,new Set([hitKey(b[1])])),'박서연이 웃었다. 010-****-****');
 assert.equal(maskText(text,b),'박**이 웃었다. 010-****-****');
});
