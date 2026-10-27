import {isImageAsset} from './image-groups-model.js';

// Read only the paste event supplied by the user; no clipboard permission is needed.
export function pastedImageFiles(clipboard) {
 if (!clipboard) return [];
 const items = Array.from(clipboard.items || []).filter(item => item.kind === 'file').map(item => item.getAsFile?.()).filter(isImageAsset);
 // Some clipboard providers expose only non-image items, but retain the capture
 // in files. Choose one representation so a PNG listed in both is attached once.
 const files = items.length ? items : Array.from(clipboard.files || []).filter(isImageAsset);
 return files.map((file, index) => {
  if (file.name && file.name !== 'image.png') return file;
  const extension = ({'image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/svg+xml':'svg','image/avif':'avif'})[file.type] || 'png';
  return new File([file], '붙여넣은-이미지-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + (index + 1) + '.' + extension, {type:file.type, lastModified:file.lastModified});
 });
}
