import {validatePageAnnotations} from './page-drawing-model.js';
// Page identity is independent of its position so deleting a page never renumbers it.
export const documentPageFile = asset => /\.(pdf|pptx|ppt)$/i.test(asset?.name||'') || asset?.type==='application/pdf';
export const pagesOf = note => Array.isArray(note?.documentPages)?note.documentPages:[];
export const pageImageAssetId = page => page.annotatedAssetId||page.assetId;
export const pageImageAssetIds = page => [page.assetId,...(page.annotatedAssetId?[page.annotatedAssetId]:[])];
export const pageAssetIds = note => new Set(pagesOf(note).flatMap(pageImageAssetIds));
export const documentAssetReferences = note => [...new Set([...(note.attachments||[]),...pagesOf(note).flatMap(page=>[...pageImageAssetIds(page),page.sourceAssetId])])];
export function validateDocumentPages(note,assets){
 if(note.documentPages===undefined)return;
 const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id);
 if(!Array.isArray(note.documentPages)||note.documentPages.length>2000)throw Error('페이지 이미지 목록이 손상되었습니다.');
 const ids=new Set(),positions=new Set(),images=new Set();
 for(const page of note.documentPages){
  if(!page||!validId(page.id)||!validId(page.assetId)||!validId(page.sourceAssetId)||page.assetId===page.sourceAssetId||!Number.isInteger(page.number)||page.number<1||typeof page.comment!=='string'||page.comment.length>100000||typeof page.deleted!=='boolean'||ids.has(page.id)||images.has(page.assetId)||positions.has(page.sourceAssetId+'|'+page.number))throw Error('페이지 이미지 또는 메모가 손상되었습니다.');
  const annotated=page.annotatedAssetId!==undefined;
  if(annotated!==(page.annotations!==undefined)||annotated&&(!validId(page.annotatedAssetId)||page.annotatedAssetId===page.assetId||page.annotatedAssetId===page.sourceAssetId||images.has(page.annotatedAssetId)))throw Error('페이지 필기 또는 이미지가 손상되었습니다.');
  if(annotated)validatePageAnnotations(page.annotations);
  ids.add(page.id);for(const id of pageImageAssetIds(page))images.add(id);positions.add(page.sourceAssetId+'|'+page.number);
  if(pageImageAssetIds(page).some(id=>!assets.some(a=>a.id===id&&a.type==='image/png')||!page.deleted&&!note.attachments.includes(id))||!assets.some(a=>a.id===page.sourceAssetId))throw Error('페이지 이미지 또는 원본 파일이 누락되었습니다.');
 }
}
export function remapDocumentPages(pages,assetIds){
 return Array.isArray(pages)?pages.map(page=>({...page,sourceAssetId:assetIds.get(page.sourceAssetId)||page.sourceAssetId,assetId:assetIds.get(page.assetId)||page.assetId,...(page.annotatedAssetId?{annotatedAssetId:assetIds.get(page.annotatedAssetId)||page.annotatedAssetId}:{})})):pages;
}
export function pageMarkdown(note,assets,link){
 return pagesOf(note).filter(p=>!p.deleted&&note.attachments.includes(p.assetId)).map(page=>{
  const asset=assets.find(a=>a.id===pageImageAssetId(page)),source=assets.find(a=>a.id===page.sourceAssetId);
  if(!asset)return '';
  return '\n\n## '+(source?.name||'문서')+' · '+page.number+'페이지\n\n!['+page.number+'페이지]('+link(asset)+')'+(page.comment?'\n\n### 내 의견\n\n'+page.comment:'');
 }).join('');
}
