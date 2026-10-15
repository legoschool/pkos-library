import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNote,validateBackup} from '../core.js';
import {isImageAsset,imageGroupsOf,groupedImageIds,validateImageGroups,remapImageGroups,pruneImageGroups} from '../image-groups-model.js';

const assets=[{id:'photo-a',name:'A.JPG',type:'application/octet-stream',data:'YQ=='},{id:'photo-b',name:'second',type:'image/webp',data:'Yg=='},{id:'photo-c',name:'C.png',type:'image/png',data:'Yw=='}];
const fixture=()=>makeNote({attachments:assets.map(a=>a.id),imageGroups:[{id:'group-a',assetIds:['photo-a','photo-b'],mode:'slides'},{id:'group-b',assetIds:['photo-c'],mode:'expanded'}]});
const backup=note=>({format:'pkem-backup',schema:1,notes:[note],assets:structuredClone(assets),folders:['수집함']});

test('legacy records remain valid and images are detected by MIME or filename',()=>{
 const note=makeNote();assert.deepEqual(imageGroupsOf(note),[]);assert.deepEqual([...groupedImageIds(note)],[]);
 assert.doesNotThrow(()=>validateImageGroups(note,[]));assert.doesNotThrow(()=>validateBackup(backup(note)));
 assert.ok(assets.every(isImageAsset));assert.ok(isImageAsset({type:'IMAGE/JPEG'}));
 assert.equal(isImageAsset({name:'photo.png.exe',type:'application/octet-stream'}),false);assert.equal(isImageAsset(),false);
});

test('backup preserves group order, display choices, and original asset bytes',()=>{
 const data=backup(fixture()),copy=structuredClone(data);assert.deepEqual(validateBackup(data),copy);
 assert.deepEqual([...groupedImageIds(data.notes[0])],['photo-a','photo-b','photo-c']);
 assert.deepEqual(data.assets.map(a=>a.data),['YQ==','Yg==','Yw==']);
});

test('invalid groups and duplicate photos cannot enter a backup',()=>{
 const mutations=[n=>n.imageGroups=null,n=>n.imageGroups[0].id='bad id',n=>n.imageGroups[1].id='group-a',n=>n.imageGroups[0].mode='automatic',n=>n.imageGroups[0].assetIds=[],n=>n.imageGroups[0].assetIds=['photo-a','photo-a'],n=>n.imageGroups[1].assetIds=['photo-b'],n=>n.imageGroups[0].assetIds=[null]];
 for(const mutate of mutations){const note=fixture();mutate(note);assert.throws(()=>validateBackup(backup(note)),/사진 묶음.*손상/);}
});

test('group references require attached image assets',()=>{
 const note=fixture();assert.throws(()=>validateImageGroups({...note,attachments:['photo-a','photo-c']},assets),/누락/);
 assert.throws(()=>validateImageGroups(note,assets.filter(a=>a.id!=='photo-b')),/누락/);
 assert.throws(()=>validateImageGroups(note,assets.map(a=>a.id==='photo-b'?{...a,name:'file.pdf',type:'application/pdf'}:a)),/누락/);
});

test('collision remapping retains group identity and order without mutating originals',()=>{
 const note=fixture(),before=structuredClone(note),map=new Map([['photo-a','copy-a'],['photo-c','copy-c']]);
 const remapped=remapImageGroups(note.imageGroups,map);
 assert.deepEqual(remapped,[{id:'group-a',assetIds:['copy-a','photo-b'],mode:'slides'},{id:'group-b',assetIds:['copy-c'],mode:'expanded'}]);
 const copiedAssets=assets.map(a=>({...a,id:map.get(a.id)||a.id}));
 assert.doesNotThrow(()=>validateImageGroups({...note,imageGroups:remapped,attachments:copiedAssets.map(a=>a.id)},copiedAssets));
 assert.deepEqual(note,before);assert.equal(remapImageGroups(undefined,map),undefined);
});

test('detaching photos removes stale references and empty groups without altering files',()=>{
 const note=fixture(),before=structuredClone(note);
 assert.deepEqual(pruneImageGroups(note,['photo-b']),[{id:'group-a',assetIds:['photo-b'],mode:'slides'}]);
 assert.deepEqual(pruneImageGroups(note,[]),[]);assert.deepEqual(pruneImageGroups(note),note.imageGroups);
 assert.deepEqual(note,before);assert.deepEqual(pruneImageGroups(makeNote()),[]);
});
