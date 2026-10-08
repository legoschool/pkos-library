import {markdownFile,safeName} from './core.js';

export const MIRROR_MANIFEST_VERSION=1;
const encoder=new TextEncoder();
const own=(object,key)=>object&&Object.hasOwn(object,key)?object[key]:undefined;
const reserved=/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;
const hashPattern=/^[a-f0-9]{64}$/;
const cleanPart=(value,max=100)=>{
 let name=String(value||'제목 없음').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g,'-').slice(0,max).replace(/[\uD800-\uDBFF]$/,'').replace(/[. ]+$/g,'')||'제목 없음';
 if(reserved.test(name))name='_'+name;
 return name;
};
const validPart=name=>typeof name==='string'&&name.length>0&&name.length<=220&&!/[<>:"/\\|?*\x00-\x1f\x7f]/.test(name)&&!/[. ]$/.test(name)&&!reserved.test(name)&&name!=='.'&&name!=='..';
const validPath=(path,kind)=>typeof path==='string'&&(kind==='asset'?path.startsWith('attachments/')&&validPart(path.slice(12)):validPart(path)&&path.endsWith('.md'));
const pathKey=path=>path.normalize('NFC').toLocaleLowerCase('en-US');
const encodePath=path=>path.split('/').map(part=>encodeURIComponent(part).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase())).join('/');
const validId=value=>typeof value==='string'&&value.length>0&&value.length<=256;
const validPage=page=>page&&validId(page.id)&&validId(page.assetId)&&validId(page.sourceAssetId)&&page.assetId!==page.sourceAssetId&&Number.isSafeInteger(page.number)&&page.number>0&&typeof page.deleted==='boolean';
const validPageOwner=owner=>owner&&validId(owner.noteId)&&validId(owner.id)&&validId(owner.sourceAssetId)&&Number.isSafeInteger(owner.number)&&owner.number>0;
const pageOwnerKey=owner=>JSON.stringify([owner.noteId,owner.id,owner.sourceAssetId,owner.number]);
const clonePageOwners=owners=>Array.isArray(owners)?[...new Map(owners.filter(validPageOwner).map(owner=>{
 const copy={noteId:owner.noteId,id:owner.id,sourceAssetId:owner.sourceAssetId,number:owner.number};return [pageOwnerKey(copy),copy];
})).values()]:[];
const pngBytes=bytes=>bytes.length>=8&&[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value);

async function hash(bytes){
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}
async function idPart(id){
 const value=String(id);
 return /^[a-zA-Z0-9_-]{1,64}$/.test(value)?value:cleanPart(value,40)+'-'+(await hash(encoder.encode(value))).slice(0,12);
}
function attachmentName(name){
 const value=String(name||'첨부 파일'),extension=value.match(/\.[a-zA-Z0-9]{1,12}$/)?.[0]||'';
 return extension?cleanPart(value.slice(0,-extension.length),90)+extension:cleanPart(value,100);
}
function cloneManifest(source){
 const output={version:MIRROR_MANIFEST_VERSION,notes:Object.create(null),assets:Object.create(null)};
 if(source?.version!==MIRROR_MANIFEST_VERSION)return output;
 for(const [collection,kind] of [['notes','note'],['assets','asset']]){
  for(const [id,entry] of Object.entries(source[collection]||{})){
   if(entry&&validPath(entry.path,kind)&&hashPattern.test(entry.hash)){
    output[collection][id]={path:entry.path,hash:entry.hash,...(kind==='note'?{title:String(entry.title??'')}:{name:String(entry.name??'')})};
    if(kind==='asset'&&/\.png$/i.test(entry.path)){
     const owners=clonePageOwners(entry.documentPages);if(owners.length)output[collection][id].documentPages=owners;
    }
   }
  }
 }
 return output;
}
const isMissing=error=>error?.name==='NotFoundError';
async function fileState(directory,name){
 try{
  const handle=await directory.getFileHandle(name),file=await handle.getFile();
  return {handle,hash:await hash(await file.arrayBuffer())};
 }catch(error){
  if(isMissing(error))return null;
  // A directory with this name also belongs to someone else. Pick another name.
  if(error?.name==='TypeMismatchError')return {directory:true,hash:null};
  throw error;
 }
}
async function directoryFor(root,path,create=false){
 return path.startsWith('attachments/')?root.getDirectoryHandle('attachments',{create}):root;
}
const basename=path=>path.slice(path.lastIndexOf('/')+1);

/**
 * Write readable copies into an already selected, dedicated local directory.
 * The caller serializes runs and persists result.manifest (also error.partialResult).
 * Renamed records, trash, ordinary removed attachments and external edits are preserved.
 * Only explicit converted-page tombstones can remove an unchanged owned PNG, after
 * Markdown commits. onProgress kind is asset, note, or page-delete and includes removed.
 */
export async function syncFolderMirror({handle,notes=[],assets=[],manifest,onProgress}={}){
 if(!handle?.getFileHandle||!handle?.getDirectoryHandle)throw Error('저장할 로컬 폴더를 다시 연결해 주세요.');
 const result={manifest:cloneManifest(manifest),written:0,conflicts:0,skipped:0,removed:0};
 const reservations=new Set(),notePaths=new Map(),assetPaths=new Map();
 const live=notes.filter(note=>!note.deleted),noteIds=new Set(),assetMap=new Map();
 let done=0,total=0;
 try{
  for(const note of live){
   if(typeof note.id!=='string'||!note.id||noteIds.has(note.id))throw Error('중복되거나 비어 있는 기록 식별자가 있습니다.');
   noteIds.add(note.id);
  }
  for(const asset of assets){
   if(typeof asset.id!=='string'||!asset.id||assetMap.has(asset.id))throw Error('중복되거나 비어 있는 첨부 식별자가 있습니다.');
   assetMap.set(asset.id,asset);
  }
  const used=[...new Set(live.flatMap(note=>note.attachments||[]))];
  // Validate all attachment sources before creating any Markdown that refers to them.
  for(const id of used)if(!assetMap.get(id)?.blob?.arrayBuffer)throw Error('첨부 파일 원본을 찾을 수 없습니다. 기록을 다시 열고 저장해 주세요.');
  total=live.length+used.length;
  const pageOwners=new Map(),pageTombstones=new Map();
  const referenced=new Set(notes.flatMap(note=>note.attachments||[]));
  for(const note of notes){
   for(const page of Array.isArray(note.documentPages)?note.documentPages:[]){
    if(!validPage(page))continue;
    // Never delete an original document or a page restored in another note, even
    // if a malformed/restoring record temporarily lacks its attachment reference.
    referenced.add(page.sourceAssetId);
    if(!page.deleted)referenced.add(page.assetId);
    if(note.deleted)continue;
    const owner={noteId:note.id,id:page.id,sourceAssetId:page.sourceAssetId,number:page.number};
    if(page.deleted){
     const owners=pageTombstones.get(page.assetId)||[];owners.push(owner);pageTombstones.set(page.assetId,owners);
    }else if((note.attachments||[]).includes(page.assetId)&&assetMap.has(page.sourceAssetId)&&assetMap.get(page.assetId)?.type==='image/png'&&/\.png$/i.test(assetMap.get(page.assetId)?.name||'')){
     const owners=pageOwners.get(page.assetId)||[];owners.push(owner);pageOwners.set(page.assetId,owners);
    }
   }
  }

  async function plan(kind,id,preferred,label){
   const collection=kind==='note'?'notes':'assets',previous=own(result.manifest[collection],id);
   const sameLabel=previous&&(kind==='note'?previous.title:previous.name)===label;
   const candidate=sameLabel?previous.path:preferred;
   const directory=await directoryFor(handle,candidate,true);
   const current=await fileState(directory,basename(candidate));
   const owned=previous?.path===candidate&&current?.hash===previous.hash;
   if(!reservations.has(pathKey(candidate))&&(!current||owned)){
    reservations.add(pathKey(candidate));
    return {kind,id,path:candidate,label,directory,before:current?.hash??null};
   }
   result.conflicts++;
   const slash=preferred.lastIndexOf('/'),prefix=preferred.slice(0,slash+1),name=preferred.slice(slash+1),dot=name.lastIndexOf('.'),stem=dot>0?name.slice(0,dot):name,extension=dot>0?name.slice(dot):'';
   const targetDirectory=await directoryFor(handle,preferred,true);
   for(let index=2;index<=10000;index++){
    const path=prefix+stem+' ('+index+')'+extension;
    if(reservations.has(pathKey(path)))continue;
    if(await fileState(targetDirectory,basename(path)))continue;
    reservations.add(pathKey(path));
    return {kind,id,path,label,directory:targetDirectory,before:null};
   }
   throw Error('같은 이름의 파일이 너무 많습니다. 새 로컬 폴더를 연결해 주세요.');
  }

  const notePlans=[];
  for(const note of live){
   const title=String(note.title??''),path=cleanPart(title,96)+'--'+await idPart(note.id)+'.md';
   const planned=await plan('note',note.id,path,title);
   notePlans.push({note,planned});notePaths.set(safeName(note.title)+'--'+note.id,planned.path.slice(0,-3));
  }
  const assetPlans=[];
  for(const id of used){
   const asset=assetMap.get(id),name=String(asset.name??''),path='attachments/'+await idPart(id)+'-'+attachmentName(name);
   const planned=await plan('asset',id,path,name);
   assetPlans.push({asset,planned});
   assetPaths.set(id,{from:'(attachments/'+encodeURIComponent(id+'-'+safeName(asset.name))+')',to:'('+encodePath(planned.path)+')'});
  }

  async function commit(planned,bytes){
   const nextHash=await hash(bytes),current=await fileState(planned.directory,basename(planned.path));
   if(current?.directory||(current?.hash??null)!==planned.before){
    const error=Error('로컬 파일이 저장 중 바뀌었습니다. 기존 파일은 보존했습니다. 다시 저장해 주세요.');
    error.name='FolderMirrorConflictError';throw error;
   }
   if(current?.hash===nextHash)result.skipped++;
   else{
    const file=current?.handle||await planned.directory.getFileHandle(basename(planned.path),{create:true});
    const writer=await file.createWritable();
    try{await writer.write(bytes);await writer.close();}
    catch(error){try{await writer.abort?.();}catch{}throw error;}
    const verified=await hash(await (await file.getFile()).arrayBuffer());
    if(verified!==nextHash)throw Error('로컬 파일 저장을 확인하지 못했습니다. 다시 저장해 주세요.');
    result.written++;
   }
   const entry={path:planned.path,hash:nextHash,...(planned.kind==='note'?{title:planned.label}:{name:planned.label})};
   if(planned.kind==='asset'&&/\.png$/i.test(planned.path)&&assetMap.get(planned.id)?.type==='image/png'&&pngBytes(bytes)){
    const owners=clonePageOwners([...(own(result.manifest.assets,planned.id)?.documentPages||[]),...(pageOwners.get(planned.id)||[])]);
    if(owners.length)entry.documentPages=owners;
   }
   result.manifest[planned.kind==='note'?'notes':'assets'][planned.id]=entry;
   done++;
   await onProgress?.({kind:planned.kind,id:planned.id,path:planned.path,done,total,written:result.written,skipped:result.skipped,conflicts:result.conflicts,removed:result.removed});
  }

  // Original attachment bytes must exist before publishing links to them.
  for(const {asset,planned} of assetPlans)await commit(planned,new Uint8Array(await asset.blob.arrayBuffer()));
  for(const {note,planned} of notePlans){
   let markdown=markdownFile(note,notes,assets)
    .replace(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g,(all,name,label='')=>notePaths.has(name)?'[['+notePaths.get(name)+label+']]':all);
   for(const id of note.attachments||[]){const replacement=assetPaths.get(id);if(replacement)markdown=markdown.split(replacement.from).join(replacement.to);}
   await commit(planned,encoder.encode(markdown));
  }
  // Missing attachments/trash are not deletion requests. Require both a durable
  // explicit tombstone and the live-page ownership recorded on a previous export.
  const protectedPaths=new Set([...referenced].map(id=>own(result.manifest.assets,id)?.path).filter(Boolean).map(pathKey));
  for(const [id,tombstones] of pageTombstones){
   const entry=own(result.manifest.assets,id);
   if(!entry||referenced.has(id)||protectedPaths.has(pathKey(entry.path))||!validPath(entry.path,'asset')||!/\.png$/i.test(entry.path))continue;
   const expected=new Set(tombstones.map(pageOwnerKey));
   if(!entry.documentPages?.some(owner=>expected.has(pageOwnerKey(owner))))continue;
   let directory,current;
   try{directory=await directoryFor(handle,entry.path);current=await fileState(directory,basename(entry.path));}
   catch(error){if(!isMissing(error))throw error;}
   if(current&&(current.directory||current.hash!==entry.hash)){
    // Release ownership once: subsequent retries and restores must keep this
    // externally edited file, rather than repeatedly attempting to remove it.
    result.conflicts++;delete result.manifest.assets[id];continue;
   }
   if(current){
    try{await directory.removeEntry(basename(entry.path),{recursive:false});result.removed++;}
    catch(error){if(!isMissing(error))throw error;}
   }
   delete result.manifest.assets[id];
   total++;done++;
   await onProgress?.({kind:'page-delete',id,path:entry.path,done,total,written:result.written,skipped:result.skipped,conflicts:result.conflicts,removed:result.removed});
  }
  return result;
 }catch(error){
  // A later failure does not invalidate already verified writes. Keep their ownership
  // information so retry never mistakes its own successfully saved file for a stranger.
  const failure=error instanceof Error?error:Error(String(error));
  failure.partialResult=result;
  throw failure;
 }
}
