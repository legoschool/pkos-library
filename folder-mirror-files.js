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
   if(entry&&validPath(entry.path,kind)&&hashPattern.test(entry.hash))output[collection][id]={path:entry.path,hash:entry.hash,...(kind==='note'?{title:String(entry.title??'')}:{name:String(entry.name??'')})};
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
 * Renamed records, trash, removed attachments and external edits are never deleted.
 * onProgress receives {kind,id,path,done,total,written,skipped,conflicts}.
 */
export async function syncFolderMirror({handle,notes=[],assets=[],manifest,onProgress}={}){
 if(!handle?.getFileHandle||!handle?.getDirectoryHandle)throw Error('저장할 로컬 폴더를 다시 연결해 주세요.');
 const result={manifest:cloneManifest(manifest),written:0,conflicts:0,skipped:0};
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
   result.manifest[planned.kind==='note'?'notes':'assets'][planned.id]={path:planned.path,hash:nextHash,...(planned.kind==='note'?{title:planned.label}:{name:planned.label})};
   done++;
   await onProgress?.({kind:planned.kind,id:planned.id,path:planned.path,done,total,written:result.written,skipped:result.skipped,conflicts:result.conflicts});
  }

  // Original attachment bytes must exist before publishing links to them.
  for(const {asset,planned} of assetPlans)await commit(planned,new Uint8Array(await asset.blob.arrayBuffer()));
  for(const {note,planned} of notePlans){
   let markdown=markdownFile(note,notes,assets)
    .replace(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g,(all,name,label='')=>notePaths.has(name)?'[['+notePaths.get(name)+label+']]':all);
   for(const id of note.attachments||[]){const replacement=assetPaths.get(id);if(replacement)markdown=markdown.split(replacement.from).join(replacement.to);}
   await commit(planned,encoder.encode(markdown));
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
