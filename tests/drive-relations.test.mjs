// G 드라이브 지식맵 연결 계산 시험. 지어낸 이름만 쓴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel} from '../drive-map-model.js';
import {buildRelations,reasonText} from '../drive-relations.js';

const rows=[];const add=(name,parent,dir)=>{rows.push([name,parent,dir]);return rows.length-1;};
const lesson=add('05_수업',-1,1),drone=add('드론 수업',lesson,1);
for(const f of ['드론 비행 원리.pptx','드론 안전 수칙.hwp','코드론 미션 학습지.pdf'])add(f,drone,0);
const lego=add('98_레고학교',-1,1),ep=add('#22. 드론 영상',lego,1);
for(const f of ['드론 비행 원리.pptx','드론 안전 수칙.hwp','드론 장면 01.png'])add(f,ep,0);
const school=add('01_학교',-1,1),work=add('2026 학교 업무',school,1);
for(const f of ['교육과정 편성표.xlsx','시간표 조정.hwp'])add(f,work,0);
const raw={names:rows.map(r=>r[0]),parent:rows.map(r=>r[1]),dir:rows.map(r=>r[2]).join('')};
const m=buildModel(raw),r=buildRelations(m);
const k=d=>r.nodeIdx.get(d);

test('뜻이 통하는 폴더를 묶음으로 고른다',()=>{
 assert.ok(r.nodes.includes(lesson)&&r.nodes.includes(lego)&&r.nodes.includes(school));
 assert.equal(r.files[k(lesson)],3);
});

test('같은 파일·주제·낱말로 이어지고 이유를 말한다',()=>{
 const e=r.edges.find(e=>(e.a===k(lesson)&&e.b===k(lego))||(e.a===k(lego)&&e.b===k(lesson)));
 assert.ok(e,'드론 수업과 레고학교 드론 영상이 이어진다');
 assert.equal(e.same,2);
 assert.ok(e.topics.length>=1);
 const text=reasonText(e);assert.match(text,/같은 이름 파일 2개/);assert.match(text,/드론/);
});

test('관련 없는 묶음은 잇지 않는다',()=>{
 assert.ok(!r.edges.some(e=>e.a===k(school)||e.b===k(school)));
});
