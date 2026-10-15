// Groups only arrange existing attachments; original image bytes stay untouched.
export const isImageAsset = asset => /^image\//i.test(asset?.type||'') || /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(asset?.name||'');
export const imageGroupsOf = note => Array.isArray(note?.imageGroups)?note.imageGroups:[];
export const groupedImageIds = note => new Set(imageGroupsOf(note).flatMap(group=>group.assetIds));

export function validateImageGroups(note,assets){
 if(note.imageGroups===undefined)return;
 if(!Array.isArray(note.imageGroups)||note.imageGroups.length>2000)throw Error('사진 묶음 목록이 손상되었습니다.');
 const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id);
 const groups=new Set(),images=new Set(),attached=new Set(note.attachments||[]),byId=new Map(assets.map(asset=>[asset.id,asset]));
 for(const group of note.imageGroups){
  if(!group||!validId(group.id)||groups.has(group.id)||!['expanded','slides'].includes(group.mode)||!Array.isArray(group.assetIds)||!group.assetIds.length||group.assetIds.length>5000)throw Error('사진 묶음이 손상되었습니다.');
  groups.add(group.id);
  for(const id of group.assetIds){
   if(!validId(id)||images.has(id))throw Error('사진 묶음의 파일 목록이 손상되었습니다.');
   if(!attached.has(id)||!isImageAsset(byId.get(id)))throw Error('사진 묶음의 원본 이미지가 누락되었습니다.');
   images.add(id);
  }
 }
}

export function remapImageGroups(groups,assetIds){
 return Array.isArray(groups)?groups.map(group=>({...group,assetIds:group.assetIds.map(id=>assetIds.get(id)||id)})):groups;
}

export function pruneImageGroups(note,attachmentIds=note.attachments||[]){
 const attached=new Set(attachmentIds);
 return imageGroupsOf(note).map(group=>({...group,assetIds:group.assetIds.filter(id=>attached.has(id))})).filter(group=>group.assetIds.length);
}
