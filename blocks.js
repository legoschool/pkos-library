import {marked} from './vendor/marked.js';
import {esc} from './core.js';

// Keep each token's original Markdown, including unsupported HTML and whitespace.
// Switching editors without editing must never rewrite an existing document.
export function splitBlocks(markdown){
 const blocks=[];let prefix='';
 for(const token of marked.lexer(markdown)){
  if(token.type==='space'){if(blocks.length)blocks.at(-1).raw+=token.raw;else prefix+=token.raw;continue;}
  blocks.push({id:crypto.randomUUID(),type:token.type,raw:prefix+token.raw});prefix='';
 }
 if(prefix)blocks.push({id:crypto.randomUUID(),type:'paragraph',raw:prefix});
 return blocks.map(b=>b.raw).join('')===markdown?blocks:[{id:crypto.randomUUID(),type:'paragraph',raw:markdown}];
}
export const joinBlocks=blocks=>blocks.map(b=>b.raw).join('');
const templates={paragraph:'새 문단\n\n',heading:'# 제목\n\n',subheading:'## 소제목\n\n',bullet:'- 목록 항목\n\n',ordered:'1. 목록 항목\n\n',task:'- [ ] 할 일\n\n',quote:'> 인용문\n\n',callout:'> 💡 기억할 내용\n\n',code:'```text\n코드\n```\n\n',table:'| 항목 | 내용 |\n| --- | --- |\n| 이름 | 값 |\n\n',toggle:'<details>\n<summary>펼쳐 보기</summary>\n\n내용\n\n</details>\n\n',divider:'---\n\n',link:'[링크 이름](https://example.com)\n\n',page:'[[연결할 기록 제목]]\n\n',math:'수식: `E = mc²`\n\n'};
const labels={paragraph:'문단',heading:'제목',subheading:'소제목',bullet:'글머리 목록',ordered:'번호 목록',task:'할 일',quote:'인용',callout:'콜아웃',code:'코드',table:'표',toggle:'접기',divider:'구분선',link:'웹 링크',page:'기록 연결',math:'수식 텍스트'};
export function mountBlocks(textarea){
 if(!textarea||textarea.dataset.blocksMounted)return;
 textarea.dataset.blocksMounted='1';let blocks=splitBlocks(textarea.value),active=false;
 const root=document.createElement('section');root.className='block-editor';root.hidden=true;
 const toggle=document.createElement('button');toggle.type='button';toggle.textContent='블록으로 편집';toggle.className='format';
 textarea.before(root);textarea.closest('.editor-page').querySelector('.format-bar').append(toggle);
 const publish=()=>{textarea.value=joinBlocks(blocks);textarea.dispatchEvent(new Event('input',{bubbles:true}));};
 const render=()=>{root.innerHTML=`<p class="hint">블록별로 내용을 쓰고 ↑↓로 순서를 옮깁니다. 표·코드·중첩 목록은 블록 안에서 Markdown으로 편집합니다.</p><div class="block-items">${blocks.map((b,i)=>`<section class="block-row" data-index="${i}"><div class="block-controls"><span>${i+1} · ${esc(labels[b.type]||b.type)}</span><button type="button" data-block="up" ${i===0?'disabled':''} aria-label="위로 이동">↑</button><button type="button" data-block="down" ${i===blocks.length-1?'disabled':''} aria-label="아래로 이동">↓</button><button type="button" data-block="duplicate">복제</button><button type="button" data-block="remove">삭제</button></div><textarea aria-label="블록 ${i+1}" spellcheck="false">${esc(b.raw)}</textarea></section>`).join('')}</div><div class="block-add"><select aria-label="새 블록 종류">${Object.entries(labels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><button type="button" data-block="add">블록 추가</button></div>`;};
 toggle.onclick=()=>{active=!active;root.hidden=!active;textarea.hidden=active;toggle.textContent=active?'Markdown으로 편집':'블록으로 편집';if(active){blocks=splitBlocks(textarea.value);render();}};
 root.addEventListener('input',e=>{if(e.target.tagName!=='TEXTAREA')return;const i=Number(e.target.closest('[data-index]').dataset.index);blocks[i].raw=e.target.value;publish();});
 root.addEventListener('click',e=>{const button=e.target.closest('[data-block]');if(!button)return;const action=button.dataset.block,i=Number(button.closest('[data-index]')?.dataset.index);
  if(action==='add'){const type=root.querySelector('select').value;if(blocks.length&&!blocks.at(-1).raw.endsWith('\n\n'))blocks.at(-1).raw+='\n\n';blocks.push({id:crypto.randomUUID(),type,raw:templates[type]});}
  if(action==='remove')blocks.splice(i,1);
  if(action==='duplicate')blocks.splice(i+1,0,{...blocks[i],id:crypto.randomUUID()});
  if(action==='up'&&i>0)[blocks[i-1],blocks[i]]=[blocks[i],blocks[i-1]];
  if(action==='down'&&i<blocks.length-1)[blocks[i+1],blocks[i]]=[blocks[i],blocks[i+1]];
  publish();render();
 });
 // Other existing commands can still edit the Markdown textarea.
 textarea.addEventListener('input',()=>{if(active&&document.activeElement?.closest('.block-editor')!==root){blocks=splitBlocks(textarea.value);render();}});
}
