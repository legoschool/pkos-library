import {splitBlocks,readSpecial} from './block-model.js';
import {databaseMarkdown} from './database-engine.js';
const plain=s=>String(s||'').replace(/[<>]/g,'');
export function exportBlockMarkdown(markdown,{notes=[],assets=[],trail=[]}={},depth=0){if(!/(?:`{3,}|~{3,})pkos-/.test(markdown))return markdown;if(depth>8)return '[중첩 내용]';return splitBlocks(markdown).map(b=>{const s=readSpecial(b.raw);if(!s)return b.raw;const v=s.value,next=body=>exportBlockMarkdown(body,{notes,assets,trail},depth+1);
 if(s.type==='columns'&&Array.isArray(v.columns)&&v.columns.every(x=>typeof x==='string'))return v.columns.map(next).join('\n\n')+'\n\n';
 if(s.type==='callout'&&typeof v.body==='string')return ('> '+plain(v.icon)+'\n'+next(v.body).split('\n').map(l=>'> '+l).join('\n'))+'\n\n';
 if(s.type==='toggle'&&typeof v.body==='string')return '#### '+plain(v.title)+'\n\n'+next(v.body)+'\n\n';
 if(s.type==='math'&&typeof v.expression==='string')return '```latex\n'+v.expression.replace(/`{3,}/g,'')+'\n```\n\n';
 if(s.type==='toc')return '';
 if(s.type==='embed'&&/^https?:\/\//i.test(v.url))return '['+plain(v.title||v.url).replaceAll(']','\\]')+']('+v.url.replaceAll(')','%29')+')\n\n';
 if(s.type==='file'){const a=assets.find(a=>a.id===v.id);return '**첨부: '+plain(v.caption||a?.name||'원본 파일')+'**\n\n';}
 if(['synced','database'].includes(s.type)){const note=notes.find(n=>n.id===v.id&&!n.deleted);if(!note||trail.includes(v.id))return '[연결한 원본은 이 묶음에 포함되지 않았거나 순환 참조입니다.]\n\n';const body=s.type==='database'?databaseMarkdown(note.database,{notes,noteId:note.id}):note.body;return '#### '+plain(note.title)+'\n\n'+exportBlockMarkdown(body,{notes,assets,trail:[...trail,v.id]},depth+1)+'\n\n';}
 return b.raw;
 }).join('');}
