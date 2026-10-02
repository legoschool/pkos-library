import {unzipSync,strFromU8} from './vendor/fflate.js';
const LIMIT=20*1024*1024;
const all=(el,name)=>Array.from(el.getElementsByTagNameNS('*',name));
const attr=(el,name)=>Array.from(el.attributes||[]).find(a=>a.localName===name)?.value||'';
const safe=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const text=el=>all(el,'t').map(t=>t.textContent).join('');
const cell=s=>safe(s).replace(/\|/g,'\\|').replace(/\r?\n/g,' ');
function table(rows){if(!rows.length)return '';const width=Math.min(40,Math.max(...rows.map(r=>r.length)));const clean=rows.slice(0,2000).map(r=>Array.from({length:width},(_,i)=>cell(r[i]||'')));return ['| '+clean[0].join(' | ')+' |','| '+Array(width).fill('---').join(' | ')+' |',...clean.slice(1).map(r=>'| '+r.join(' | ')+' |')].join('\n');}
export async function extractBrowserDocument(asset,signal,report){
 const abort=()=>{if(signal.aborted)throw new DOMException('취소했습니다.','AbortError');};
 abort();if(asset.blob.size>LIMIT)throw Error('원본은 20MB까지 변환할 수 있습니다.');
 const bytes=new Uint8Array(await asset.blob.arrayBuffer());let total=0,count=0;
 report('브라우저에서 문서를 읽는 중 · 서버로 보내지 않습니다.');
 const files=unzipSync(bytes,{filter:entry=>{count++;total+=entry.originalSize;if(count>3000||entry.originalSize>LIMIT||total>100*1024*1024)throw Error('압축을 풀었을 때의 크기가 허용 범위를 넘었습니다.');return /\.(xml|rels)$/i.test(entry.name)||/^(word\/media\/|ppt\/media\/|xl\/media\/|BinData\/)/.test(entry.name);}});
 const xml=name=>{if(!files[name])throw Error('문서 구성 파일이 없습니다: '+name);const value=strFromU8(files[name]);if(/<!DOCTYPE|<!ENTITY/i.test(value))throw Error('외부 정의를 포함한 XML은 변환하지 않습니다.');const doc=new DOMParser().parseFromString(value,'application/xml');if(all(doc,'parsererror').length)throw Error('문서 XML을 읽지 못했습니다.');return doc;};
 // Check every selected XML before reading content. External relationships are never fetched.
 for(const name of Object.keys(files)){abort();if(/\.(xml|rels)$/i.test(name))xml(name);}
 const ext=asset.name.split('.').pop().toLowerCase(),chunks=[],warnings=['브라우저에서 추출한 본문입니다. 글꼴·쪽 배치·차트·수식 모양은 원본과 다를 수 있습니다.'];
 let length=0;
 const add=s=>{if(length>=1000000)return;const part=s.slice(0,1000000-length);length+=part.length+2;chunks.push(part);};
 const paragraphs=root=>{for(const p of all(root,'p'))add(safe(text(p)));};
 if(ext==='docx'){
  const body=all(xml('word/document.xml'),'body')[0];if(!body)throw Error('문서 본문이 없습니다.');
  for(const node of body.children){abort();if(node.localName==='p')add(safe(text(node)));else if(node.localName==='tbl')add(table(Array.from(node.children).filter(n=>n.localName==='tr').map(row=>Array.from(row.children).filter(n=>n.localName==='tc').map(c=>all(c,'p').map(text).join('\n')))));}
 }else if(ext==='pptx'){
  const names=Object.keys(files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  if(!names.length)throw Error('슬라이드가 없습니다.');
  for(const [i,name] of names.slice(0,300).entries()){abort();add('## '+(i+1)+'번 슬라이드');paragraphs(xml(name));const rel=name.replace('slides/','slides/_rels/')+'.rels';
   if(files[rel])for(const r of all(xml(rel),'Relationship'))if(attr(r,'Type').endsWith('/notesSlide')&&attr(r,'TargetMode')!=='External'){
    const target=new URL(attr(r,'Target'),'https://document.invalid/'+name).pathname.slice(1);
    if(files[target]){add('### 발표자 노트');paragraphs(xml(target));}
   }
  }if(names.length>300)warnings.push('처음 300개 슬라이드까지 추출했습니다.');
 }else if(ext==='hwpx'){
  const names=Object.keys(files).filter(n=>/^Contents\/section\d+\.xml$/.test(n)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  if(!names.length)throw Error('HWPX 본문이 없습니다.');
  for(const name of names){abort();const doc=xml(name);
   for(const p of all(doc,'p')){const direct=all(p,'t').filter(t=>{let n=t.parentElement;while(n&&n!==p){if(n.localName==='p')return false;n=n.parentElement;}return n===p;});if(direct.length)add(safe(direct.map(t=>t.textContent).join('')));}
  }warnings.push('HWPX 표는 셀의 텍스트 순서로 표시됩니다.');
 }else if(ext==='xlsx'){
  const workbook=xml('xl/workbook.xml'),rels=xml('xl/_rels/workbook.xml.rels'),strings=files['xl/sharedStrings.xml']?all(xml('xl/sharedStrings.xml'),'si').map(text):[];
  const sheets=all(workbook,'sheet');for(const sheet of sheets.slice(0,20)){abort();const rel=all(rels,'Relationship').find(r=>attr(r,'Id')===attr(sheet,'id'));if(!rel||attr(rel,'TargetMode')==='External')continue;
   const target=new URL(attr(rel,'Target'),'https://document.invalid/xl/workbook.xml').pathname.slice(1);if(!files[target])continue;
   add('## '+safe(attr(sheet,'name'))+(attr(sheet,'state')&&attr(sheet,'state')!=='visible'?' (숨김 시트)':''));
   const rows=[];for(const row of all(xml(target),'row').slice(0,2000)){const values=[];
    for(const c of Array.from(row.children).filter(n=>n.localName==='c')){const ref=attr(c,'r').match(/^[A-Z]+/);let col=0;for(const l of ref?.[0]||'A')col=col*26+l.charCodeAt(0)-64;col--;if(col>=40)continue;
     const type=attr(c,'t'),v=all(c,'v')[0]?.textContent||'',f=all(c,'f')[0]?.textContent;
     values[col]=type==='s'?(strings[Number(v)]||''):type==='inlineStr'?text(c):type==='b'?(v==='1'?'TRUE':'FALSE'):v|| (f?'='+f:'');
    }rows.push(values);
   }add(table(rows));
  }warnings.push('최대 20개 시트, 시트당 2,000행·40열을 읽습니다. 수식은 저장된 값 또는 식을 표시하며 실행하지 않습니다. 날짜·통화 서식은 원시 값일 수 있습니다.');
 }else throw Error('지원하지 않는 문서입니다.');
 if(length>=1000000)warnings.push('본문을 100만 글자까지 추출했습니다.');
 const extractedImages=[];let imageBytes=0;
 const candidates=Object.keys(files).filter(n=>/^(word\/media\/|ppt\/media\/|xl\/media\/|BinData\/)/.test(n));
 for(const name of candidates){abort();if(extractedImages.length>=40){warnings.push('이미지는 40개까지 추출했습니다.');break;}
  if(!/\.(png|jpe?g|gif|bmp|webp)$/i.test(name)){warnings.push('브라우저에서 읽을 수 없는 이미지: '+name.split('/').pop());continue;}
  let bitmap;
  try{bitmap=await createImageBitmap(new Blob([files[name]]));if(bitmap.width*bitmap.height>20000000)throw Error('이미지 크기 초과');
   const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
   const dataUrl=canvas.toDataURL('image/png');imageBytes+=Math.ceil(dataUrl.split(',')[1].length*3/4);if(imageBytes>LIMIT){warnings.push('추출 이미지가 20MB를 넘어 일부를 제외했습니다.');break;}extractedImages.push({name:name.split('/').pop().replace(/\.[^.]+$/,'.png'),dataUrl});
  }catch{warnings.push('이미지를 읽지 못했습니다: '+name.split('/').pop());}finally{bitmap?.close();}
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 abort();const originalSha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
 return {ok:true,body:chunks.join('\n\n').slice(0,1000000),kind:ext.toUpperCase(),extractedImages,warnings,originalSha};
}
