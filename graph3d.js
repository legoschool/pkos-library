import {esc} from './core.js';
import {layoutGraph,rankHubs,pointScale,pickLabels} from './graph-layout.js';
let view={yaw:0.4,pitch:0.18,zoom:1};
try{const saved=JSON.parse(localStorage.getItem('pkos-map3d-view'));if(saved&&['yaw','pitch','zoom'].every(k=>Number.isFinite(saved[k])))view={yaw:saved.yaw,pitch:Math.max(-1.4,Math.min(1.4,saved.pitch)),zoom:Math.max(.65,Math.min(1.8,saved.zoom))};}catch{}
const persist=()=>{try{localStorage.setItem('pkos-map3d-view',JSON.stringify(view));}catch{}};
export function mountGraph3D(area,notes,edges,total,{caption='',colorOf=null,labelOf=n=>n.title||'제목 없음'}={}){
 let disposed=false,frame=0,drag=null,blockedClick=false;
 area.innerHTML='<div class="map3d-controls" aria-label="입체 지도 조작"><button type="button" data-turn="left" aria-label="왼쪽으로 회전">←</button><button type="button" data-turn="right" aria-label="오른쪽으로 회전">→</button><button type="button" data-turn="up" aria-label="위로 회전">↑</button><button type="button" data-turn="down" aria-label="아래로 회전">↓</button><button type="button" data-turn="reset">시점 초기화</button><label>확대 <input aria-label="입체 지도 확대" type="range" min="0.65" max="1.8" step=".05" value="'+view.zoom+'"></label><label><input type="checkbox" class="map3d-labels"> 모든 제목</label></div><p class="hint map3d-help">빈 곳을 끌어 회전하세요. 지도에 초점을 맞추면 방향키로도 회전할 수 있습니다. 점은 기록, 선은 선택한 기준에 따른 연결입니다. 선으로 이어진 기록끼리 가까이 모입니다. 거리는 연결 규칙으로 계산한 배치이며 의미가 얼마나 가까운지를 재는 값은 아닙니다.</p><svg class="map3d" role="group" tabindex="0" aria-label="입체 기록 지도. 방향키로 회전, 더하기와 빼기로 확대"></svg><div class="map-count"></div>';
 const svg=area.querySelector('svg'),count=area.querySelector('.map-count'),slider=area.querySelector('input[type=range]');
 count.textContent=caption||(notes.length+'개 기록 · '+edges.length+'개 주요 연결'+(total>notes.length?' · 전체 '+total+'개 중':''));
 const layout=layoutGraph(notes.map(n=>n.id),edges,{dims:3}),coords=notes.map(note=>({note,...layout.get(note.id)}));
 const hubs=new Set(rankHubs(notes.map(n=>n.id),edges).slice(0,Math.max(12,Math.ceil(notes.length*.15))));
 const degree=new Map(notes.map(n=>[n.id,0]));edges.forEach(e=>{degree.set(e.a,degree.get(e.a)+1);degree.set(e.b,degree.get(e.b)+1);});
 let allLabels=false;
 function draw(){
  if(disposed)return;frame=0;
  const w=Math.max(260,area.clientWidth),h=Math.max(330,Math.min(580,innerHeight-330)),radius=Math.min(w,h)*.32*view.zoom;
  svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.style.height=h+'px';
  const cy=Math.cos(view.yaw),sy=Math.sin(view.yaw),cp=Math.cos(view.pitch),sp=Math.sin(view.pitch);
  const positions=coords.map(n=>{const x=n.x*cy+n.z*sy,z=n.z*cy-n.x*sy,y=n.y*cp-z*sp,depth=z*cp+n.y*sp,perspective=3/(3-depth);return {...n,depth,scale:perspective,px:w/2+x*radius*perspective,py:h/2+y*radius*perspective};}).sort((a,b)=>a.depth-b.depth);
  const points=new Map(positions.map(p=>[p.note.id,p])),size=pointScale(w,h,notes.length),label=p=>(labelOf(p.note)||'제목 없음').slice(0,22);
  const labelled=allLabels||notes.length<=12?null:pickLabels(positions.slice().reverse().filter(p=>hubs.has(p.note.id)).map(p=>({id:p.note.id,x:p.px,y:p.py+24*p.scale*size,text:label(p)})),5,{charWidth:innerWidth<=700?17:12.5,height:innerWidth<=700?20:15});
  svg.innerHTML=edges.map((e,i)=>{const a=points.get(e.a),b=points.get(e.b);return `<g class="graph-edge" data-action="graph-reason" data-edge="${i}" tabindex="0" role="button" aria-label="${esc(e.reasons.join('; '))}"><title>${esc(e.reasons.join('; '))}</title><line x1="${a.px}" y1="${a.py}" x2="${b.px}" y2="${b.py}" opacity="${.25+(a.scale+b.scale)/5}"/><line class="edge-hit" x1="${a.px}" y1="${a.py}" x2="${b.px}" y2="${b.py}"/></g>`;}).join('')+positions.map((p,i)=>`<g data-note="${p.note.id}" tabindex="0" role="link" aria-label="${esc(labelOf(p.note))}" data-depth="${p.depth.toFixed(3)}"><title>${esc(labelOf(p.note))}</title><circle cx="${p.px}" cy="${p.py}" r="${(7+Math.min(7,degree.get(p.note.id)))*p.scale*size}" opacity="${.5+p.scale/3}"${colorOf?` style="fill:${colorOf(p.note)}"`:''}/>${!labelled?`<text x="${p.px}" y="${p.py+24*p.scale*size}" text-anchor="middle">${esc(label(p))}</text>`:''}</g>`).join('')+(labelled?'<g class="map3d-labels" aria-hidden="true">'+positions.filter(p=>labelled.has(p.note.id)).map(p=>`<text x="${p.px}" y="${p.py+24*p.scale*size}" text-anchor="middle">${esc(label(p))}</text>`).join('')+'</g>':'');
 }
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(draw);};
 function rotate(x,y){view.yaw+=x;view.pitch=Math.max(-1.4,Math.min(1.4,view.pitch+y));schedule();persist();}
 function zoom(delta){view.zoom=Math.max(.65,Math.min(1.8,view.zoom+delta));slider.value=view.zoom;schedule();persist();}
 area.addEventListener('click',e=>{
  const action=e.target.closest('[data-turn]')?.dataset.turn;
  if(action==='left')rotate(-.22,0);if(action==='right')rotate(.22,0);if(action==='up')rotate(0,-.18);if(action==='down')rotate(0,.18);
  if(action==='reset'){view={yaw:.4,pitch:.18,zoom:1};slider.value=1;schedule();persist();}
 });
 area.addEventListener('input',e=>{if(e.target===slider){view.zoom=Number(slider.value);schedule();persist();}if(e.target.matches('.map3d-labels')){allLabels=e.target.checked;schedule();}});
 svg.addEventListener('keydown',e=>{if(e.target!==svg)return;const keys={ArrowLeft:[-.22,0],ArrowRight:[.22,0],ArrowUp:[0,-.18],ArrowDown:[0,.18]};if(keys[e.key]){e.preventDefault();rotate(...keys[e.key]);}if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(e.key==='-'?-.1:.1);}});
 svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};blockedClick=false;});
 svg.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>6){drag.moved=true;svg.setPointerCapture(e.pointerId);}if(drag.moved){view.yaw+=(e.clientX-drag.x)/180;view.pitch=Math.max(-1.4,Math.min(1.4,view.pitch+(e.clientY-drag.y)/180));schedule();}drag.x=e.clientX;drag.y=e.clientY;});
 const end=e=>{if(!drag||drag.id!==e.pointerId)return;blockedClick=drag.moved;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);drag=null;persist();};
 svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
 svg.addEventListener('click',e=>{if(blockedClick){e.preventDefault();e.stopPropagation();blockedClick=false;}},true);
 const resize=new ResizeObserver(schedule);resize.observe(area);draw();
 return ()=>{disposed=true;cancelAnimationFrame(frame);resize.disconnect();};
}
