// G 드라이브 묶음 카드 시험: 가상 교사 드라이브로 카드가 기록 모양을 갖추고 서로 이어지는지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleDrive} from '../drive-sample.js';
import {buildModel} from '../drive-map-model.js';
import {buildRelations} from '../drive-relations.js';
import {buildDriveCards,isDriveCard,DRIVE_ROOT_FOLDER} from '../drive-cards.js';
import {filterNotes} from '../core.js';

const m=buildModel(sampleDrive()),r=buildRelations(m),cards=buildDriveCards(m,r,{at:Date.UTC(2026,10,26)});

test('묶음마다 카드 하나, 번호와 제목이 겹치지 않는다',()=>{
 assert.equal(cards.length,r.nodes.length);
 assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);
 assert.equal(new Set(cards.map(c=>c.title)).size,cards.length);
 assert.ok(cards.every(isDriveCard));
 assert.deepEqual(buildDriveCards(m,r,{at:Date.UTC(2026,10,26)}).map(c=>c.id),cards.map(c=>c.id),'다시 만들어도 같은 번호');
});

test('기록 모양: 칸 노트북, 태그, 이어진 카드, 파일 목록',()=>{
 const c=cards.find(c=>c.title==='드론 동아리');
 assert.ok(c.folder.startsWith(DRIVE_ROOT_FOLDER+'/01 수업'));
 assert.ok(c.tags.includes('드론'));
 assert.ok(c.links.length>0&&c.links.every(id=>cards.some(x=>x.id===id)));
 assert.match(c.body,/## 이어진 자료/);assert.match(c.body,/\[\[드론·코딩 연수\]\]/);
 assert.ok(c.virtual&&c.kind==='drive'&&c.localPath.endsWith('드론 동아리'));
});

test('기록 찾기로 파일 이름까지 찾는다',()=>{
 const hit=filterNotes(cards,{q:'안전 수칙'});
 assert.ok(hit.length>=3,String(hit.length));
});
