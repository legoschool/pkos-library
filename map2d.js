import {esc,normalize} from './core.js';
import {layoutGraph,rankHubs,pointScale,separate,pickLabels} from './graph-layout.js';
// 2D knowledge map. Up to SVG_MAX records are SVG elements (keyboard reachable); larger maps draw on a canvas.
// Colors follow the topic, cluster names label the overview, zooming in reveals record titles.
let view={k:1,x:0,y:0},lastMap='';
const MIN=.4,MAX=12,SVG_MAX=600,GRAY='#8a8a85';
export function mountGraph2D(area,notes,edges,total,o={}){
 const {criteria=1,positions=null,caption='',colorOf=()=>'',groupOf=n=>n.folder||'',groupLabel=g=>g.split('/').pop(),legend=[],entityOf=()=>'',onOpen=()=>{},onEdge=()=>{}}=o;
 const canvasMode=notes.length>SVG_MAX,signature=notes.length+':'+(notes[0]?.id||'')+':'+(notes.at(-1)?.id||'');
 // A different set of records starts from the whole-map view; redrawing the same map keeps the zoom.
 if(signature!==lastMap){view={k:1,x:0,y:0};lastMap=signature;}
 let disposed=false,frame=0,drag=null,blockedClick=false,size='',base=[],pointers=new Map(),pinch=null,hover='',focusSet=null,focusLabel='',query='',queryTimer=0,screen=[];
 const ids=notes.map(n=>n.id),index=new Map(ids.map((id,i)=>[id,i])),ranked=rankHubs(ids,edges),degree=new Float64Array(notes.length);
 const adj=notes.map(()=>[]);edges.forEach((e,i)=>{const a=index.get(e.a),b=index.get(e.b);if(a===undefined||b===undefined)return;degree[a]++;degree[b]++;adj[a].push([b,i]);adj[b].push([a,i]);});
 const colors=notes.map(n=>colorOf(n)||'#9986be'),groups=notes.map(n=>groupOf(n));
 let layout=null;if(!positions)layout=layoutGraph(ids,edges);
 const norm=i=>positions?positions[i]:[layout.get(ids[i]).x,layout.get(ids[i]).y];
 const title=n=>{const t=n.title||'제목 없음';return t.length>16?t.slice(0,15)+'…':t;};
 area.innerHTML=`<div class="map3d-controls map2d-controls" aria-label="지식맵 확대와 이동"><button type="button" data-zoom="in" aria-label="확대">+</button><button type="button" data-zoom="out" aria-label="축소">−</button><button type="button" data-zoom="reset">전체 보기</button><label class="map-find">지도에서 찾기 <input type="search" data-map-find placeholder="기록 제목" aria-label="지도에서 기록 찾기"></label><span class="map-find-count" role="status"></span><span class="hint">휠이나 두 손가락으로 확대·축소, 빈 곳을 끌어 이동</span></div>`
  +(legend.length?`<div class="map-legend" role="group" aria-label="주제별 색">${legend.map(l=>`<button type="button" class="map-legend-item" data-legend="${esc(l.key)}" aria-pressed="false"><i style="background:${l.color}"></i>${esc(l.label)} <small>${l.count}</small></button>`).join('')}</div>`:'')
  +(canvasMode?'<canvas class="map2d map2d-canvas" tabindex="0" role="img" aria-label="기록 연결 지도. 더하기와 빼기로 확대, 방향키로 이동. 기록은 아래 목록에서도 찾을 수 있습니다."></canvas><div class="map-tip" hidden></div>':'<svg class="map2d" role="group" tabindex="0" aria-label="기록 연결 지도. 더하기와 빼기로 확대, 방향키로 이동"></svg>')
  +`<div class="map-count"></div>`;
 const surface=area.querySelector('.map2d'),count=area.querySelector('.map-count'),tip=area.querySelector('.map-tip'),findCount=area.querySelector('.map-find-count');
 count.textContent=caption||(notes.length+'개 기록 · '+edges.length+'개 주요 연결'+(total>notes.length?' · 전체 '+total+'개 중':''));
 if(!criteria)count.textContent+=' · 연결 기준을 선택하세요';
 const dims=()=>({w:Math.max(260,area.clientWidth),h:Math.max(320,Math.min(680,innerHeight-240))});
 function place(w,h){
  const scale=pointScale(w,h,notes.length)*(canvasMode?.75:1);
  base=notes.map((n,i)=>{const p=norm(i);return {i,x:w/2+p[0]*(w/2-38),y:h/2+p[1]*(h/2-36),r:(canvasMode?3.5+Math.min(6,degree[i]*1.2):7+Math.min(7,degree[i]))*scale};});
  if(!canvasMode)separate(base,{width:w,height:h});
 }
 // Cluster centres for overview labels: notebooks with at least three records on the map.
 function clusters(){
  const m=new Map();base.forEach((p,i)=>{const g=groups[i];if(!g)return;let c=m.get(g);if(!c)m.set(g,c={key:g,x:0,y:0,count:0});c.x+=p.x;c.y+=p.y;c.count++;});
  return [...m.values()].filter(c=>c.count>=3).map(c=>({...c,x:c.x/c.count,y:c.y/c.count})).sort((a,b)=>b.count-a.count);
 }
 let clusterList=[];
 const lit=i=>{if(focusSet&&!focusSet.has(i))return false;if(hover!==''){const h=index.get(hover);return i===h||adj[h].some(([j])=>j===i);}return true;};
 function labelsFor(w,h){
  const narrow=innerWidth<=700,cw=narrow?17:12.5,lh=narrow?20:15,items=[];
  const inside=(x,y)=>x>-10&&x<w+10&&y>-10&&y<h+10;
  const overview=view.k<2.6&&clusterList.length>1;
  if(overview)for(const c of clusterList){const x=w/2+(c.x-w/2)*view.k+view.x,y=h/2+(c.y-h/2)*view.k+view.y;if(inside(x,y))items.push({id:'cluster:'+c.key,x,y,text:groupLabel(c.key),cluster:true});}
  const clusterNames=new Set(items.map(t=>t.text));
  const nodeMax=notes.length<10?notes.length:Math.round((w<500?3:7)*Math.max(overview?0:1,Math.min(4,view.k-1)));
  let added=0;for(const id of ranked){if(added>=nodeMax)break;const i=index.get(id),s=screen[i];if(!inside(s.x,s.y)||!lit(i))continue;const text=title(notes[i]);if(clusterNames.has(text))continue;items.push({id,x:s.x,y:s.y+s.r+12,text});added++;}
  if(hover!==''){const i=index.get(hover),s=screen[i];items.unshift({id:hover,x:s.x,y:s.y+s.r+12,text:title(notes[i])});}
  // keep every label fully on screen: pull its centre inward by half its estimated width
  for(const t of items){const half=[...t.text].length*(t.cluster?cw*1.1:cw)/2+4;t.x=Math.max(half,Math.min(w-half,t.x));}
  const chosen=pickLabels(items,overview?(w<500?8:18)+nodeMax:nodeMax+1,{charWidth:cw,height:lh});
  return items.filter(t=>chosen.has(t.id));
 }
 function project(w,h){const grow=Math.min(1.7,Math.max(.8,Math.sqrt(view.k)));screen=base.map(p=>({x:w/2+(p.x-w/2)*view.k+view.x,y:h/2+(p.y-h/2)*view.k+view.y,r:p.r*grow}));}
 function drawSVG(w,h){
  surface.setAttribute('viewBox','0 0 '+w+' '+h);surface.style.height=h+'px';
  const labels=labelsFor(w,h),nodeLabels=new Map(labels.filter(t=>!t.cluster).map(t=>[t.id,t])),dim=focusSet||hover!=='';
  const ordered=notes.map((n,i)=>i).sort((a,b)=>(nodeLabels.has(ids[a])-nodeLabels.has(ids[b]))||(lit(a)-lit(b)));
  surface.classList.toggle('is-focus',dim);
  surface.innerHTML=edges.map((e,i)=>{const a=index.get(e.a),b=index.get(e.b),s=screen[a],t=screen[b],on=!dim||(lit(a)&&lit(b)&&(hover===''||e.a===hover||e.b===hover));return `<g class="graph-edge${on?' is-near':''}" data-action="graph-reason" data-edge="${i}" tabindex="0" role="button" aria-label="${esc(e.reasons.join('; '))}"><title>${esc(e.reasons.join('; '))}</title><line x1="${s.x}" y1="${s.y}" x2="${t.x}" y2="${t.y}"/><line class="edge-hit" x1="${s.x}" y1="${s.y}" x2="${t.x}" y2="${t.y}"/></g>`;}).join('')
   +ordered.map(i=>{const n=notes[i],s=screen[i],l=nodeLabels.get(n.id);return `<g data-note="${n.id}" class="${lit(i)?'is-near':''}" tabindex="0" role="link" aria-label="${esc(n.title)}"><title>${esc(n.title)}</title><circle cx="${s.x}" cy="${s.y}" r="${s.r}" style="fill:${colors[i]}"/>${l?`<text x="${l.x}" y="${l.y}" text-anchor="middle" dominant-baseline="middle">${esc(l.text)}</text>`:''}</g>`;}).join('')
   +`<g class="map-clusters" aria-hidden="true">${labels.filter(t=>t.cluster).map(t=>`<text x="${t.x}" y="${t.y}" text-anchor="middle" dominant-baseline="middle">${esc(t.text)}</text>`).join('')}</g>`;
 }
 function drawCanvas(w,h){
  const dpr=devicePixelRatio||1;surface.style.height=h+'px';surface.style.width='100%';
  if(surface.width!==Math.round(w*dpr)||surface.height!==Math.round(h*dpr)){surface.width=Math.round(w*dpr);surface.height=Math.round(h*dpr);}
  const ctx=surface.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const dim=focusSet||hover!=='';
  ctx.lineWidth=1;
  for(const pass of dim?[false,true]:[true]){
   ctx.strokeStyle=pass?(dim?'rgba(99,84,164,.55)':'rgba(120,112,140,.28)'):'rgba(120,112,140,.07)';ctx.beginPath();
   edges.forEach(e=>{const a=index.get(e.a),b=index.get(e.b),on=!dim||(lit(a)&&lit(b)&&(hover===''||e.a===hover||e.b===hover));if(on!==pass)return;const s=screen[a],t=screen[b];ctx.moveTo(s.x,s.y);ctx.lineTo(t.x,t.y);});ctx.stroke();
  }
  const order=notes.map((n,i)=>i).sort((a,b)=>lit(a)-lit(b));
  for(const i of order){const s=screen[i];if(s.x<-20||s.x>w+20||s.y<-20||s.y>h+20)continue;ctx.globalAlpha=lit(i)?1:.13;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fillStyle=colors[i];ctx.fill();ctx.lineWidth=1.2;ctx.strokeStyle='#fff';ctx.stroke();}
  ctx.globalAlpha=1;
  for(const t of labelsFor(w,h)){ctx.font=t.cluster?'700 14px Pretendard,"Noto Sans KR","Malgun Gothic",sans-serif':'12.5px Pretendard,"Noto Sans KR","Malgun Gothic",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=4;ctx.lineJoin='round';ctx.strokeStyle='#fff';ctx.strokeText(t.text,t.x,t.y);ctx.fillStyle=t.cluster?'#292929':'#4f4a59';ctx.fillText(t.text,t.x,t.y);}
 }
 function draw(){
  if(disposed)return;frame=0;
  const {w,h}=dims();if(size!==w+'x'+h){size=w+'x'+h;place(w,h);clusterList=clusters();}
  project(w,h);canvasMode?drawCanvas(w,h):drawSVG(w,h);
 }
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(draw);};
 const point=(cx,cy)=>{const r=surface.getBoundingClientRect(),{w,h}=dims();return {x:(cx-r.left)*w/Math.max(1,r.width),y:(cy-r.top)*h/Math.max(1,r.height)};};
 function zoomAt(factor,px,py){
  const {w,h}=dims(),k=Math.max(MIN,Math.min(MAX,view.k*factor));if(k===view.k)return;
  const wx=(px-w/2-view.x)/view.k+w/2,wy=(py-h/2-view.y)/view.k+h/2;
  view={k,x:px-w/2-(wx-w/2)*k,y:py-h/2-(wy-h/2)*k};schedule();
 }
 const zoomCenter=f=>{const {w,h}=dims();zoomAt(f,w/2,h/2);};
 function fit(set){
  const pts=[...set].map(i=>base[i]);if(!pts.length)return;const {w,h}=dims();
  const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),bw=Math.max(...xs)-Math.min(...xs),bh=Math.max(...ys)-Math.min(...ys);
  const k=Math.max(MIN,Math.min(MAX,Math.min(w/(bw+160),h/(bh+120)))),cx=(Math.max(...xs)+Math.min(...xs))/2,cy=(Math.max(...ys)+Math.min(...ys))/2;
  view={k,x:-(cx-w/2)*k,y:-(cy-h/2)*k};schedule();
 }
 function hit(px,py){let best=-1,bd=Infinity;screen.forEach((s,i)=>{const d=(s.x-px)**2+(s.y-py)**2;if(d<=(s.r+5)**2&&d<bd){bd=d;best=i;}});return best;}
 function hitEdge(px,py){let best=-1,bd=36;edges.forEach((e,i)=>{const a=screen[index.get(e.a)],b=screen[index.get(e.b)];const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((px-a.x)*dx+(py-a.y)*dy)/l)),d=(a.x+t*dx-px)**2+(a.y+t*dy-py)**2;if(d<bd){bd=d;best=i;}});return best;}
 const setFocus=(set,label)=>{focusSet=set;focusLabel=label;area.querySelectorAll('[data-legend]').forEach(b=>b.setAttribute('aria-pressed',String(label==='legend:'+b.dataset.legend)));schedule();};
 area.addEventListener('click',e=>{
  const z=e.target.closest('[data-zoom]')?.dataset.zoom;if(z==='in')zoomCenter(1.4);if(z==='out')zoomCenter(1/1.4);if(z==='reset'){view={k:1,x:0,y:0};schedule();}
  const lg=e.target.closest('[data-legend]');if(lg){const key=lg.dataset.legend;if(focusLabel==='legend:'+key)setFocus(null,'');else{const set=new Set(notes.map((n,i)=>entityOf(n)===key?i:-1).filter(i=>i>=0));setFocus(set,'legend:'+key);}}
 });
 area.addEventListener('input',e=>{if(!e.target.matches('[data-map-find]'))return;clearTimeout(queryTimer);queryTimer=setTimeout(()=>{query=normalize(e.target.value);if(!query){setFocus(null,'');findCount.textContent='';return;}const set=new Set(notes.map((n,i)=>normalize(n.title).includes(query)?i:-1).filter(i=>i>=0));setFocus(set,'find');findCount.textContent=set.size+'개 찾음';},180);});
 area.addEventListener('keydown',e=>{if(e.target.matches('[data-map-find]')&&e.key==='Enter'){e.preventDefault();if(focusSet?.size)fit(focusSet);}});
 surface.addEventListener('wheel',e=>{e.preventDefault();const p=point(e.clientX,e.clientY);zoomAt(Math.exp(-e.deltaY*(e.deltaMode===1?.05:.0015)),p.x,p.y);},{passive:false});
 surface.addEventListener('keydown',e=>{if(e.target!==surface)return;const pan={ArrowLeft:[40,0],ArrowRight:[-40,0],ArrowUp:[0,40],ArrowDown:[0,-40]}[e.key];
  if(pan){e.preventDefault();view={...view,x:view.x+pan[0],y:view.y+pan[1]};schedule();}
  if(['+','='].includes(e.key)){e.preventDefault();zoomCenter(1.25);}if(e.key==='-'){e.preventDefault();zoomCenter(.8);}if(e.key==='0'){e.preventDefault();view={k:1,x:0,y:0};schedule();}});
 surface.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y),k:view.k};drag=null;blockedClick=true;return;}
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};blockedClick=false;});
 surface.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId)){// hover: highlight a record and its neighbours
   const p=point(e.clientX,e.clientY),i=canvasMode?hit(p.x,p.y):index.get(e.target.closest?.('[data-note]')?.dataset.note??'');const id=i===undefined||i<0?'':ids[i];
   if(id!==hover){hover=id;schedule();}
   if(tip){if(id){tip.hidden=false;tip.textContent=notes[i].title||'제목 없음';const r=area.getBoundingClientRect();tip.style.left=(e.clientX-r.left+14)+'px';tip.style.top=(e.clientY-r.top+14)+'px';}else tip.hidden=true;}
   if(canvasMode)surface.style.cursor=id?'pointer':'';return;}
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch&&pointers.size===2){const [a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y),m=point((a.x+b.x)/2,(a.y+b.y)/2);zoomAt(pinch.k*d/Math.max(1,pinch.d)/view.k,m.x,m.y);return;}
  if(!drag||drag.id!==e.pointerId)return;
  if(!drag.moved&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>6){drag.moved=true;surface.setPointerCapture(e.pointerId);}
  if(drag.moved){const r=surface.getBoundingClientRect(),{w}=dims(),s=w/Math.max(1,r.width);view={...view,x:view.x+(e.clientX-drag.x)*s,y:view.y+(e.clientY-drag.y)*s};schedule();}
  drag.x=e.clientX;drag.y=e.clientY;});
 surface.addEventListener('pointerleave',()=>{if(hover!==''){hover='';schedule();}if(tip)tip.hidden=true;});
 const end=e=>{pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;if(!drag||drag.id!==e.pointerId)return;blockedClick=blockedClick||drag.moved;if(surface.hasPointerCapture(e.pointerId))surface.releasePointerCapture(e.pointerId);drag=null;};
 surface.addEventListener('pointerup',end);surface.addEventListener('pointercancel',end);
 surface.addEventListener('click',e=>{
  if(blockedClick){e.preventDefault();e.stopPropagation();blockedClick=false;return;}
  if(!canvasMode)return;const p=point(e.clientX,e.clientY),i=hit(p.x,p.y);
  if(i>=0){onOpen(ids[i]);return;}const k=hitEdge(p.x,p.y);if(k>=0)onEdge(k);
 },true);
 const resize=new ResizeObserver(schedule);resize.observe(area);draw();
 return ()=>{disposed=true;cancelAnimationFrame(frame);clearTimeout(queryTimer);resize.disconnect();};
}
export const resetMapView=()=>{view={k:1,x:0,y:0};};
