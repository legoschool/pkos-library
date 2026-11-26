// 기록을 G 드라이브 구성대로 저장하는 시험: 자리 찾기(drive-placement.js)와 폴더 안 저장(folder-mirror-files.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleDrive} from '../drive-sample.js';
import {buildModel} from '../drive-map-model.js';
import {buildRelations} from '../drive-relations.js';
import {buildPlacer,placeKey,parsePlaceKey,INBOX_NAME,ATTACH_DIR} from '../drive-placement.js';
import {makeNote} from '../core.js';
import {syncFolderMirror} from '../folder-mirror-files.js';

const m=buildModel(sampleDrive()),r=buildRelations(m),placer=buildPlacer(m,r);
const note=(title,body='',extra={})=>makeNote({id:'n-'+title,title,body,...extra});

test('드론 수업 기록은 드론 동아리 폴더로, 이유와 다른 후보도 함께',()=>{
 const p=placer.place(note('드론 동아리 3차시 비행 경로 코딩','아이들이 드론을 띄우고 비행 경로를 블록으로 짰다.',{tags:['드론']}));
 assert.notEqual(p.inbox,true);
 assert.match(p.dir.join('/'),/드론/);
 assert.ok(p.create===p.dir.length,'이미 있는 폴더라 새로 만들지 않는다');
 assert.match(p.reason,/드론/);
 assert.ok(p.candidates.length>=2&&p.candidates.every(c=>c.label&&c.dir.length));
});

test('맞는 폴더가 없으면 맨 위 00_PKOS(없으면 만든다)',()=>{
 const p=placer.place(note('주말 장보기 목록','우유 계란 두부'));
 assert.deepEqual(p.dir,[INBOX_NAME]);assert.equal(p.create,0);assert.equal(p.inbox,true);
});

test('이미 맨 위에 PKOS 폴더가 있으면 그 폴더를 쓴다',()=>{
 const raw=sampleDrive();raw.names.push('00_PKOS');raw.parent.push(-1);raw.dir+='1';
 const mm=buildModel(raw),pl=buildPlacer(mm,buildRelations(mm));
 const p=pl.place(note('주말 장보기 목록'));
 assert.deepEqual(p.dir,['00_PKOS']);assert.equal(p.create,1);
});

test('사진·영상 원본, 앱·제출물, 보관 칸에는 넣지 않는다',()=>{
 for(const t of ['운동회 사진 정리','현장 체험 학습 사진','수학여행 사진']){
  const p=placer.place(note(t,'사진을 골랐다'));
  assert.ok(!/사진모음|사진·영상|99_|보관/.test(p.dir.join('/'))||p.inbox,t+' → '+p.dir.join('/'));
 }
});

test('자리 문자열은 오가도 같고, 위험한 이름은 받지 않는다',()=>{
 const p={dir:['01_수업','드론 동아리'],create:2};
 assert.deepEqual(parsePlaceKey(placeKey(p)),p);
 assert.equal(parsePlaceKey('../x|0'),null);assert.equal(parsePlaceKey('a/b|5'),null);assert.equal(parsePlaceKey('a:b|0'),null);
});

// ── 폴더 안에 저장 ──
const failure=name=>Object.assign(new Error(name),{name});
class Dir{
 constructor(name=''){this.name=name;this.entries=new Map();}
 async getDirectoryHandle(name,{create=false}={}){let v=this.entries.get(name);if(v&&!(v instanceof Dir))throw failure('TypeMismatchError');if(!v){if(!create)throw failure('NotFoundError');v=new Dir(name);this.entries.set(name,v);}return v;}
 async getFileHandle(name,{create=false}={}){let v=this.entries.get(name);if(v instanceof Dir)throw failure('TypeMismatchError');if(!v){if(!create)throw failure('NotFoundError');v={data:new Uint8Array()};this.entries.set(name,v);}
  return {name,getFile:async()=>new Blob([v.data]),createWritable:async()=>{let p;return {write:async d=>{p=typeof d==='string'?new TextEncoder().encode(d):new Uint8Array(d);},close:async()=>{v.data=p;},abort:async()=>{}};}};}
 async removeEntry(name,{recursive}={}){assert.equal(recursive,false);if(!this.entries.has(name))throw failure('NotFoundError');this.entries.delete(name);}
 async at(path){let d=this;const parts=path.split('/');for(const p of parts.slice(0,-1))d=d.entries.get(p);return d?.entries.get(parts.at(-1));}
 async text(path){return new TextDecoder().decode((await this.at(path)).data);}
 mkdir(path){let d=this;for(const p of path.split('/')){if(!d.entries.has(p))d.entries.set(p,new Dir(p));d=d.entries.get(p);}return d;}
}

test('기록은 고른 드라이브 폴더 안에 제목 이름으로, 첨부는 그 폴더의 PKOS 첨부에',async()=>{
 const root=new Dir('내 드라이브');root.mkdir('05_수업/드론 동아리');
 const a={id:'a1',name:'비행.png',type:'image/png',blob:new Blob([new Uint8Array([1,2,3])])};
 const n=makeNote({id:'n1',title:'드론 3차시',body:'![비행](attachments/'+encodeURIComponent('a1-비행.png')+')',attachments:['a1']});
 const placeFor=()=>({dir:['05_수업','드론 동아리'],create:2});
 const res=await syncFolderMirror({handle:root,notes:[n],assets:[a],placeFor});
 assert.equal(res.manifest.notes.n1.path,'05_수업/드론 동아리/드론 3차시.md');
 assert.equal(res.manifest.assets.a1.path,'05_수업/드론 동아리/'+ATTACH_DIR+'/a1-비행.png');
 assert.match(await root.text('05_수업/드론 동아리/드론 3차시.md'),new RegExp('\\('+encodeURIComponent(ATTACH_DIR)+'/a1-'));
 assert.ok(res.paths.includes('05_수업/드론 동아리/드론 3차시.md'));
 assert.deepEqual(res.placed.n1,{dir:['05_수업','드론 동아리'],create:2});
});

test('사라진 폴더에는 새로 만들지 않고 00_PKOS로, 자리를 옮기면 예전 파일을 지운다',async()=>{
 const root=new Dir('내 드라이브');root.mkdir('05_수업/과학');
 const n=makeNote({id:'n2',title:'빛의 굴절 실험',body:'본문'});
 const gone=await syncFolderMirror({handle:root,notes:[n],placeFor:()=>({dir:['05_수업','없는 폴더'],create:2})});
 assert.equal(gone.manifest.notes.n2.path,'00_PKOS/빛의 굴절 실험.md');
 assert.equal(root.entries.get('05_수업').entries.has('없는 폴더'),false);
 const moved=await syncFolderMirror({handle:root,notes:[n],manifest:gone.manifest,placeFor:()=>({dir:['05_수업','과학'],create:2})});
 assert.equal(moved.manifest.notes.n2.path,'05_수업/과학/빛의 굴절 실험.md');
 assert.equal(moved.moved,1);assert.equal(await root.at('00_PKOS/빛의 굴절 실험.md'),undefined);
});

test('남이 만든 같은 이름 파일은 건드리지 않고, 사람이 고친 예전 파일은 지우지 않는다',async()=>{
 const root=new Dir('내 드라이브'),d=root.mkdir('03_강의');
 d.entries.set('연수 준비.md',{data:new TextEncoder().encode('선생님이 직접 쓴 파일')});
 const n=makeNote({id:'n3',title:'연수 준비',body:'앱 기록'});
 const first=await syncFolderMirror({handle:root,notes:[n],placeFor:()=>({dir:['03_강의'],create:1})});
 assert.equal(first.manifest.notes.n3.path,'03_강의/연수 준비 (2).md');
 assert.equal(await root.text('03_강의/연수 준비.md'),'선생님이 직접 쓴 파일');
 (await root.at('03_강의/연수 준비 (2).md')).data=new TextEncoder().encode('밖에서 고침');
 const next=await syncFolderMirror({handle:root,notes:[{...n,title:'연수 준비 2'}],manifest:first.manifest,placeFor:()=>({dir:['03_강의'],create:1})});
 assert.equal(next.moved,0);assert.equal(await root.text('03_강의/연수 준비 (2).md'),'밖에서 고침');
});
