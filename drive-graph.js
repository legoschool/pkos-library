// G 드라이브 지식맵 그리기: 캔버스 위에서 묶음이 서로 당기고 밀며 자리를 잡는다.
// 같은 칸(7판 분류)은 한 무리로 모이고, 칸을 건너는 연결이 「어디서 어떻게 이어지는지」를 보여 준다.
// 휠·두 손가락으로 확대, 빈 곳을 끌어 이동, 원을 끌어 옮기고, 누르면 오른쪽에 연결 이유가 나온다.

export function mountDriveGraph(host,{nodes,edges,clusters,onSelect=()=>{},selected=-1}){
 const N=nodes.length,canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),tip=document.createElement('div');
 canvas.className='dg-canvas';tip.className='dg-tip';tip.hidden=true;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','G 드라이브 지식맵: 묶음 '+N+'개, 연결 '+edges.length+'개');
 host.append(canvas,tip);
 // 칸마다 원 둘레에 자리(무리의 중심)를 정한다. 같은 입력이면 늘 같은 모양이 나온다.
 // 무리 크기(묶음 수)에 맞춰 둘레를 나눠 서로 겹치지 않게 한다.
 const C=clusters.length,count=clusters.map((_,k)=>nodes.filter(n=>n.cluster===k).length),cr=count.map(n=>21*Math.sqrt(n)+46),anchor=new Array(C);
 // 큰 무리부터 가운데에 두고, 나머지는 나선을 따라 겹치지 않는 첫 자리에 둔다.
 [...cr.keys()].sort((p,q)=>cr[q]-cr[p]).forEach((k,n)=>{
  if(n===0){anchor[k]=[0,0];return;}
  for(let t=0;t<4000;t++){const a=t*.35,d=cr[k]*.5+t*6,px=Math.cos(a)*d,py=Math.sin(a)*d*.8;
   if(anchor.every((q,j)=>!q||Math.hypot(q[0]-px,q[1]-py)>=cr[j]+cr[k]+24)){anchor[k]=[px,py];return;}}
  anchor[k]=[0,0];
 });
 const hash=i=>{let x=Math.sin(i*12.9898+78.233)*43758.5453;return x-Math.floor(x);};
 const x=new Float64Array(N),y=new Float64Array(N),vx=new Float64Array(N),vy=new Float64Array(N),fixed=new Uint8Array(N);
 nodes.forEach((n,i)=>{const [ax,ay]=anchor[n.cluster]||[0,0],a=hash(i)*Math.PI*2,r=hash(i+7)*(cr[n.cluster]||60);x[i]=ax+Math.cos(a)*r;y[i]=ay+Math.sin(a)*r;});
 const adj=nodes.map(()=>[]);edges.forEach((e,k)=>{adj[e.a].push(k);adj[e.b].push(k);});
 let userMoved=false,alpha=1,raf=0,disposed=false,view={k:1,tx:0,ty:0},W=0,H=0,dpr=1,hover=-1,sel=selected,hi=null,hiddenClusters=new Set(),drag=null,moved=false,fitted=false;
 const visible=i=>!hiddenClusters.has(nodes[i].cluster);

 function tick(){
  const cell=110,grid=new Map(),key=(gx,gy)=>gx*100003+gy;
  for(let i=0;i<N;i++){if(!visible(i))continue;const k=key(Math.floor(x[i]/cell),Math.floor(y[i]/cell));let a=grid.get(k);if(!a){a=[];grid.set(k,a);}a.push(i);}
  for(let i=0;i<N;i++){
   if(!visible(i))continue;const gx=Math.floor(x[i]/cell),gy=Math.floor(y[i]/cell);
   for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const a=grid.get(key(gx+dx,gy+dy));if(!a)continue;for(const j of a){if(j<=i)continue;let ddx=x[i]-x[j],ddy=y[i]-y[j],d2=ddx*ddx+ddy*ddy;if(d2<.01){ddx=hash(i)-.5;ddy=hash(j)-.5;d2=.5;}const min=nodes[i].r+nodes[j].r+6,f=(d2<min*min?2.5:1)*1500/d2;const fx=ddx*f,fy=ddy*f;vx[i]+=fx;vy[i]+=fy;vx[j]-=fx;vy[j]-=fy;}}
  }
  for(const e of edges){const a=e.a,b=e.b;if(!visible(a)||!visible(b))continue;const ddx=x[b]-x[a],ddy=y[b]-y[a],d=Math.sqrt(ddx*ddx+ddy*ddy)||1,rest=60+nodes[a].r+nodes[b].r,f=(d-rest)/d*.012*e.w*(nodes[a].cluster===nodes[b].cluster?1:.08);vx[a]+=ddx*f;vy[a]+=ddy*f;vx[b]-=ddx*f;vy[b]-=ddy*f;}
  for(let i=0;i<N;i++){
   if(!visible(i)||fixed[i]){vx[i]=vy[i]=0;continue;}
   const [ax,ay]=anchor[nodes[i].cluster]||[0,0];vx[i]+=(ax-x[i])*.022;vy[i]+=(ay-y[i])*.022;
   vx[i]*=.62;vy[i]*=.62;const sp=Math.hypot(vx[i],vy[i]),cap=30;if(sp>cap){vx[i]*=cap/sp;vy[i]*=cap/sp;}
   x[i]+=vx[i]*alpha;y[i]+=vy[i]*alpha;
  }
  alpha*=.985;
 }
 function resize(){const r=host.getBoundingClientRect();dpr=Math.min(2,devicePixelRatio||1);W=Math.max(320,r.width);H=Math.max(360,r.height);canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';draw();}
 function fit(){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(let i=0;i<N;i++){if(!visible(i))continue;x0=Math.min(x0,x[i]-nodes[i].r);x1=Math.max(x1,x[i]+nodes[i].r);y0=Math.min(y0,y[i]-nodes[i].r);y1=Math.max(y1,y[i]+nodes[i].r);}if(!isFinite(x0))return;const k=Math.min(2.2,.9*Math.min(W/(x1-x0+60),H/(y1-y0+60)));view={k,tx:W/2-k*(x0+x1)/2,ty:H/2-k*(y0+y1)/2};}
 const sx=v=>v*view.k+view.tx,sy=v=>v*view.k+view.ty;
 const near=i=>{if(hover<0&&sel<0&&!hi)return true;if(hi)return hi.has(i);const f=hover>=0?hover:sel;if(i===f)return true;return adj[f].some(k=>edges[k].a===i||edges[k].b===i);};
 function draw(){
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  // 배경: 옅은 점 격자
  ctx.fillStyle='rgba(23,43,67,.06)';const step=28*Math.max(.6,Math.min(1.6,view.k));for(let gx=(view.tx%step+step)%step;gx<W;gx+=step)for(let gy=(view.ty%step+step)%step;gy<H;gy+=step)ctx.fillRect(gx,gy,1.2,1.2);
  const focus=hover>=0?hover:sel,dim=focus>=0||!!hi;
  // 무리 이름
  ctx.textAlign='center';ctx.textBaseline='middle';
  clusters.forEach((c,k)=>{if(hiddenClusters.has(k))return;let n=0,cx=0,cy=0,ymin=Infinity;nodes.forEach((d,i)=>{if(d.cluster===k){n++;cx+=x[i];cy+=y[i];ymin=Math.min(ymin,y[i]-d.r);}});if(!n)return;ctx.font='700 '+Math.round(Math.max(12,Math.min(20,15*view.k)))+'px Pretendard,"Noto Sans KR",sans-serif';ctx.fillStyle=c.color+(dim?'55':'cc');ctx.fillText(c.label,sx(cx/n),sy(ymin)-14);});
  // 연결선: 살짝 휜 곡선
  for(let k=0;k<edges.length;k++){
   const e=edges[k],a=e.a,b=e.b;if(!visible(a)||!visible(b))continue;
   const on=focus>=0?(a===focus||b===focus):hi?(hi.has(a)&&hi.has(b)):true;
   if(dim&&!on)continue;
   const x1=sx(x[a]),y1=sy(y[a]),x2=sx(x[b]),y2=sy(y[b]),mx=(x1+x2)/2,my=(y1+y2)/2,bend=.12;
   ctx.beginPath();ctx.moveTo(x1,y1);ctx.quadraticCurveTo(mx-(y2-y1)*bend,my+(x2-x1)*bend,x2,y2);
   const cross=nodes[a].cluster!==nodes[b].cluster;
   ctx.strokeStyle=on&&dim?(cross?'rgba(124,58,237,.75)':'rgba(37,99,235,.6)'):cross?'rgba(124,58,237,'+(0.16+.06*e.w)+')':'rgba(71,85,105,'+(0.09+.04*e.w)+')';
   ctx.lineWidth=(on&&dim?1.6:1)*Math.max(.6,Math.min(3,.5+e.w*.45))*Math.max(.7,Math.min(1.4,view.k));ctx.stroke();
  }
  // 묶음
  for(let i=0;i<N;i++){
   if(!visible(i))continue;const n=nodes[i],r=Math.max(2.5,n.r*view.k),X=sx(x[i]),Y=sy(y[i]);if(X<-r-40||X>W+r+40||Y<-r-40||Y>H+r+40)continue;
   const on=near(i);ctx.globalAlpha=dim&&!on?.16:1;
   ctx.beginPath();ctx.arc(X,Y,r+r*.45+2,0,Math.PI*2);ctx.fillStyle=n.color+'1f';ctx.fill();
   if(i===focus||(hi&&hi.has(i))){ctx.save();ctx.shadowColor=n.color;ctx.shadowBlur=18;}
   ctx.beginPath();ctx.arc(X,Y,r,0,Math.PI*2);ctx.fillStyle=n.color;ctx.fill();
   if(i===focus||(hi&&hi.has(i)))ctx.restore();
   ctx.lineWidth=i===sel?3:1.5;ctx.strokeStyle=i===sel?'#172B43':'rgba(255,255,255,.95)';ctx.stroke();
  }
  ctx.globalAlpha=1;
  // 이름표: 큰 묶음, 확대했을 때, 고른 것과 이웃
  ctx.font='600 12px Pretendard,"Noto Sans KR",sans-serif';ctx.lineJoin='round';
  const order=[...Array(N).keys()].filter(visible).sort((a,b)=>nodes[b].r-nodes[a].r),placed=[];
  for(let o=0;o<order.length;o++){
   const i=order[o],n=nodes[i],r=n.r*view.k,on=near(i),show=(dim?on:(r>9||o<28))||i===focus;if(!show)continue;
   const X=sx(x[i]),Y=sy(y[i])+Math.max(3,r)+10;if(X<0||X>W||Y<0||Y>H)continue;
   const t=n.label.length>16?n.label.slice(0,15)+'…':n.label,w=ctx.measureText(t).width;
   if(i!==focus&&placed.some(p=>Math.abs(p[0]-X)<(p[2]+w)/2+4&&Math.abs(p[1]-Y)<15))continue;placed.push([X,Y,w]);
   ctx.strokeStyle='rgba(255,255,255,.92)';ctx.lineWidth=4;ctx.strokeText(t,X,Y);ctx.fillStyle=i===focus?'#172B43':'#3f3e3a';ctx.fillText(t,X,Y);
  }
 }
 function loop(){if(disposed)return;if(alpha>.004){tick();if(!userMoved&&(!fitted||alpha>.2)){fit();fitted=alpha<.55;}}draw();raf=alpha>.004||drag?requestAnimationFrame(loop):0;}
 const kick=(a=.3)=>{alpha=Math.max(alpha,a);if(!raf)raf=requestAnimationFrame(loop);};
 for(let t=0;t<90;t++)tick();
 const ro=new ResizeObserver(()=>{resize();if(!userMoved)fit();draw();});ro.observe(host);resize();fit();kick(alpha);

 const pick=(cx,cy)=>{let best=-1,bd=Infinity;for(let i=0;i<N;i++){if(!visible(i))continue;const d=Math.hypot(sx(x[i])-cx,sy(y[i])-cy),r=Math.max(6,nodes[i].r*view.k)+3;if(d<r&&d<bd){bd=d;best=i;}}return best;};
 const pos=e=>{const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
 const pointers=new Map();let pinch=null;
 canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);const [cx,cy]=pos(e);pointers.set(e.pointerId,[cx,cy]);if(pointers.size===2){const [p,q]=[...pointers.values()];pinch={d:Math.hypot(p[0]-q[0],p[1]-q[1]),k:view.k,tx:view.tx,ty:view.ty,mx:(p[0]+q[0])/2,my:(p[1]+q[1])/2};drag=null;return;}const i=pick(cx,cy);moved=false;drag={node:i,cx,cy,tx:view.tx,ty:view.ty};if(i>=0){fixed[i]=1;}});
 canvas.addEventListener('pointermove',e=>{
  const [cx,cy]=pos(e);
  if(pointers.has(e.pointerId))pointers.set(e.pointerId,[cx,cy]);
  if(pinch&&pointers.size===2){userMoved=true;const [p,q]=[...pointers.values()],d=Math.hypot(p[0]-q[0],p[1]-q[1]),k=Math.max(.15,Math.min(8,pinch.k*d/pinch.d));view={k,tx:pinch.mx-(pinch.mx-pinch.tx)*k/pinch.k,ty:pinch.my-(pinch.my-pinch.ty)*k/pinch.k};draw();return;}
  if(drag){if(Math.hypot(cx-drag.cx,cy-drag.cy)>4)moved=true;if(drag.node>=0&&moved){x[drag.node]=(cx-view.tx)/view.k;y[drag.node]=(cy-view.ty)/view.k;kick(.25);}else if(moved){userMoved=true;view.tx=drag.tx+cx-drag.cx;view.ty=drag.ty+cy-drag.cy;draw();}return;}
  const i=pick(cx,cy);if(i!==hover){hover=i;canvas.style.cursor=i>=0?'pointer':'grab';draw();}
  if(i>=0){const n=nodes[i];tip.hidden=false;tip.innerHTML='<b></b><span></span>';tip.firstChild.textContent=n.label;tip.lastChild.textContent=n.sub;tip.style.left=Math.min(W-220,cx+14)+'px';tip.style.top=Math.max(4,cy-12)+'px';}else tip.hidden=true;
 });
 const end=e=>{pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;if(!drag)return;const d=drag;drag=null;if(d.node>=0){fixed[d.node]=0;}if(!moved&&d.node>=0){sel=d.node;onSelect(d.node);draw();}else if(!moved&&d.node<0&&sel>=0){sel=-1;onSelect(-1);draw();}};
 canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
 canvas.addEventListener('pointerleave',()=>{if(hover>=0){hover=-1;tip.hidden=true;draw();}});
 canvas.addEventListener('wheel',e=>{e.preventDefault();userMoved=true;const [cx,cy]=pos(e),k=Math.max(.15,Math.min(8,view.k*Math.exp(-e.deltaY*.0015)));view={k,tx:cx-(cx-view.tx)*k/view.k,ty:cy-(cy-view.ty)*k/view.k};draw();},{passive:false});

 return {
  dispose(){disposed=true;cancelAnimationFrame(raf);ro.disconnect();canvas.remove();tip.remove();},
  select(i,{center=true}={}){sel=i;if(center&&i>=0){userMoved=true;const k=Math.max(view.k,1.1);view={k,tx:W/2-x[i]*k,ty:H/2-y[i]*k};}draw();},
  highlight(set){hi=set&&set.size?set:null;draw();},
  toggleCluster(k){hiddenClusters.has(k)?hiddenClusters.delete(k):hiddenClusters.add(k);kick(.35);},
  hidden:()=>hiddenClusters,
  zoom(f){userMoved=true;const k=Math.max(.15,Math.min(8,view.k*f));view={k,tx:W/2-(W/2-view.tx)*k/view.k,ty:H/2-(H/2-view.ty)*k/view.k};draw();},
  fit(){userMoved=false;fit();draw();}
 };
}
