// Force layout for the connection map: linked records pull together, every record pushes the others away.
// Deterministic (no randomness) so the same records and edges always land in the same place.
const cache=new Map();
function start(n,dims){
 return Array.from({length:n},(_,i)=>{
  if(dims===3){const y=1-2*(i+.5)/n,r=Math.sqrt(Math.max(0,1-y*y)),a=i*2.399963;return [Math.cos(a)*r,y,Math.sin(a)*r];}
  const a=i*2.39996,r=Math.sqrt((i+.5)/n);return [Math.cos(a)*r,Math.sin(a)*r];
 });
}
const weightOf=score=>Math.min(1,.25+(Number(score)||0)/120);
// Above BH_MIN records the 2D push between every pair is approximated with a quadtree (Barnes-Hut): far-away groups act as one mass.
const BH_MIN=300,THETA2=.81,MAX_DEPTH=40;
function makeTree(n){const cap=n*8+64;return {cap,cx:new Float64Array(cap),cy:new Float64Array(cap),h:new Float64Array(cap),mass:new Float64Array(cap),sx:new Float64Array(cap),sy:new Float64Array(cap),child:new Int32Array(cap),body:new Int32Array(cap),stack:new Int32Array(cap)};}
function bhRepulsion(pos,disp,k2,t){
 const n=pos.length;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const p of pos){if(p[0]<minX)minX=p[0];if(p[0]>maxX)maxX=p[0];if(p[1]<minY)minY=p[1];if(p[1]>maxY)maxY=p[1];}
 let used=1;const init=(nd,cx,cy,h)=>{t.cx[nd]=cx;t.cy[nd]=cy;t.h[nd]=h;t.mass[nd]=0;t.sx[nd]=0;t.sy[nd]=0;t.child[nd]=-1;t.body[nd]=-1;};
 init(0,(minX+maxX)/2,(minY+maxY)/2,Math.max(maxX-minX,maxY-minY)/2+1e-6);
 for(let i=0;i<n;i++){
  const x=pos[i][0],y=pos[i][1];let nd=0,depth=0;
  for(;;){
   t.mass[nd]++;t.sx[nd]+=x;t.sy[nd]+=y;
   if(t.child[nd]===-1){
    if(t.body[nd]===-1&&t.mass[nd]===1){t.body[nd]=i;break;}
    if(t.body[nd]===-2||depth>=MAX_DEPTH||used+4>t.cap){t.body[nd]=-2;break;}
    const b=t.body[nd],h=t.h[nd]/2;t.child[nd]=used;
    for(let q=0;q<4;q++)init(used+q,t.cx[nd]+(q&1?h:-h),t.cy[nd]+(q&2?h:-h),h);
    used+=4;t.body[nd]=-1;
    const bq=(pos[b][0]>=t.cx[nd]?1:0)+(pos[b][1]>=t.cy[nd]?2:0),bc=t.child[nd]+bq;
    t.mass[bc]=1;t.sx[bc]=pos[b][0];t.sy[bc]=pos[b][1];t.body[bc]=b;
   }
   nd=t.child[nd]+(x>=t.cx[nd]?1:0)+(y>=t.cy[nd]?2:0);depth++;
  }
 }
 for(let i=0;i<n;i++){
  const x=pos[i][0],y=pos[i][1];let top=0;t.stack[top++]=0;
  while(top){
   const nd=t.stack[--top],m=t.mass[nd];if(!m)continue;
   const leaf=t.child[nd]===-1;if(leaf&&t.body[nd]===i)continue;
   let dx=x-t.sx[nd]/m,dy=y-t.sy[nd]/m,d2=dx*dx+dy*dy;
   if(leaf||4*t.h[nd]*t.h[nd]<THETA2*d2){
    if(d2<1e-9){if(leaf&&t.body[nd]>=0){dx=1e-3*(i-t.body[nd]);d2=1e-6;}else continue;}
    const f=m*k2/Math.max(d2,1e-6);disp[i][0]+=dx*f;disp[i][1]+=dy*f;
   }else{const c=t.child[nd];t.stack[top++]=c;t.stack[top++]=c+1;t.stack[top++]=c+2;t.stack[top++]=c+3;}
  }
 }
}
export function layoutGraph(ids,edges=[],{dims=2,iterations=260}={}){
 const n=ids.length;if(!n)return new Map();
 const key=dims+'|'+iterations+'|'+ids.join(',')+'|'+edges.map(e=>e.a+'>'+e.b+':'+Math.round(e.score||0)).join(',');
 if(cache.has(key))return cache.get(key);
 const index=new Map(ids.map((id,i)=>[id,i])),pos=start(n,dims),links=[];
 for(const e of edges){const a=index.get(e.a),b=index.get(e.b);if(a!==undefined&&b!==undefined&&a!==b)links.push([a,b,weightOf(e.score)]);}
 const k=dims===3?Math.cbrt(8/n):Math.sqrt(4/n),k2=k*k,gravity=.06,disp=pos.map(()=>new Float64Array(dims)),tree=dims===2&&n>BH_MIN?makeTree(n):null;
 for(let it=0;it<iterations;it++){
  const heat=.12*(1-it/iterations)+.002;
  for(const d of disp)d.fill(0);
  if(dims===2&&n>BH_MIN)bhRepulsion(pos,disp,k2,tree);
  else for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
   let dist2=0;const delta=[];for(let c=0;c<dims;c++){const v=pos[i][c]-pos[j][c];delta.push(v);dist2+=v*v;}
   if(dist2<1e-6){delta[0]=1e-3*(i-j);dist2=1e-6;}
   const f=k2/dist2;
   for(let c=0;c<dims;c++){disp[i][c]+=delta[c]*f;disp[j][c]-=delta[c]*f;}
  }
  for(const [a,b,w] of links){
   let dist2=0;const delta=[];for(let c=0;c<dims;c++){const v=pos[a][c]-pos[b][c];delta.push(v);dist2+=v*v;}
   const f=Math.sqrt(dist2)/k*w;
   for(let c=0;c<dims;c++){disp[a][c]-=delta[c]*f;disp[b][c]+=delta[c]*f;}
  }
  for(let i=0;i<n;i++){
   let len=0;for(let c=0;c<dims;c++){disp[i][c]-=pos[i][c]*gravity*n*k;len+=disp[i][c]**2;}
   len=Math.sqrt(len);if(!len)continue;
   const step=Math.min(len,heat)/len;for(let c=0;c<dims;c++)pos[i][c]+=disp[i][c]*step;
  }
 }
 const center=Array.from({length:dims},(_,c)=>pos.reduce((s,p)=>s+p[c],0)/n);
 for(const p of pos)for(let c=0;c<dims;c++)p[c]-=center[c];
 let out;
 if(dims===3){const r=Math.max(1e-9,...pos.map(p=>Math.hypot(...p)));out=new Map(ids.map((id,i)=>[id,{x:pos[i][0]/r,y:pos[i][1]/r,z:pos[i][2]/r}]));}
 else{const sx=Math.max(1e-9,...pos.map(p=>Math.abs(p[0]))),sy=Math.max(1e-9,...pos.map(p=>Math.abs(p[1])));out=new Map(ids.map((id,i)=>[id,{x:n===1?0:pos[i][0]/sx,y:n===1?0:pos[i][1]/sy}]));}
 if(cache.size>12)cache.delete(cache.keys().next().value);
 cache.set(key,out);return out;
}
// Records that hold clusters together: strongest connection total first (direct links weigh most), then the original order.
export function rankHubs(ids,edges){
 const weight=new Map(ids.map(id=>[id,0]));
 for(const e of edges){const w=Number.isFinite(e.score)?e.score:1;if(weight.has(e.a))weight.set(e.a,weight.get(e.a)+w);if(weight.has(e.b))weight.set(e.b,weight.get(e.b)+w);}
 return ids.map((id,i)=>[id,weight.get(id),i]).sort((a,b)=>b[1]-a[1]||a[2]-b[2]).map(x=>x[0]);
}
export const hubIds=(ids,edges,count)=>new Set(rankHubs(ids,edges).slice(0,count));
// Point size that fits the drawing area: full size on wide screens, smaller when many records share a phone screen.
export const pointScale=(width,height,count)=>Math.max(.5,Math.min(1,Math.sqrt(width*height/Math.max(1,count))/48));
// Push overlapping circles apart inside the drawing area. points: [{x,y,r}] are moved in place.
export function separate(points,{width,height,gap=2,margin=4,iterations=60}={}){
 const clamp=p=>{p.x=Math.max(p.r+margin,Math.min(width-p.r-margin,p.x));p.y=Math.max(p.r+margin,Math.min(height-p.r-margin,p.y));};
 points.forEach(clamp);
 for(let it=0;it<iterations;it++){
  let moved=false;
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
   const a=points[i],b=points[j],need=a.r+b.r+gap;let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
   if(d>=need)continue;
   if(d<1e-6){dx=(j-i)%2?1:-1;dy=((i+j)%3)-1;d=Math.hypot(dx,dy);}
   const push=(need-d)/2;a.x-=dx/d*push;a.y-=dy/d*push;b.x+=dx/d*push;b.y+=dy/d*push;moved=true;
  }
  points.forEach(clamp);if(!moved)break;
 }
 return points;
}
// Choose labels in priority order, skipping any whose text box would overlap a label already chosen.
export function pickLabels(items,max,{charWidth=11,height=16}={}){
 const boxes=[],chosen=new Set();
 for(const it of items){
  if(chosen.size>=max)break;
  const w=Math.max(2,[...it.text].length)*charWidth,box={l:it.x-w/2,r:it.x+w/2,t:it.y-height/2,b:it.y+height/2};
  if(boxes.some(o=>box.l<o.r+6&&box.r>o.l-6&&box.t<o.b+4&&box.b>o.t-4))continue;
  boxes.push(box);chosen.add(it.id);
 }
 return chosen;
}
