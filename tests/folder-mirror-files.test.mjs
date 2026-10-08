import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeNote} from '../core.js';
import {syncFolderMirror} from '../folder-mirror-files.js';

const bytes=value=>typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value);
const digest=value=>createHash('sha256').update(bytes(value)).digest('hex');
const failure=(name,message=name)=>Object.assign(new Error(message),{name});
class Directory{
 constructor(name='',root){this.name=name;this.entries=new Map();this.root=root||this;this.calls=[];this.failName='';this.corruptName='';}
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
