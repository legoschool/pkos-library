import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNote,validateBackup,markdownFile} from '../core.js';
import {pageImageAssetId,pageImageAssetIds,pageAssetIds,documentAssetReferences,validateDocumentPages,remapDocumentPages} from '../document-pages-model.js';

const annotations=()=>({version:1,width:1000,height:750,items:[{type:'pen',color:'#cc3344',size:4,points:[{x:20,y:30},{x:80,y:120}]},{type:'sticker',text:'★',size:32,x:300,y:200}]});
function fixture(){
 const assets=[{id:'source',name:'수업.pptx',type:'application/vnd.openxmlformats-officedocument.presentationml.presentation',data:'c291cmNl'},{id:'original',name:'수업-001.png',type:'image/png',data:'iVBORw=='},{id:'drawn',name:'수업-001-필기.png',type:'image/png',data:'iVBORw=='}];
 const page={id:'page',sourceAssetId:'source',assetId:'original',annotatedAssetId:'drawn',annotations:annotations(),number:1,comment:'생각 기록',deleted:false};
 const note=makeNote({id:'note',title:'수업',body:'원래 본문',attachments:assets.map(a=>a.id),documentPages:[page]});
 return {page,note,assets};
}

test('drawn pages retain both immutable PNGs and export the composite without a duplicate attachment',()=>{
 const {page,note,assets}=fixture();
 assert.equal(pageImageAssetId(page),'drawn');assert.deepEqual(pageImageAssetIds(page),['original','drawn']);
 assert.deepEqual([...pageAssetIds(note)],['original','drawn']);
 const text=markdownFile(note,[note],assets);
 assert.match(text,/!\[1페이지\]\(attachments\/drawn-/);assert.ok(!text.includes('attachments/original-'));
 assert.equal((text.match(/attachments\/drawn-/g)||[]).length,1);assert.match(text,/생각 기록/);assert.match(text,/attachments\/source-/);
});

test('annotation layers and composite survive deleted-page backup and asset remapping',()=>{
 const {page,note,assets}=fixture();page.deleted=true;note.attachments=[];
 const before=structuredClone(note),backup={format:'pkem-backup',schema:1,notes:[note],assets,folders:['수집함']};
 assert.deepEqual(validateBackup(structuredClone(backup)).notes[0],note);
 assert.deepEqual(new Set(documentAssetReferences(note)),new Set(['source','original','drawn']));
 const remapped=remapDocumentPages(note.documentPages,new Map([['source','source-copy'],['original','original-copy'],['drawn','drawn-copy']]));
 assert.equal(remapped[0].sourceAssetId,'source-copy');assert.equal(remapped[0].assetId,'original-copy');assert.equal(remapped[0].annotatedAssetId,'drawn-copy');
 assert.deepEqual(remapped[0].annotations,annotations());assert.equal(remapped[0].deleted,true);assert.deepEqual(note,before);
 for(const id of ['source','original','drawn'])assert.throws(()=>validateBackup({...backup,assets:assets.filter(a=>a.id!==id)}),/누락/);
});

test('annotation data must be paired with a distinct composite and linked while the page is live',()=>{
 const {note,assets}=fixture();
 for(const patch of [{annotatedAssetId:undefined},{annotations:undefined},{annotatedAssetId:'original'},{annotatedAssetId:'source'},{annotatedAssetId:'../unsafe'},{annotations:{...annotations(),width:20}},{annotations:{...annotations(),items:[{type:'sticker',size:30,x:0,y:0,text:'x'.repeat(33)}]}}]){
  const next=structuredClone(note);Object.assign(next.documentPages[0],patch);assert.throws(()=>validateDocumentPages(next,assets));
 }
 assert.throws(()=>validateDocumentPages({...note,attachments:['source','original']},assets),/누락/);
 assert.throws(()=>validateDocumentPages(note,assets.map(a=>a.id==='drawn'?{...a,type:'image/jpeg'}:a)),/누락/);
 const cleared=structuredClone(note);cleared.documentPages[0].annotations.items=[];assert.doesNotThrow(()=>validateDocumentPages(cleared,assets));
});

test('composites cannot alias another page original or composite',()=>{
 const {note,assets}=fixture();assets.push({id:'second',name:'수업-002.png',type:'image/png',data:'iVBORw=='});note.attachments.push('second');
 const second={...structuredClone(note.documentPages[0]),id:'page-2',number:2,assetId:'second'};
 note.documentPages.push(second);assert.throws(()=>validateDocumentPages(note,assets),/손상/);
 delete second.annotations;delete second.annotatedAssetId;assert.doesNotThrow(()=>validateDocumentPages(note,assets));
 second.assetId='drawn';assert.throws(()=>validateDocumentPages(note,assets),/손상/);
});
