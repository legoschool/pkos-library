import {remapDatabase,databaseReferenceIds} from './database-engine.js';
import {renameBlockReferences,blockReferenceIds} from './block-model.js';
import {stable} from './sync-model.js';
import {withHistory,undoHistory} from './note-history.js';
export class ConflictError extends Error{constructor(){super('다른 창에서 이 기록을 수정했습니다. 현재 글을 사본으로 저장해 주세요.');}}
export function openStore(demo=false){return new Promise((resolve,reject)=>{const req=indexedDB.open(demo?'pkem-real-demo-v1':'pkem-real-personal-v1',1);req.onupgradeneeded=()=>{for(const name of ['notes','assets','meta'])req.result.createObjectStore(name,{keyPath:'id'});};req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(new Store(req.result));});}
class Store{
 constructor(db){this.db=db;}
 changed(){if(globalThis.dispatchEvent)globalThis.dispatchEvent(new CustomEvent('pkos-store-change',{detail:{name:this.db.name}}));}
 all(name){return new Promise((resolve,reject)=>{const r=this.db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 get(name,id){return new Promise((resolve,reject)=>{const r=this.db.transaction(name).objectStore(name).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 put(name,value){return this.batch({[name]:[value]});}
 batch(groups){return new Promise((resolve,reject)=>{const tx=this.db.transaction(Object.keys(groups),'readwrite');for(const [name,rows] of Object.entries(groups))for(const row of rows)tx.objectStore(name).put(row);tx.oncomplete=()=>{if(groups.notes||groups.assets||groups.meta?.some(m=>m.id==='folders'))this.changed();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('저장을 완료하지 못했습니다.'));});}
 saveCaptured(note,baseRevision,asset,recoveryId){return new Promise((resolve,reject)=>{
  let conflict=false;const tx=this.db.transaction(['notes','assets','meta'],'readwrite'),store=tx.objectStore('notes'),r=store.get(note.id);
  r.onsuccess=()=>{if((r.result?.revision||0)!==baseRevision){conflict=true;tx.abort();return;}note=withHistory(r.result,{...note,revision:baseRevision+1,updated:new Date().toISOString()});store.put(note);for(const item of (Array.isArray(asset)?asset:asset?[asset]:[]))tx.objectStore('assets').put(item);if(recoveryId)tx.objectStore('meta').delete(recoveryId);};
  tx.oncomplete=()=>{this.changed();resolve(note);};tx.onabort=()=>reject(conflict?new ConflictError():tx.error||Error('첨부 저장 실패'));tx.onerror=()=>reject(tx.error);
 });}
 clear(){return new Promise((resolve,reject)=>{const tx=this.db.transaction(['notes','assets','meta'],'readwrite');for(const name of ['notes','assets','meta'])tx.objectStore(name).clear();tx.oncomplete=()=>{this.changed();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('비우기 실패'));});}
 deleteMeta(id){return new Promise((resolve,reject)=>{const tx=this.db.transaction('meta','readwrite');tx.objectStore('meta').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('삭제 실패'));});}
 save(note,baseRevision){return new Promise((resolve,reject)=>{let conflict=false;const tx=this.db.transaction('notes','readwrite'),s=tx.objectStore('notes'),r=s.get(note.id);r.onsuccess=()=>{if((r.result?.revision||0)!==baseRevision){conflict=true;tx.abort();return;}note=withHistory(r.result,{...note,revision:baseRevision+1,updated:new Date().toISOString()});s.put(note);};tx.oncomplete=()=>{this.changed();resolve(note);};tx.onabort=()=>reject(conflict?new ConflictError():tx.error||Error('저장 실패'));tx.onerror=()=>reject(tx.error);});}
 undo(id,entryId,baseRevision){return new Promise((resolve,reject)=>{
  let failure,saved;const tx=this.db.transaction(['notes','meta'],'readwrite'),s=tx.objectStore('notes'),r=s.get(id);
  r.onsuccess=()=>{try{if(!r.result||r.result.revision!==baseRevision)throw new ConflictError();saved=undoHistory(r.result,entryId);s.put(saved);const f=tx.objectStore('meta').get('folders');f.onsuccess=()=>tx.objectStore('meta').put({id:'folders',value:[...new Set([...(f.result?.value||[]),saved.folder])]});}catch(e){failure=e;try{tx.abort();}catch{}}};
  tx.oncomplete=()=>{this.changed();resolve(saved);};tx.onabort=()=>reject(failure||tx.error||Error('되돌리기를 저장하지 못했습니다.'));tx.onerror=()=>reject(tx.error);
 });}
 remove(id){return new Promise((resolve,reject)=>{
  const tx=this.db.transaction(['notes','assets'],'readwrite'),s=tx.objectStore('notes'),r=s.getAll();
  r.onsuccess=()=>{const target=r.result.find(n=>n.id===id);if(!target)return;const used=new Set(r.result.filter(n=>n.id!==id).flatMap(n=>n.attachments));for(const aid of target.attachments)if(!used.has(aid))tx.objectStore('assets').delete(aid);s.delete(id);};
  tx.oncomplete=()=>{this.changed();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('삭제를 완료하지 못했습니다.'));
 });}
 renameFolder(oldName,newName){return new Promise((resolve,reject)=>{const tx=this.db.transaction(['notes','meta'],'readwrite');const r=tx.objectStore('notes').getAll();r.onsuccess=()=>{for(const n of r.result){if(n.folder===oldName||n.folder.startsWith(oldName+'/')){const next=withHistory(n,{...n,folder:newName+n.folder.slice(oldName.length),revision:n.revision+1,updated:new Date().toISOString()});tx.objectStore('notes').put(next);}}};const m=tx.objectStore('meta').get('folders');m.onsuccess=()=>tx.objectStore('meta').put({id:'folders',value:[...new Set((m.result?.value||[]).map(f=>f===oldName||f.startsWith(oldName+'/')?newName+f.slice(oldName.length):f))]});tx.oncomplete=()=>{this.changed();resolve();};tx.onerror=()=>reject(tx.error);});}
 snapshot(){return new Promise((resolve,reject)=>{const tx=this.db.transaction(['notes','assets','meta'],'readonly'),n=tx.objectStore('notes').getAll(),a=tx.objectStore('assets').getAll(),f=tx.objectStore('meta').get('folders');tx.oncomplete=()=>resolve([n.result,a.result,f.result]);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('백업 자료를 읽지 못했습니다.'));});}
 async applyCloudSnapshot(expected,payload,stateId){
 return new Promise((resolve,reject)=>{let conflict=false,modified=false;const tx=this.db.transaction(['notes','assets','meta'],'readwrite'),ns=tx.objectStore('notes'),request=ns.getAll();request.onsuccess=()=>{const live=request.result;if(stable([...live].sort((a,b)=>a.id.localeCompare(b.id)))!==stable([...expected].sort((a,b)=>a.id.localeCompare(b.id)))){conflict=true;tx.abort();return;}const current=new Map(live.map(n=>[n.id,n]));for(const [id,record]of Object.entries(payload.records)){if(record.note===null){if(current.has(id)){ns.delete(id);modified=true;}}else if(stable(current.get(id))!==stable(record.note)){ns.put(record.note);modified=true;}}for(const a of payload.assets){const bytes=Uint8Array.from(atob(a.data),c=>c.charCodeAt(0));tx.objectStore('assets').put({id:a.id,name:a.name,type:a.type,blob:new Blob([bytes],{type:a.type})});}const folderRequest=tx.objectStore('meta').get('folders');folderRequest.onsuccess=()=>tx.objectStore('meta').put({id:'folders',value:[...new Set([...(folderRequest.result?.value||[]),...payload.folders])]});tx.objectStore('meta').put({id:stateId,value:{records:payload.records}});};tx.oncomplete=()=>{if(modified)this.changed();resolve();};tx.onabort=()=>reject(conflict?new ConflictError():tx.error||Error('동기화 저장 실패'));tx.onerror=()=>reject(tx.error);});
 }
 async backup(){const [notes,assets,folders]=await this.snapshot();const out=[];for(const a of assets){const bytes=new Uint8Array(await a.blob.arrayBuffer());let b='';for(let i=0;i<bytes.length;i+=8192)b+=String.fromCharCode(...bytes.subarray(i,i+8192));out.push({id:a.id,name:a.name,type:a.type,data:btoa(b)});}return {format:'pkem-backup',schema:1,created:new Date().toISOString(),notes,folders:folders?.value||['수집함'],assets:out};}
 async mergeBackup(data){const existing=await this.all('notes'),map=new Map(existing.map(n=>[n.id,n])),assetRows=await this.all('assets'),assetMap=new Map(assetRows.map(a=>[a.id,a])),idMap=new Map(),assetIds=new Map();let copies=0;
 const prepared=new Map();
 for(const a of data.assets){
  const bytes=Uint8Array.from(atob(a.data),c=>c.charCodeAt(0)),old=assetMap.get(a.id);
  let same=false;if(old&&old.name===a.name&&old.type===a.type&&old.blob.size===bytes.length){const prior=new Uint8Array(await old.blob.arrayBuffer());same=prior.every((v,i)=>v===bytes[i]);}
  const id=old&&!same?crypto.randomUUID():a.id;assetIds.set(a.id,id);
  if(!same)prepared.set(id,{id,name:a.name,type:a.type,blob:new Blob([bytes],{type:a.type})});
 }
 const equal=(a,b)=>Object.keys({...a,...b}).every(k=>JSON.stringify(a[k])===JSON.stringify(b[k]));
 // Generated cards marked updatable replace their earlier import when the user has not edited the content (no history, no attachments); trashed cards stay trashed.
 // A card the user edited or attached files to is kept as the user left it (no copy), so repeated imports never pile up duplicates.
 // A generated card sent with deleted:true retires the earlier one (it moves to the trash and can be restored).
 const contentKeys=['title','body','folder','tags','links','status','created','updated','updatable','openUrl','sourceUrl','localPath','sourcePath','info','mdPath','kind','date'],updates=[],vacated=new Set(),handled=new Set(),retiredIds=new Set();let skipped=0,kept=0;
 for(const n of data.notes){const old=map.get(n.id);
  if(!old&&n.updatable===true&&n.deleted){handled.add(n.id);continue;}
  if(old&&n.updatable===true&&!n.attachments.length){
   idMap.set(n.id,n.id);handled.add(n.id);
   if((old.history||[]).length||old.attachments.length){if(contentKeys.some(k=>JSON.stringify(old[k])!==JSON.stringify(n[k])))kept++;continue;}
   if(old.deleted){if(!n.deleted)skipped++;continue;}
   if(n.deleted){updates.push({...old,deleted:true,revision:old.revision+1,updated:new Date().toISOString()});retiredIds.add(n.id);vacated.add(old.folder);continue;}
   if(contentKeys.some(k=>JSON.stringify(old[k])!==JSON.stringify(n[k]))){updates.push({...n,favorite:old.favorite,revision:old.revision+1});if(old.folder!==n.folder)vacated.add(old.folder);}
   continue;}
  if(old&&(!equal(old,n)||n.attachments.some(id=>assetIds.get(id)!==id))){idMap.set(n.id,crypto.randomUUID());copies++;}else idMap.set(n.id,n.id);}
 // Copies must point to other imported copies, including an otherwise unchanged referencing note.
 const dependents=new Map();for(const n of data.notes){if(handled.has(n.id))continue;for(const target of new Set([...n.links,...databaseReferenceIds(n.database),...blockReferenceIds(n.body)])){if(!dependents.has(target))dependents.set(target,[]);dependents.get(target).push(n.id);}}
 const queue=[...idMap].filter(([from,to])=>from!==to).map(([from])=>from);for(let i=0;i<queue.length;i++)for(const id of dependents.get(queue[i])||[]){if(map.has(id)&&idMap.get(id)===id&&!handled.has(id)){idMap.set(id,crypto.randomUUID());copies++;queue.push(id);}}
 const updatedIds=new Set(updates.map(n=>n.id));
 const notes=data.notes.filter(n=>!handled.has(n.id)&&(!map.has(n.id)||idMap.get(n.id)!==n.id)).map(n=>({...n,id:idMap.get(n.id),title:n.title+(map.has(n.id)?' (가져온 사본)':''),database:n.database?remapDatabase(n.database,idMap,assetIds):n.database,body:renameBlockReferences(n.body,idMap,assetIds),...(n.history?{history:n.history.map(h=>({...h,changes:Object.fromEntries(Object.entries(h.changes).map(([field,c])=>[field,field==='database'?{before:remapDatabase(c.before,idMap,assetIds),after:remapDatabase(c.after,idMap,assetIds)}:field==='body'?{before:renameBlockReferences(c.before,idMap,assetIds),after:renameBlockReferences(c.after,idMap,assetIds)}:c]))}))}:{}),links:n.links.map(id=>idMap.get(id)||id),attachments:n.attachments.map(id=>assetIds.get(id)||id)}));
 const used=new Set(notes.flatMap(n=>n.attachments));const assets=[...prepared.values()].filter(a=>used.has(a.id));
 // Drop notebooks that the updated cards left empty (and their now-empty parents); notebooks still holding any record stay.
 const after=[...existing.filter(n=>!updatedIds.has(n.id)),...updates.filter(n=>!retiredIds.has(n.id)),...notes].map(n=>n.folder),holds=f=>after.some(x=>x===f||x.startsWith(f+'/'));
 const empty=new Set();for(const f of vacated){const parts=f.split('/');for(let i=parts.length;i>0;i--){const p=parts.slice(0,i).join('/');if(!holds(p))empty.add(p);}}
 const folders=[...new Set([...(await this.get('meta','folders'))?.value||[],...data.folders])].filter(f=>!empty.has(f));
 await this.batch({notes:[...notes,...updates],assets,meta:[{id:'folders',value:folders.length?folders:['수집함']}]});return {added:notes.length,copies,updated:updates.length-retiredIds.size,retired:retiredIds.size,skipped,kept};}
}
