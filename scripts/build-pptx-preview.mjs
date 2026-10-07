import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const modules=path.resolve(process.argv[2]||path.join(root,'node_modules'));
const require=createRequire(import.meta.url),{build}=require(path.join(modules,'esbuild'));
const pkg=path.join(modules,'@aiden0z/pptx-renderer');
const version=JSON.parse(await fs.readFile(path.join(pkg,'package.json'),'utf8')).version;
if(version!=='1.3.0')throw Error('Expected @aiden0z/pptx-renderer 1.3.0');
await build({entryPoints:[path.join(root,'scripts/pptx-preview-entry.js')],bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,nodePaths:[modules],outfile:path.join(root,'vendor/pptx-preview-bundle.js'),banner:{js:'/* @aiden0z/pptx-renderer 1.3.0 — see pptx-renderer-LICENSE and pptx-THIRD_PARTY_NOTICES.md */'},legalComments:'eof'});
const script=(await fs.readFile(path.join(root,'vendor/pptx-preview-bundle.js'),'utf8')).replace(/<\/script/gi,'<\\/script');
const hash='sha256-'+createHash('sha256').update(script).digest('base64');
const css=await fs.readFile(path.join(root,'page-viewer.css'),'utf8');
const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src '${hash}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><style>body{margin:0;font-family:system-ui,'Malgun Gothic',sans-serif;color:#333}button,input{font:inherit}*{box-sizing:border-box}${css}</style></head><body><div id="pages" tabindex="0">슬라이드를 불러오는 중입니다.</div><script>${script}</script></body></html>`;
await fs.writeFile(path.join(root,'pptx-preview.html'),html);
await fs.writeFile(path.join(root,'pptx-preview-csp.json'),JSON.stringify({scriptHash:hash})+'\n');
const index=path.join(root,'index.html'),original=await fs.readFile(index,'utf8');
if(original.includes('Content-Security-Policy'))await fs.writeFile(index,original.replace(/script-src ([^;]+);/,(_,rules)=>`script-src ${rules.replace(/'sha256-[^']+'\s*/g,'').trim()} '${hash}';`));
await fs.copyFile(path.join(pkg,'LICENSE'),path.join(root,'vendor/pptx-renderer-LICENSE'));
await fs.copyFile(path.join(pkg,'THIRD_PARTY_NOTICES.md'),path.join(root,'vendor/pptx-THIRD_PARTY_NOTICES.md'));
await fs.cp(path.join(pkg,'licenses'),path.join(root,'vendor/licenses'),{recursive:true});
for(const name of ['jszip','echarts','zrender']){
  const base=path.join(modules,name);let filename='LICENSE';
  try{await fs.access(path.join(base,filename));}catch{filename='LICENSE.markdown';}
  await fs.copyFile(path.join(base,filename),path.join(root,'vendor',name+'-LICENSE'));
}
await fs.mkdir(path.join(root,'vendor/scripts/ooxml-geometry'),{recursive:true});
await fs.copyFile(path.join(pkg,'scripts/ooxml-geometry/source-manifest.json'),path.join(root,'vendor/scripts/ooxml-geometry/source-manifest.json'));
console.log('Pinned PPTX preview bundle and notices built.');
