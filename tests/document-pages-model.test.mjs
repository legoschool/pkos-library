import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNote,validateBackup,markdownFile,filterNotes} from '../core.js';
import {pagesOf,pageAssetIds,documentAssetReferences,validateDocumentPages,remapDocumentPages,pageMarkdown,documentPageFile} from '../document-pages-model.js';
import {documentPagesHTML} from '../document-pages.js';

const page=(number=1,extra={})=>({id:'page-'+number,sourceAssetId:'original',assetId:'png-'+number,number,comment:'의견 '+number,deleted:false,...extra});
function fixture(){
 const assets=[{id:'original',name:'강의.pdf',type:'application/pdf',data:'JVBERg=='},{id:'png-1',name:'강의-001.png',type:'image/png',data:'iVBORw=='},{id:'png-2',name:'강의-002.png',type:'image/png',data:'iVBORw=='}];
 const note=makeNote({id:'note',title:'수업',body:'원래 본문',attachments:assets.map(a=>a.id),documentPages:[page(1),page(2)]});
 return {note,assets};
}

test('old notes and empty document page metadata remain valid',()=>{
 const note=makeNote();assert.deepEqual(pagesOf(note),[]);assert.deepEqual([...pageAssetIds(note)],[]);
 assert.doesNotThrow(()=>validateDocumentPages(note,[]));
 assert.doesNotThrow(()=>validateDocumentPages({...note,documentPages:[]},[]));
});

test('document references include detached originals and tombstoned PNGs exactly once',()=>{
 const {note}=fixture();note.attachments=['ordinary','png-1'];note.documentPages[1].deleted=true;
 assert.deepEqual(new Set(documentAssetReferences(note)),new Set(['ordinary','original','png-1','png-2']));
 assert.equal(documentAssetReferences(note).length,4);
});

test('page identity, number, source and comments survive asset ID remapping without mutation',()=>{
 const pages=[page(1),page(2,{deleted:true,comment:'여러 줄\n삭제 전 의견'})],before=structuredClone(pages);
 const remapped=remapDocumentPages(pages,new Map([['original','new-original'],['png-2','copy-png-2']]));
 assert.deepEqual(pages,before);assert.notEqual(remapped,pages);
 assert.equal(remapped[1].sourceAssetId,'new-original');assert.equal(remapped[1].assetId,'copy-png-2');
 assert.equal(remapped[1].id,'page-2');assert.equal(remapped[1].number,2);assert.equal(remapped[1].comment,'여러 줄\n삭제 전 의견');assert.equal(remapped[1].deleted,true);
});

test('backup preserves page comments and tombstones with their retained original/image assets',()=>{
 const {note,assets}=fixture();note.documentPages[0].deleted=true;note.attachments=note.attachments.filter(id=>id!=='png-1');
 const backup={format:'pkem-backup',schema:1,notes:[note],assets,folders:['수집함']};
 assert.deepEqual(validateBackup(structuredClone(backup)).notes[0].documentPages,note.documentPages);
 for(const missing of ['original','png-1','png-2'])assert.throws(()=>validateBackup({...backup,assets:assets.filter(a=>a.id!==missing)}),/누락/);
});

test('duplicate page IDs, image IDs and source-page positions are rejected',()=>{
 const {note,assets}=fixture();
 for(const duplicate of [{id:'page-1'},{assetId:'png-1'},{number:1}]){
  const bad=structuredClone(note);Object.assign(bad.documentPages[1],duplicate);
  assert.throws(()=>validateDocumentPages(bad,assets),/손상/);
 }
});

test('malformed page fields and unlinked live images are rejected',()=>{
 const {note,assets}=fixture();
 for(const patch of [{id:'../page'},{assetId:'original'},{number:0},{number:1.5},{comment:5},{comment:'x'.repeat(100001)},{deleted:'true'}]){
  const bad=structuredClone(note);Object.assign(bad.documentPages[0],patch);assert.throws(()=>validateDocumentPages(bad,assets));
 }
 assert.throws(()=>validateDocumentPages({...note,attachments:['original','png-2']},assets),/누락/);
 assert.throws(()=>validateDocumentPages(note,assets.map(a=>a.id==='png-1'?{...a,type:'image/jpeg'}:a)),/누락/);
});

test('Markdown includes each live page and opinion, preserves original link and omits deleted content',()=>{
 const {note,assets}=fixture();note.documentPages[1].deleted=true;note.attachments=note.attachments.filter(id=>id!=='png-2');
 const text=markdownFile(note,[note],assets);
 assert.match(text,/원래 본문/);assert.match(text,/강의\.pdf · 1페이지/);assert.match(text,/!\[1페이지\]\(attachments\/png-1-/);assert.match(text,/### 내 의견\n\n의견 1/);
 assert.ok(!text.includes('의견 2'));assert.ok(!text.includes('png-2'));
 assert.equal((text.match(/png-1-/g)||[]).length,1);assert.match(text,/\[강의\.pdf\]\(attachments\/original-/);
});

test('deletion never renumbers the remaining page heading',()=>{
 const {note,assets}=fixture();note.documentPages[0].deleted=true;note.attachments=note.attachments.filter(id=>id!=='png-1');
 const text=pageMarkdown(note,assets,asset=>'file/'+asset.id);
 assert.match(text,/2페이지/);assert.ok(!text.includes('1페이지'));assert.match(text,/의견 2/);
});

test('page opinions participate in body search; deleted opinions are excluded',()=>{
 const {note}=fixture();note.documentPages[0].comment='반짝이는 질적분석';note.documentPages[1].comment='삭제된 암호';note.documentPages[1].deleted=true;
 assert.equal(filterNotes([note],{q:'질적분석',fields:['body']}).length,1);
 assert.equal(filterNotes([note],{q:'암호',fields:['body']}).length,0);
});

test('page reader/editor escapes comments and filenames, and restore controls remain available',()=>{
 const {note,assets}=fixture();note.documentPages[0].comment='</textarea><script>alert(1)</script>';note.documentPages[1].deleted=true;assets[0].name='<img src=x onerror=alert(1)>.pdf';
 const html=documentPagesHTML(note,assets,()=> 'blob:isolated-test',true);
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;/textarea&gt;'));
 assert.ok(html.includes('data-page-comment="page-1"'));assert.ok(html.includes('data-action="page-restore"'));
 assert.ok(!documentPagesHTML({...note,deleted:true},assets,()=> 'blob:isolated-test').includes('data-action="page-delete"'));
});

test('document picker identifies PDF/PPTX and retains explicit legacy PPT handling',()=>{
 for(const name of ['강의.PDF','강의.pptx','강의.ppt'])assert.ok(documentPageFile({name}));
 assert.ok(documentPageFile({name:'원본',type:'application/pdf'}));
 assert.ok(!documentPageFile({name:'녹음.webm',type:'video/webm'}));
});
