import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNote,validateBackup} from '../core.js';
import {drawingsOf,drawingAssetIds,validateDrawings,remapDrawings,pruneDrawings} from '../drawings-model.js';

const assets=[{id:'drawing-png-a',name:'그림 1.png',type:'image/png',data:'iVBORw0KGgo='},{id:'drawing-png-b',name:'그림 2.png',type:'image/png',data:'iVBORw0KGgo='}];
const annotations=()=>({version:1,width:1000,height:625,items:[{type:'pen',color:'#1954AD',size:5,points:[{x:0,y:0},{x:1000,y:625}]},{type:'sticker',text:'★',size:32,x:100,y:100}]});
const fixture=()=>makeNote({attachments:assets.map(asset=>asset.id),drawings:assets.map((asset,i)=>({id:'drawing-'+i,assetId:asset.id,annotations:annotations()}))});
const backup=note=>({format:'pkem-backup',schema:1,notes:[note],assets:structuredClone(assets),folders:['수집함']});

test('notes from before drawing support and empty drawing lists remain valid',()=>{
 const note=makeNote();assert.deepEqual(drawingsOf(note),[]);assert.deepEqual(drawingsOf(),[]);assert.deepEqual([...drawingAssetIds(note)],[]);
 assert.doesNotThrow(()=>validateDrawings(note,[]));assert.doesNotThrow(()=>validateBackup(backup(note)));
 assert.doesNotThrow(()=>validateBackup(backup({...note,drawings:[]})));
});

test('backup retains drawing order, editable vector layers, and PNG bytes unchanged',()=>{
 const data=backup(fixture()),before=structuredClone(data);
 assert.deepEqual(validateBackup(data),before);assert.deepEqual(drawingsOf(data.notes[0]),before.notes[0].drawings);
 assert.deepEqual([...drawingAssetIds(data.notes[0])],assets.map(asset=>asset.id));
 const decoded=JSON.parse(JSON.stringify(data));assert.deepEqual(validateBackup(decoded),data);
});

test('malformed lists, identifiers, and duplicate drawing or image IDs are rejected',()=>{
 const mutations=[n=>n.drawings=null,n=>n.drawings={},n=>n.drawings=Array(2001).fill(n.drawings[0]),n=>n.drawings[0]=null,n=>n.drawings[0].id='',n=>n.drawings[0].id='bad id',n=>n.drawings[0].id='x'.repeat(129),n=>n.drawings[0].assetId='../file',n=>n.drawings[0].assetId=42,n=>n.drawings[1].id=n.drawings[0].id,n=>n.drawings[1].assetId=n.drawings[0].assetId];
 for(const mutate of mutations){const note=fixture();mutate(note);assert.throws(()=>validateBackup(backup(note)),/그림.*손상/);}
});

test('drawing references must point to attached PNGs, including in deleted notes',()=>{
 for(const deleted of [false,true]){
  const note={...fixture(),deleted};
  assert.throws(()=>validateDrawings({...note,attachments:[assets[0].id]},assets),/누락/);
  assert.throws(()=>validateDrawings(note,assets.slice(1)),/누락/);
  for(const type of ['image/jpeg','application/octet-stream','text/html'])assert.throws(()=>validateDrawings(note,assets.map(asset=>({...asset,type}))),/누락/);
 }
});

test('invalid vector coordinates, colors, shapes, or canvas proportions cannot enter a backup',()=>{
 const mutations=[a=>a.version=2,a=>a.width=1600,a=>a.height=1000,a=>a.height=625.1,a=>a.items[0].points[0].x=-1,a=>a.items[0].points[0].y=626,a=>a.items[0].points[0].x=Infinity,a=>a.items[0].color='red',a=>a.items[0].size=0,a=>a.items[0].points=[],a=>a.items[0].type='script',a=>a.items[1].text='',a=>a.items[1].x=1001];
 for(const mutate of mutations){const note=fixture();mutate(note.drawings[0].annotations);assert.throws(()=>validateBackup(backup(note)));}
 const note=fixture();delete note.drawings[0].annotations;assert.throws(()=>validateBackup(backup(note)),/그림 데이터/);
});

test('unbounded vector complexity is rejected by the shared annotation limits',()=>{
 const note=fixture();note.drawings[0].annotations.items[0].points=Array(20001).fill({x:1,y:1});assert.throws(()=>validateBackup(backup(note)),/좌표/);
 note.drawings[0].annotations=annotations();note.drawings[0].annotations.items=Array(2001).fill(annotations().items[1]);assert.throws(()=>validateBackup(backup(note)),/그림 데이터/);
});

test('asset collisions remap image references while preserving drawing identities and vectors',()=>{
 const note=fixture(),before=structuredClone(note),map=new Map([[assets[0].id,'imported-png']]);
 const drawings=remapDrawings(note.drawings,map),incomingAssets=assets.map(asset=>({...asset,id:map.get(asset.id)||asset.id}));
 assert.deepEqual(drawings,[{...before.drawings[0],assetId:'imported-png'},before.drawings[1]]);
 assert.doesNotThrow(()=>validateDrawings({...note,drawings,attachments:incomingAssets.map(asset=>asset.id)},incomingAssets));
 assert.deepEqual(note,before);assert.equal(remapDrawings(undefined,map),undefined);
});

test('detaching a drawing prunes only its editable reference and leaves remaining data intact',()=>{
 const note=fixture(),before=structuredClone(note);
 assert.deepEqual(pruneDrawings(note,[assets[1].id]),[before.drawings[1]]);
 assert.deepEqual(pruneDrawings(note,[]),[]);assert.deepEqual(pruneDrawings(note),before.drawings);
 assert.deepEqual(pruneDrawings(makeNote()),[]);assert.deepEqual(note,before);
});
