// 체험용 가상 교사 드라이브 시험: 연수장에서 보여 줄 만큼 칸이 고루 차고 연결이 생기는지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleDrive} from '../drive-sample.js';
import {buildModel} from '../drive-map-model.js';
import {buildRelations} from '../drive-relations.js';
import {CATS,SENSITIVE} from '../drive-map-rules.js';

const raw=sampleDrive(),m=buildModel(raw),r=buildRelations(m);

test('부모 번호가 늘 자식보다 작고, 늘 같은 드라이브가 나온다',()=>{
 raw.parent.forEach((p,i)=>assert.ok(p<i));
 assert.deepEqual(sampleDrive().names.slice(0,50),raw.names.slice(0,50));
 assert.equal(sampleDrive().names.length,raw.names.length);
});

test('파일이 만 개쯤이고 분류 전은 거의 없다',()=>{
 assert.ok(m.files>8000&&m.files<15000,String(m.files));
 const loose=[...m.cat].filter((c,i)=>!m.isDir[i]&&CATS[c].key==='00').length;
 assert.ok(loose<20,String(loose));
 const used=new Set([...m.cat].map(c=>CATS[c].key));
 for(const k of ['01','02','03','04','05','06','07','08','09','10'])assert.ok(used.has(k),k);
});

test('민감한 이름이 없다',()=>{assert.equal(raw.names.filter(n=>SENSITIVE.test(n)).length,0);});

test('묶음이 수십 개이고 칸을 건너는 연결이 많다',()=>{
 assert.ok(r.nodes.length>=60,String(r.nodes.length));
 const cross=r.edges.filter(e=>m.cat[r.nodes[e.a]]!==m.cat[r.nodes[e.b]]).length;
 assert.ok(cross>=40,String(cross));
 assert.ok(r.edges.some(e=>e.sample.includes('드론 비행 안전 수칙.pdf')));
});
