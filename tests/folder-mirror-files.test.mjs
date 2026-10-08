import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeNote} from '../core.js';
import {syncFolderMirror} from '../folder-mirror-files.js';

const bytes=value=>typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value);
const digest=value=>createHash('sha256').update(bytes(value)).digest('hex');
const failure=(name,message=name)=>Object.assign(new Error(message),{name});
class Directory{
 constructor(name='',root){this.name=name;this.entries=new Map();this.root=root||this;this.calls=[];this.failName='';this.corruptName='';this.failRemove='';this.removed=[];}
 check(name){assert.ok(name&&name!=='.'&&name!=='..'&&!/[\\/]/.test(name),'single safe filename');this.root.calls.push(name);}
 async getDirectoryHandle(name,{create=false}={}){
  this.check(name);let value=this.entries.get(name);
  if(value&&!(value instanceof Directory))throw failure('TypeMismatchError');
  if(!value){if(!create)throw failure('NotFoundError');value=new Directory(name,this.root);this.entries.set(name,value);}return value;
 }
 async getFileHandle(name,{create=false}={}){
  this.check(name);let value=this.entries.get(name);
  if(value instanceof Directory)throw failure('TypeMismatchError');
  if(!value){if(!create)throw failure('NotFoundError');value={data:bytes(''),writes:0};this.entries.set(name,value);}
  const root=this.root;
  return {name,getFile:async()=>new Blob([value.data]),createWritable:async()=>{
   let pending;
   return {write:async data=>{if(root.failName===name)throw failure('NotAllowedError');pending=bytes(data);},close:async()=>{value.data=root.corruptName===name?bytes('corrupt'):pending;value.writes++;},abort:async()=>{}};
  }};
 }
 async removeEntry(name,options){
  this.check(name);assert.equal(options?.recursive,false,'page deletion must be nonrecursive');
  if(this.root.failRemove===name)throw failure('NotAllowedError');
  if(!this.entries.has(name))throw failure('NotFoundError');
  assert.ok(!(this.entries.get(name) instanceof Directory),'must never remove directories');
  this.entries.delete(name);this.root.removed.push((this.name?this.name+'/':'')+name);
 }
 async entry(path){const segments=path.split('/');return segments.length===1?this.entries.get(path):(await this.getDirectoryHandle(segments[0])).entries.get(segments[1]);}
 async text(path){return new TextDecoder().decode((await this.entry(path)).data);}
 async put(path,value){const split=path.split('/'),directory=split.length===1?this:await this.getDirectoryHandle(split[0],{create:true});directory.entries.set(split.at(-1),{data:bytes(value),writes:0});}
}
const note=(id,title='기록',data={})=>makeNote({id,title,body:'본문',...data});
const asset=(id='a',name='원본.webm',value=new Uint8Array([0,255,1,2,128]))=>({id,name,type:'application/octet-stream',blob:new Blob([value])});

test('title-named Markdown and original attachment bytes, then same-path update and idempotent retry',async()=>{
 const handle=new Directory(),a=asset(),n=note('n','나의 수업',{attachments:['a']});
 const first=await syncFolderMirror({handle,notes:[n],assets:[a]});
 assert.equal(first.written,2);assert.equal(first.conflicts,0);
 const path=first.manifest.notes.n.path,assetPath=first.manifest.assets.a.path;
 assert.match(path,/^나의 수업--n\.md$/);
 assert.equal(first.manifest.assets.a.hash,digest(await a.blob.arrayBuffer()));
 assert.deepEqual((await handle.entry(assetPath)).data,new Uint8Array(await a.blob.arrayBuffer()));
 const second=await syncFolderMirror({handle,notes:[{...n,body:'수정한 본문'}],assets:[a],manifest:first.manifest});
 assert.equal(second.manifest.notes.n.path,path);assert.match(await handle.text(path),/수정한 본문/);assert.equal(second.written,1);assert.equal(second.skipped,1);
 const third=await syncFolderMirror({handle,notes:[{...n,body:'수정한 본문'}],assets:[a],manifest:second.manifest});
 assert.equal(third.written,0);assert.equal(third.skipped,2);
 assert.notEqual(first.manifest.notes.n.hash,second.manifest.notes.n.hash,'input manifest is immutable');
});

test('external note edits are preserved and future writes use the new conflict copy',async()=>{
 const handle=new Directory(),n=note('n');
 const first=await syncFolderMirror({handle,notes:[n]});
 await handle.put(first.manifest.notes.n.path,'외부에서 고친 원문');
 const next=await syncFolderMirror({handle,notes:[{...n,body:'앱의 새 글'}],manifest:first.manifest});
 assert.equal(next.conflicts,1);assert.notEqual(next.manifest.notes.n.path,first.manifest.notes.n.path);
 assert.equal(await handle.text(first.manifest.notes.n.path),'외부에서 고친 원문');
 const again=await syncFolderMirror({handle,notes:[{...n,body:'다시 고친 글'}],manifest:next.manifest});
 assert.equal(again.manifest.notes.n.path,next.manifest.notes.n.path);
 assert.equal(await handle.text(first.manifest.notes.n.path),'외부에서 고친 원문');
});

test('unknown existing file or directory is not adopted, even if contents match',async()=>{
 const handle=new Directory(),n=note('n');
 const first=await syncFolderMirror({handle,notes:[n]});
 const next=await syncFolderMirror({handle,notes:[n]});
 assert.notEqual(next.manifest.notes.n.path,first.manifest.notes.n.path);
 const dir=new Directory();await dir.getDirectoryHandle('기록--n.md',{create:true});
 const saved=await syncFolderMirror({handle:dir,notes:[n]});
 assert.equal(saved.manifest.notes.n.path,'기록--n (2).md');
});

test('title rename creates searchable current title and retains earlier snapshot; trash never deletes',async()=>{
 const handle=new Directory(),n=note('n','이전 제목');
 const first=await syncFolderMirror({handle,notes:[n]});
 const next=await syncFolderMirror({handle,notes:[{...n,title:'바꾼 제목'}],manifest:first.manifest});
 assert.match(next.manifest.notes.n.path,/^바꾼 제목/);assert.ok(await handle.entry(first.manifest.notes.n.path));
 const trash=await syncFolderMirror({handle,notes:[{...n,deleted:true}],manifest:next.manifest});
 assert.equal(trash.written,0);assert.ok(await handle.entry(next.manifest.notes.n.path));
 assert.deepEqual(trash.manifest,next.manifest);
});

test('duplicate titles, hostile identifiers, reserved Windows names and long astral titles stay in folder',async()=>{
 const handle=new Directory(),items=[note('../../escaped','CON'),note('__proto__','기록'),note('same','기록'),note('same-2','😀'.repeat(200)),note('a/b','..'),note('a\\b','NUL.txt')];
 const result=await syncFolderMirror({handle,notes:items});
 assert.equal(new Set(Object.values(result.manifest.notes).map(x=>x.path)).size,items.length);
 for(const entry of Object.values(result.manifest.notes)){
  assert.ok(entry.path.length<220);assert.ok(!/[\\/]/.test(entry.path));assert.ok(!/^(CON|NUL)(?:\.|$)/i.test(entry.path));
 }
 assert.equal(Object.getPrototypeOf(result.manifest.notes),null);assert.ok(Object.hasOwn(result.manifest.notes,'__proto__'));
});

test('malicious manifest paths ignored and prototype-shaped keys stay plain metadata',async()=>{
 const handle=new Directory(),n=note('__proto__');
 const manifest={version:1,notes:JSON.parse('{"__proto__":{"path":"../../victim.md","hash":"'+'a'.repeat(64)+'","title":"기록"}}'),assets:{}};
 const result=await syncFolderMirror({handle,notes:[n],manifest});
 assert.equal(result.manifest.notes.__proto__.path,'기록--__proto__.md');
 assert.equal(({}).path,undefined);
});

test('attachment collisions, parentheses and unsafe IDs produce consistent readable links',async()=>{
 const handle=new Directory(),a=asset('../../a','녹음 (1).webm'),n=note('n','녹음',{attachments:[a.id]});
 const first=await syncFolderMirror({handle,notes:[n],assets:[a]});
 await handle.put(first.manifest.assets[a.id].path,'external');
 const next=await syncFolderMirror({handle,notes:[n],assets:[a],manifest:first.manifest});
 assert.equal(await handle.text(first.manifest.assets[a.id].path),'external');
 const markdown=await handle.text(next.manifest.notes.n.path),link=markdown.match(/\]\((attachments\/[^)]+)\)/)?.[1];
 assert.ok(link);assert.equal(decodeURIComponent(link),next.manifest.assets[a.id].path);
 assert.match(next.manifest.assets[a.id].path,/\.webm$/);
});

test('wiki links resolve to actual names including sanitized IDs and conflict copies',async()=>{
 const handle=new Directory(),a=note('a','첫 글',{body:'[[둘째 글]]',links:['../../b']}),b=note('../../b','둘째 글');
 const first=await syncFolderMirror({handle,notes:[a,b]});
 await handle.put(first.manifest.notes[b.id].path,'외부 변경');
 const next=await syncFolderMirror({handle,notes:[a,b],manifest:first.manifest});
 assert.ok((await handle.text(next.manifest.notes.a.path)).includes('[['+next.manifest.notes[b.id].path.slice(0,-3)+'|둘째 글]]'));
});

test('missing attachment stops before any note output',async()=>{
 const handle=new Directory();
 await assert.rejects(syncFolderMirror({handle,notes:[note('n','기록',{attachments:['missing']})]}),/첨부 파일 원본/);
 assert.equal(handle.entries.size,0);
});

test('partial failure carries only verified ownership, so retry safely finishes without duplicating completed output',async()=>{
 const handle=new Directory(),a=asset(),n=note('n','기록',{attachments:['a']});
 handle.failName='기록--n.md';let partial;
 try{await syncFolderMirror({handle,notes:[n],assets:[a]});assert.fail('must fail');}catch(error){partial=error.partialResult;assert.equal(error.name,'NotAllowedError');}
 assert.equal(partial.written,1);assert.ok(partial.manifest.assets.a);assert.equal(partial.manifest.notes.n,undefined);
 handle.failName='';
 const next=await syncFolderMirror({handle,notes:[n],assets:[a],manifest:partial.manifest});
 assert.equal(next.manifest.assets.a.path,partial.manifest.assets.a.path);assert.equal(next.skipped,1);
 assert.match(await handle.text(next.manifest.notes.n.path),/본문/);
});

test('write verification failure never claims ownership of damaged bytes',async()=>{
 const handle=new Directory();handle.corruptName='기록--n.md';
 await assert.rejects(syncFolderMirror({handle,notes:[note('n')]}),error=>{
  assert.match(error.message,/확인하지 못/);assert.equal(error.partialResult.manifest.notes.n,undefined);return true;
 });
});

test('change occurring during a run is preserved; partial result can replan on retry',async()=>{
 const handle=new Directory(),a=asset(),n=note('n','기록',{attachments:['a']});
 const first=await syncFolderMirror({handle,notes:[n],assets:[a]});let partial;
 try{await syncFolderMirror({handle,notes:[{...n,body:'updated'}],assets:[a],manifest:first.manifest,onProgress:async progress=>{if(progress.kind==='asset')await handle.put(first.manifest.notes.n.path,'changed while syncing');}});assert.fail('must fail');}
 catch(error){assert.equal(error.name,'FolderMirrorConflictError');partial=error.partialResult;}
 assert.equal(await handle.text(first.manifest.notes.n.path),'changed while syncing');
 const next=await syncFolderMirror({handle,notes:[{...n,body:'updated'}],assets:[a],manifest:partial.manifest});
 assert.notEqual(next.manifest.notes.n.path,first.manifest.notes.n.path);assert.equal(await handle.text(first.manifest.notes.n.path),'changed while syncing');
});

test('progress reports attachments before notes, total and committed counts',async()=>{
 const handle=new Directory(),progress=[];
 const result=await syncFolderMirror({handle,notes:[note('n','기록',{attachments:['a']})],assets:[asset()],onProgress:event=>progress.push(event)});
 assert.deepEqual(progress.map(x=>x.kind),['asset','note']);assert.deepEqual(progress.map(x=>x.done),[1,2]);
 assert.equal(progress[1].total,2);assert.equal(progress[1].written,result.written);
});

const convertedPage=(assetId='page-image',number=1)=>({id:'page-'+number,sourceAssetId:'source',assetId,number,comment:'쪽 메모',deleted:false});
const pngAsset=(id='page-image')=>({...asset(id,'문서-'+id+'.png',new Uint8Array([137,80,78,71,13,10,26,10,0,255,12,6])),type:'image/png'});
const pageFixture=()=>{
 const page=convertedPage(),image=pngAsset(),source=asset('source','원본.pdf'),n=note('n','문서',{attachments:['source',image.id],documentPages:[page]});
 return {page,image,source,n,assets:[source,image],deleted:{...n,attachments:['source'],documentPages:[{...page,deleted:true}]}};
};

test('explicit converted-page deletion removes only its verified PNG after Markdown succeeds',async()=>{
 const handle=new Directory(),f=pageFixture(),first=await syncFolderMirror({handle,notes:[f.n],assets:f.assets});
 assert.deepEqual(first.manifest.assets[f.image.id].documentPages,[{noteId:'n',id:f.page.id,sourceAssetId:'source',number:1}]);
 const events=[];
 const result=await syncFolderMirror({handle,notes:[f.deleted],assets:f.assets,manifest:first.manifest,onProgress:event=>{
  events.push(event.kind);if(event.kind==='note')assert.equal(handle.removed.length,0,'deletion waits for Markdown');
 }});
 assert.equal(result.removed,1);assert.deepEqual(handle.removed,[first.manifest.assets[f.image.id].path]);
 assert.equal(await handle.entry(first.manifest.assets[f.image.id].path),undefined);
 assert.ok(await handle.entry(first.manifest.assets.source.path));assert.equal(result.manifest.assets[f.image.id],undefined);
 assert.ok(!events.slice(0,events.indexOf('note')).includes('page-delete'));assert.equal(events.at(-1),'page-delete');
 assert.ok(!Object.hasOwn(result.manifest.assets,f.image.id));
 const again=await syncFolderMirror({handle,notes:[f.deleted],assets:f.assets,manifest:result.manifest});
 assert.equal(again.removed,0);assert.equal(handle.removed.length,1);
});

test('ordinary detach, record trash and disappeared page metadata never infer deletion',async()=>{
 for(const mode of ['detach','trash','metadata']){
  const handle=new Directory(),f=pageFixture(),first=await syncFolderMirror({handle,notes:[f.n],assets:f.assets});
  const next=mode==='trash'?{...f.deleted,deleted:true}:mode==='metadata'?{...f.n,attachments:['source'],documentPages:[]}:{...f.n,attachments:['source']};
  const result=await syncFolderMirror({handle,notes:[next],assets:f.assets,manifest:first.manifest});
  assert.equal(result.removed,0,mode);assert.ok(await handle.entry(first.manifest.assets[f.image.id].path),mode);
 }
});

test('forged tombstones cannot delete ordinary attachments or mismatched converted pages',async()=>{
 const f=pageFixture();
 for(const mode of ['ordinary','page-id','source-id','number','note-id']){
  const handle=new Directory();
  const original=mode==='ordinary'?{...f.n,documentPages:[]}:f.n;
  const first=await syncFolderMirror({handle,notes:[original],assets:f.assets});
  const deleted=structuredClone(f.deleted);
  if(mode==='page-id')deleted.documentPages[0].id='forged';
  if(mode==='source-id')deleted.documentPages[0].sourceAssetId='someone-else';
  if(mode==='number')deleted.documentPages[0].number=2;
  if(mode==='note-id')deleted.id='other-note';
  const result=await syncFolderMirror({handle,notes:[deleted],assets:f.assets,manifest:first.manifest});
  assert.equal(result.removed,0,mode);assert.ok(await handle.entry(first.manifest.assets[f.image.id].path),mode);
 }
});

test('a source original and an invalid PNG never acquire deletable page ownership',async()=>{
 for(const mode of ['source-equals-image','missing-source','invalid-bytes','wrong-type']){
  const handle=new Directory(),f=pageFixture();
  if(mode==='source-equals-image')f.n.documentPages[0].sourceAssetId=f.image.id;
  if(mode==='missing-source'){f.n.attachments=f.n.attachments.filter(id=>id!=='source');f.deleted.attachments=[];f.assets=f.assets.filter(a=>a.id!=='source');}
  if(mode==='invalid-bytes')f.image.blob=new Blob(['not a PNG']);
  if(mode==='wrong-type')f.image.type='application/pdf';
  const first=await syncFolderMirror({handle,notes:[f.n],assets:f.assets});
  assert.equal(first.manifest.assets[f.image.id].documentPages,undefined,mode);
  const result=await syncFolderMirror({handle,notes:[f.deleted],assets:f.assets,manifest:first.manifest});
  assert.equal(result.removed,0,mode);
 }
});

test('shared references in live or trashed notes preserve a tombstoned page until references are gone',async()=>{
 for(const trashed of [false,true]){
  const handle=new Directory(),f=pageFixture(),other=note('other','공유',{attachments:[f.image.id],deleted:trashed});
  const first=await syncFolderMirror({handle,notes:[f.n,other],assets:f.assets});
  const blocked=await syncFolderMirror({handle,notes:[f.deleted,other],assets:f.assets,manifest:first.manifest});
  assert.equal(blocked.removed,0);assert.ok(await handle.entry(first.manifest.assets[f.image.id].path));
  const removed=await syncFolderMirror({handle,notes:[f.deleted,{...other,attachments:[]}],assets:f.assets,manifest:blocked.manifest});
  assert.equal(removed.removed,1);
 }
});

test('live page restoration in another record protects image even while attachment reference is absent',async()=>{
 const handle=new Directory(),f=pageFixture(),first=await syncFolderMirror({handle,notes:[f.n],assets:f.assets});
 const other=note('other','복원 중',{documentPages:[f.page],attachments:[]});
 const result=await syncFolderMirror({handle,notes:[f.deleted,other],assets:f.assets,manifest:first.manifest});
 assert.equal(result.removed,0);assert.ok(await handle.entry(first.manifest.assets[f.image.id].path));
});

test('external changes to deleted page are preserved once and restoration chooses a safe new path',async()=>{
 const handle=new Directory(),f=pageFixture(),first=await syncFolderMirror({handle,notes:[f.n],assets:f.assets});
 const path=first.manifest.assets[f.image.id].path;await handle.put(path,'external image changes');
 const next=await syncFolderMirror({handle,notes:[f.deleted],assets:f.assets,manifest:first.manifest});
 assert.equal(next.removed,0);assert.equal(next.conflicts,1);assert.equal(await handle.text(path),'external image changes');
 assert.equal(next.manifest.assets[f.image.id],undefined);
 const again=await syncFolderMirror({handle,notes:[f.deleted],assets:f.assets,manifest:next.manifest});
 assert.equal(again.conflicts,0);assert.equal(again.removed,0);
 const restore=await syncFolderMirror({handle,notes:[f.n],assets:f.assets,manifest:again.manifest});
 assert.notEqual(restore.manifest.assets[f.image.id].path,path);assert.equal(await handle.text(path),'external image changes');
});

test('page PNG restoration recreates bytes and ownership after an explicit deletion',async()=>{
 const handle=new Directory(),f=pageFixture(),first=await syncFolderMirror({handle,notes:[f.n],assets:f.assets});
 const deleted=await syncFolderMirror({handle,notes:[f.deleted],assets:f.assets,manifest:first.manifest});
 const restored=await syncFolderMirror({handle,notes:[f.n],assets:f.assets,manifest:deleted.manifest});
 assert.deepEqual((await handle.entry(restored.manifest.assets[f.image.id].path)).data,new Uint8Array(await f.image.blob.arrayBuffer()));
 assert.equal(restored.manifest.assets[f.image.id].documentPages.length,1);
 assert.equal(restored.manifest.assets[f.image.id].path,first.manifest.assets[f.image.id].path);
 const deletedAgain=await syncFolderMirror({handle,notes:[f.deleted],assets:f.assets,manifest:restored.manifest});
 assert.equal(deletedAgain.removed,1);
});

test('detaching the original before first mirror still allows explicit generated-page deletion',async()=>{
 const handle=new Directory(),f=pageFixture();
 const detached={...f.n,attachments:[f.image.id]};
 const first=await syncFolderMirror({handle,notes:[detached],assets:f.assets});
 assert.equal(first.manifest.assets[f.image.id].documentPages.length,1,'retained source metadata proves page ownership');
 assert.equal(first.manifest.assets.source,undefined,'ordinary detached source is not reattached/exported');
 const deleted={...f.deleted,attachments:[]};
 const result=await syncFolderMirror({handle,notes:[deleted],assets:f.assets,manifest:first.manifest});
 assert.equal(result.removed,1);assert.equal(await handle.entry(first.manifest.assets[f.image.id].path),undefined);
 assert.deepEqual(new Uint8Array(await f.source.blob.arrayBuffer()),new Uint8Array([0,255,1,2,128]),'source bytes stay unchanged');
});

test('Markdown failure postpones every page deletion; successful retry removes it',async()=>{
 const handle=new Directory(),f=pageFixture(),first=await syncFolderMirror({handle,notes:[f.n],assets:f.assets});
 handle.failName=first.manifest.notes.n.path;let partial;
 await assert.rejects(syncFolderMirror({handle,notes:[f.deleted],assets:f.assets,manifest:first.manifest}),error=>{partial=error.partialResult;return error.name==='NotAllowedError';});
 assert.equal(partial.removed,0);assert.ok(await handle.entry(first.manifest.assets[f.image.id].path));
 handle.failName='';
 const retry=await syncFolderMirror({handle,notes:[f.deleted],assets:f.assets,manifest:partial.manifest});
 assert.equal(retry.removed,1);
});

test('partial deletion failure checkpoints completed deletes and retries only remaining owned PNG',async()=>{
 const handle=new Directory(),f=pageFixture(),second=pngAsset('page-two'),page2=convertedPage(second.id,2),assets=[...f.assets,second];
 const n={...f.n,attachments:[...f.n.attachments,second.id],documentPages:[f.page,page2]};
 const first=await syncFolderMirror({handle,notes:[n],assets});
 const deleted={...n,attachments:['source'],documentPages:n.documentPages.map(page=>({...page,deleted:true}))};
 handle.failRemove=first.manifest.assets[second.id].path.split('/').at(-1);let partial;
 await assert.rejects(syncFolderMirror({handle,notes:[deleted],assets,manifest:first.manifest}),error=>{partial=error.partialResult;return error.name==='NotAllowedError';});
 assert.equal(partial.removed,1);assert.equal(partial.manifest.assets[f.image.id],undefined);assert.ok(partial.manifest.assets[second.id]);
 handle.failRemove='';
 const next=await syncFolderMirror({handle,notes:[deleted],assets,manifest:partial.manifest});
 assert.equal(next.removed,1);assert.equal(handle.removed.length,2);assert.equal(next.manifest.assets[second.id],undefined);
});

test('already missing page reconciles manifest without deleting any other path',async()=>{
 const handle=new Directory(),f=pageFixture(),first=await syncFolderMirror({handle,notes:[f.n],assets:f.assets});
 const path=first.manifest.assets[f.image.id].path;(await handle.getDirectoryHandle('attachments')).entries.delete(path.split('/').at(-1));
 const next=await syncFolderMirror({handle,notes:[f.deleted],assets:f.assets,manifest:first.manifest});
 assert.equal(next.removed,0);assert.equal(next.manifest.assets[f.image.id],undefined);assert.equal(handle.removed.length,0);
});

test('page deletion rejects unsafe manifest paths and preserves directories replacing the PNG',async()=>{
 for(const mode of ['unsafe-path','directory']){
  const handle=new Directory(),f=pageFixture(),first=await syncFolderMirror({handle,notes:[f.n],assets:f.assets});
  const path=first.manifest.assets[f.image.id].path;
  if(mode==='unsafe-path')first.manifest.assets[f.image.id].path='attachments/../../victim.png';
  else (await handle.getDirectoryHandle('attachments')).entries.set(path.split('/').at(-1),new Directory('replacement'));
  const next=await syncFolderMirror({handle,notes:[f.deleted],assets:f.assets,manifest:first.manifest});
  assert.equal(next.removed,0);assert.equal(handle.removed.length,0);
 }
});
