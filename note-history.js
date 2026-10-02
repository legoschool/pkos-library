// History belongs to the note and commits in the same IndexedDB transaction.
export const historyFields={title:'제목',body:'본문',folder:'노트북',tags:'태그',status:'상태',reviewDate:'다시 볼 날짜'};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function withHistory(previous,next,{undoOf}={}){
 const history=structuredClone(previous?.history||[]);
 if(previous){
  const changes={};
  for(const field of Object.keys(historyFields))if(!same(previous[field],next[field]))changes[field]={before:structuredClone(previous[field]),after:structuredClone(next[field])};
  if(Object.keys(changes).length)history.push({id:crypto.randomUUID(),at:next.updated,revision:next.revision,changes,...(undoOf?{undoOf}:{})});
 }
 return {...next,history};
}
export function undoProblem(note,entry){
 const history=note.history||[],index=history.findIndex(h=>h.id===entry?.id);
 if(index<0)return '변경 이력을 찾지 못했습니다.';
 if(note.deleted)return '휴지통에서 기록을 복원한 뒤 되돌릴 수 있습니다.';
 if(history.some(h=>h.undoOf===entry.id))return '이미 되돌린 변경입니다.';
 if(Object.keys(entry.changes).some(field=>!same(note[field],entry.changes[field].after)||history.slice(index+1).some(h=>Object.hasOwn(h.changes,field))))return '같은 항목을 이후에 수정했습니다. 현재 내용을 보존하기 위해 되돌릴 수 없습니다.';
 return '';
}
export function undoHistory(note,entryId){
 const entry=note.history?.find(h=>h.id===entryId),problem=undoProblem(note,entry);
 if(problem)throw Error(problem);
 const next=structuredClone(note);
 for(const [field,change]of Object.entries(entry.changes))next[field]=structuredClone(change.before);
 return withHistory(note,{...next,revision:note.revision+1,updated:new Date().toISOString()},{undoOf:entry.id});
}
export function validateHistory(note){
 if(note.history===undefined)return;
 if(!Array.isArray(note.history))throw Error('변경 이력이 손상되었습니다.');
 const ids=new Map();let revision=0;
 for(const h of note.history){
  if(!h||typeof h.id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(h.id)||ids.has(h.id)||!Number.isInteger(h.revision)||h.revision<=revision||h.revision>note.revision||typeof h.at!=='string'||!Number.isFinite(Date.parse(h.at))||!h.changes||typeof h.changes!=='object'||Array.isArray(h.changes)||!Object.keys(h.changes).length)throw Error('변경 이력이 손상되었습니다.');
  for(const [field,c]of Object.entries(h.changes)){
   const valid=v=>field==='tags'?Array.isArray(v)&&v.every(t=>typeof t==='string'):typeof v==='string'&&(field!=='status'||['수집','정리 중','활용','보관'].includes(v));
   if(!Object.hasOwn(historyFields,field)||!c||!valid(c.before)||!valid(c.after)||same(c.before,c.after))throw Error('변경 이력의 항목이 손상되었습니다.');
  }
  if(h.undoOf!==undefined){const original=ids.get(h.undoOf);if(!original||[...ids.values()].some(x=>x.undoOf===h.undoOf)||!same(Object.keys(original.changes).sort(),Object.keys(h.changes).sort())||Object.keys(h.changes).some(f=>!same(original.changes[f].before,h.changes[f].after)||!same(original.changes[f].after,h.changes[f].before)))throw Error('되돌리기 이력이 손상되었습니다.');}
  ids.set(h.id,h);revision=h.revision;
 }
}
