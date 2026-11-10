import {validatePageAnnotations} from './page-drawing-model.js';

// The PNG is an ordinary attachment; vector strokes keep it editable after saving.
export const drawingsOf = note => Array.isArray(note?.drawings)?note.drawings:[];
export const drawingAssetIds = note => new Set(drawingsOf(note).map(drawing=>drawing.assetId));

export function validateDrawings(note,assets){
 if(note.drawings===undefined)return;
 if(!Array.isArray(note.drawings)||note.drawings.length>2000)throw Error('그림 목록이 손상되었습니다.');
 const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id);
 const ids=new Set(),images=new Set(),attached=new Set(note.attachments||[]),byId=new Map(assets.map(asset=>[asset.id,asset]));
 for(const drawing of note.drawings){
  if(!drawing||!validId(drawing.id)||!validId(drawing.assetId)||ids.has(drawing.id)||images.has(drawing.assetId))throw Error('그림 정보가 손상되었습니다.');
  validatePageAnnotations(drawing.annotations);
  if(drawing.annotations.height!==625)throw Error('그림판의 비율이 올바르지 않습니다.');
  if(!attached.has(drawing.assetId)||byId.get(drawing.assetId)?.type!=='image/png')throw Error('그림 이미지가 누락되었습니다.');
  ids.add(drawing.id);images.add(drawing.assetId);
 }
}

export function remapDrawings(drawings,assetIds){
 return Array.isArray(drawings)?drawings.map(drawing=>({...drawing,assetId:assetIds.get(drawing.assetId)||drawing.assetId})):drawings;
}

export function pruneDrawings(note,attachmentIds=note.attachments||[]){
 const attached=new Set(attachmentIds);
 return drawingsOf(note).filter(drawing=>attached.has(drawing.assetId));
}
