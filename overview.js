import {esc} from './core.js';
import {KINDS,KIND_ORDER,SPECIALS,condEmpty} from './facets.js';
// 「서재 현황」 화면과 목록 위 조건 줄. 숫자와 칸은 모두 data-cond(JSON)를 달아 누르면 그 조건의 목록으로 간다.
const q=o=>esc(JSON.stringify(o));
const num=n=>Number(n||0).toLocaleString();
const HEAT_COLORS=['','#efecf8','#d9d2f0','#b6a9e2','#8a78c9','#5a479e'];
const level=(n,cuts)=>cuts.reduce((l,c)=>n>=c?l+1:l,0);
function cuts(values){
 const v=values.filter(Boolean).sort((a,b)=>a-b);
 if(!v.length)return [1,2,3,4,5];
 const at=p=>v[Math.min(v.length-1,Math.floor(v.length*p))];
 const c=[1,at(.35),at(.6),at(.8),at(.93)].map((x,i,a)=>Math.max(x,i?a[i-1]+1:1));
 return c;
}
function heat(rowsList,years,valueOf,condOf,labelOf,title){
 const all=[];for(const [k] of rowsList)for(const y of years)all.push(valueOf(k,y));
 const cs=cuts(all);
 const head=years.map(y=>`<th scope="col"><button type="button" data-cond="${q({y0:y,y1:y})}" aria-label="${y}년 기록 보기">${String(y).slice(2)}</button></th>`).join('');
 const body=rowsList.map(([k,total])=>`<tr><th scope="row"><button type="button" data-cond="${q(condOf(k))}">${esc(labelOf(k))}</button></th>${years.map(y=>{const n=valueOf(k,y),l=level(n,cs);return n?`<td><button type="button" class="heat-cell${l>=4?' dark':''}" style="background:${HEAT_COLORS[l]}" data-cond="${q({...condOf(k),y0:y,y1:y})}" title="${esc(labelOf(k))} · ${y}년 · ${num(n)}개">${num(n)}</button></td>`:'<td><span class="heat-cell"></span></td>';}).join('')}<td class="heat-sum">${num(total)}</td></tr>`).join('');
 return `<div class="heat-wrap" role="region" aria-label="${esc(title)}" tabindex="0"><table class="heat"><thead><tr><th></th>${head}<th class="heat-sum">합계</th></tr></thead><tbody>${body}</tbody></table></div><p class="heat-legend">${cs.map((c,i)=>`<i style="background:${HEAT_COLORS[i+1]}"></i>${num(c)}${i<4?'~':' 이상'}`).join(' ')}</p>`;
}
export function overviewHTML(st,index,{demo=false}={}){
 const L=t=>index.label[t]||t,years=st.years.slice(-15);
 const kinds=KIND_ORDER.filter(k=>st.byKind.get(k)).map(k=>`<button type="button" class="ov-kind kind-${k}" data-cond="${q({kinds:[k]})}"><b>${num(st.byKind.get(k))}</b><span>${KINDS[k]}</span></button>`).join('');
 const first=st.years[0],last=st.years.at(-1);
 const maxBy=new Map(KIND_ORDER.map(k=>[k,Math.max(1,...st.yearRows.map(y=>y.kinds.get(k)||0))]));
 const yearList=st.yearRows.slice().reverse().map(y=>`<li><button type="button" class="ov-year" data-cond="${q({y0:y.year,y1:y.year})}">${y.year}</button><div class="ov-bars">${KIND_ORDER.filter(k=>k!=='hub'&&st.byKind.get(k)).map(k=>{const n=y.kinds.get(k)||0;return `<span class="ov-bar kind-${k}"><i style="width:${n?Math.max(1,n/maxBy.get(k)*100).toFixed(1):0}%"></i><b>${num(n)}</b><small>${KINDS[k]}</small></span>`;}).join('')}</div><div class="ov-year-x">${y.themes.length?`<p><span class="ov-lab">많이 나온 주제</span>${y.themes.map(([t,n])=>`<button type="button" class="chip" data-cond="${q({themes:[t],y0:y.year,y1:y.year})}">${esc(L(t))} <small>${num(n)}</small></button>`).join('')}</p>`:''}${y.started.length?`<p><span class="ov-lab">처음 기록한 노트북</span>${y.started.map(g=>esc(g)).join(' · ')}</p>`:''}</div></li>`).join('');
 const themeRows=st.themes.map(([t,n])=>[t,n]);
 const themeHeat=themeRows.length?heat(themeRows,years,(t,y)=>st.themeYear.get(t+'|'+y)||0,t=>({themes:[t]}),L,'주제별 연도별 기록 수'):'<p class="muted">주제 규칙에 맞는 기록이 아직 없습니다.</p>';
 const areaHeat=heat(st.areas,years,(a,y)=>st.areaYear.get(a+'|'+y)||0,a=>({areas:[a]}),a=>a,'노트북별 연도별 기록 수');
 const pair=(p,rare)=>`<li><button type="button" class="ov-pair" data-cond="${q(rare?{themes:[p.a,p.b],themeMode:'or'}:{themes:[p.a,p.b]})}"><span>${esc(L(p.a))} + ${esc(L(p.b))}</span><small>${rare?`함께 ${num(p.n)}개 · 각각 ${num(p.na)}, ${num(p.nb)}개`:num(p.n)+'개'}</small></button></li>`;
 const special=Object.entries(SPECIALS).filter(([k])=>st.special[k]).map(([k,l])=>`<button type="button" class="chip" data-cond="${q({special:k})}">${esc(l)} <small>${num(st.special[k])}</small></button>`).join('');
 return `<section class="overview" aria-labelledby="ov-title"><header class="ov-head"><div><span class="eyebrow">어떤 자료가 얼마나 있는지</span><h1 id="ov-title">서재 현황</h1><p class="muted">기록 ${num(st.total)}개${first?` · ${first}~${last}년`:''} · 노트북 ${num(st.notebooks)}개 · 태그 ${num(st.tags)}개 · 주제 ${num(index.rules.length)}가지</p></div><div class="ov-head-actions"><button type="button" class="quiet" data-action="theme-rules">주제 규칙</button><button type="button" class="quiet" data-action="prereq">준비 조건</button></div></header>
<div class="ov-kinds">${kinds}</div>
<section class="ov-block"><h2>연도별 활동</h2><p class="hint">연도를 누르면 그해 기록을 봅니다. 막대는 출처마다 가장 많은 해를 기준으로 그렸습니다.${st.special.guess?` 연도를 파일 수정일로만 짐작한 기록 ${num(st.special.guess)}개는 표에서 뺐습니다.`:''}</p><ol class="ov-years">${yearList||'<li class="muted">연도가 있는 기록이 아직 없습니다.</li>'}</ol></section>
<section class="ov-block"><h2>주제와 연도</h2><p class="hint">주제는 제목·태그·노트북에 든 낱말로 자동으로 붙였습니다. 칸을 누르면 그 주제와 연도의 기록, 주제 이름을 누르면 그 주제의 기록 전체를 봅니다.</p>${themeHeat}</section>
<section class="ov-block"><h2>노트북과 연도</h2>${areaHeat}</section>
${st.pairs.common.length?`<section class="ov-block ov-two"><div><h2>자주 함께 나온 주제</h2><ul class="ov-pairs">${st.pairs.common.map(p=>pair(p,false)).join('')}</ul></div><div><h2>함께 나온 적이 드문 주제</h2><p class="hint">두 주제 모두 기록이 ${num(st.minEach)}개 이상인데 함께 붙은 기록은 1개 이하인 쌍입니다. 누르면 두 주제의 기록을 함께 봅니다.</p><ul class="ov-pairs">${st.pairs.rare.map(p=>pair(p,true)).join('')||'<li class="muted">없습니다.</li>'}</ul></div></section>`:''}
${st.formats.length?`<section class="ov-block"><h2>문서 형식</h2><p>${st.formats.map(([f,n])=>`<button type="button" class="chip" data-cond="${q({formats:[f]})}">${esc(f)} <small>${num(n)}</small></button>`).join('')}</p></section>`:''}
${special?`<section class="ov-block"><h2>정리할 거리</h2><p>${special}</p></section>`:''}
${demo?'<p class="hint">체험 서재의 가상 자료로 만든 현황입니다.</p>':''}</section>`;
}
// 목록 위 조건 줄: 걸린 조건(지우기 단추 달림), 조건 더하기 칸(숫자는 지금 목록에서 더했을 때 남는 수), 결과로 할 일
export function condBarHTML(cond,fc,index,{open=false,total=0,years=[]}={}){
 const L=t=>index.label[t]||t,c=cond||{},chips=[];
 for(const k of c.kinds||[])chips.push([`출처 ${KINDS[k]}`,{kinds:k}]);
 if(c.y0||c.y1)chips.push([c.y0&&c.y0===c.y1?c.y0+'년':`${c.y0||'처음'}~${c.y1||'끝'}년`,{years:1}]);
 for(const t of c.themes||[])chips.push([`주제 ${L(t)}`,{themes:t}]);
 for(const t of c.tags||[])chips.push([`# ${t}`,{tags:t}]);
 for(const f of c.formats||[])chips.push([`형식 ${f}`,{formats:f}]);
 for(const a of c.areas||[])chips.push([`노트북 ${a}`,{areas:a}]);
 if(c.special)chips.push([SPECIALS[c.special],{special:1}]);
 const on=(k,v)=>(c[k]||[]).includes(v);
 const chip=(k,v,label,n)=>`<button type="button" class="chip ${on(k,v)?'on':''}" data-cond-toggle="${esc(k+'\u0001'+v)}" aria-pressed="${on(k,v)}">${esc(label)} <small>${num(n)}</small></button>`;
 const mode=k=>`<span class="cond-mode" role="group" aria-label="여러 개를 골랐을 때"><button type="button" data-cond-mode="${k}:and" aria-pressed="${(c[k]||'and')==='and'}">그리고</button><button type="button" data-cond-mode="${k}:or" aria-pressed="${c[k]==='or'}">또는</button></span>`;
 const yearOpts=sel=>`<option value="">${sel==='y0'?'처음':'끝'}</option>`+years.map(y=>`<option ${c[sel]===y?'selected':''}>${y}</option>`).join('');
 const maxY=Math.max(1,...[...fc.years.values()]);
 return `<div class="cond-bar">${chips.length?`<div class="cond-on">${chips.map(([l,rm])=>`<button type="button" class="chip on" data-cond-remove="${q(rm)}" title="이 조건 빼기">${esc(l)} <span aria-hidden="true">×</span></button>`).join('')}<button type="button" class="link-button" data-action="cond-clear">조건 지우기</button></div>`:''}
<details class="cond-panel" ${open?'open':''}><summary>조건 더하기 <small>출처 · 연도 · 주제 · 태그 · 형식</small></summary>
<div class="cond-group"><h3>출처</h3><p>${KIND_ORDER.filter(k=>fc.kinds.get(k)||on('kinds',k)).map(k=>chip('kinds',k,KINDS[k],fc.kinds.get(k)||0)).join('')}</p></div>
<div class="cond-group"><h3>연도</h3><p class="cond-years"><label>처음<select data-cond-year="y0">${yearOpts('y0')}</select></label><label>끝<select data-cond-year="y1">${yearOpts('y1')}</select></label></p><div class="cond-hist">${[...fc.years.entries()].map(([y,n])=>`<button type="button" data-cond-set="${q({y0:y,y1:y})}" title="${y}년 ${num(n)}개"><i style="height:${Math.max(4,n/maxY*100).toFixed(0)}%"></i><small>${String(y).slice(2)}</small></button>`).join('')}</div></div>
${fc.themes.length||c.themes?.length?`<div class="cond-group"><h3>주제 ${mode('themeMode')}</h3><p>${fc.themes.map(([t,n])=>chip('themes',t,L(t),n)).join('')}${(c.themes||[]).filter(t=>!fc.themes.some(([x])=>x===t)).map(t=>chip('themes',t,L(t),0)).join('')}</p></div>`:''}
${fc.tags.length?`<div class="cond-group"><h3>태그 ${mode('tagMode')}</h3><p>${fc.tags.slice(0,40).map(([t,n])=>chip('tags',t,'# '+t,n)).join('')}</p></div>`:''}
${fc.formats.length>1?`<div class="cond-group"><h3>문서 형식</h3><p>${fc.formats.map(([f,n])=>chip('formats',f,f,n)).join('')}</p></div>`:''}
${fc.areas.length>1?`<div class="cond-group"><h3>노트북</h3><p>${fc.areas.slice(0,20).map(([a,n])=>chip('areas',a,a,n)).join('')}</p></div>`:''}
</details>
<div class="cond-actions"><button type="button" class="quiet" data-action="handoff" ${total?'':'disabled'}>AI에게 건네기</button><button type="button" class="quiet" data-action="random3" ${total>2?'':'disabled'}>무작위 세 개</button><button type="button" class="quiet" data-action="cond-map" ${total?'':'disabled'}>지도로 보기</button><button type="button" class="quiet" data-action="cond-save">조건 저장</button></div></div>`;
}
// 기록 읽기 화면의 속성 줄: 출처 · 연도 · 형식 · 주제(누르면 조건)
export function facetLineHTML(row,index){
 if(!row)return '';
 const bits=[`<button type="button" class="chip" data-cond="${q({kinds:[row.kind]})}">${KINDS[row.kind]}</button>`];
 if(row.year)bits.push(`<button type="button" class="chip" data-cond="${q({y0:row.year,y1:row.year})}">${row.year}년</button>`);
 else if(row.yearGuess)bits.push(`<span class="chip muted" title="파일 수정일로 짐작한 연도">${row.yearGuess}년(추정)</span>`);
 if(row.format)bits.push(`<button type="button" class="chip" data-cond="${q({formats:[row.format]})}">${esc(row.format)}</button>`);
 for(const t of row.themes)bits.push(`<button type="button" class="chip theme" data-cond="${q({themes:[t]})}">${esc(index.label[t]||t)}</button>`);
 return `<div class="facet-line" aria-label="자료 속성">${bits.join('')}</div>`;
}
// 조건을 걸고 기록을 고르지 않았을 때 목록 오른쪽: 찾은 기록이 어떤 출처·연도·주제·노트북으로 이루어졌는지. 누르면 지금 조건에 더해 좁힌다.
export function condSummaryHTML(rows,index,cond,{label=''}={}){
 const L=t=>index.label[t]||t,c=cond||{},n=rows.length,clear=condEmpty(c)?'':'<button type="button" class="quiet" data-action="cond-clear">조건 지우기</button>';
 const tally=get=>{const m=new Map();for(const r of rows)for(const v of get(r))m.set(v,(m.get(v)||0)+1);return [...m.entries()].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),'ko'));};
 const kinds=tally(r=>[r.kind]),years=tally(r=>r.year?[r.year]:[]).sort((a,b)=>a[0]-b[0]);
 const themes=tally(r=>r.themes).filter(([t])=>!(c.themes||[]).includes(t)),areas=tally(r=>r.area?[r.area]:[]).filter(([a])=>!(c.areas||[]).includes(a));
 // 찾은 기록 모두에 붙은 주제는 눌러도 좁혀지지 않으므로 따로 적는다.
 const narrow=themes.filter(([,v])=>v<n),whole=themes.filter(([,v])=>v===n);
 const guess=rows.filter(r=>!r.year&&r.yearGuess).length,maxY=Math.max(1,...years.map(([,v])=>v));
 const add=(k,v,text,cnt)=>`<button type="button" class="chip" data-cond-toggle="${esc(k+'\u0001'+v)}">${esc(text)} <small>${num(cnt)}</small></button>`;
 const kind=([k,v])=>kinds.length>1?`<button type="button" class="cs-kind kind-${k}" data-cond-toggle="${esc('kinds\u0001'+k)}" title="${KINDS[k]}만 보기"><b>${num(v)}</b><span>${KINDS[k]}</span></button>`:`<span class="cs-kind kind-${k}"><b>${num(v)}</b><span>${KINDS[k]}</span></span>`;
 const body=n?`<div class="cs-kinds">${kinds.map(kind).join('')}</div>
${years.length>1?`<div class="cs-block"><h2>연도</h2><div class="cond-hist cs-hist">${years.map(([y,v])=>`<button type="button" data-cond-set="${q({y0:y,y1:y})}" title="${y}년 ${num(v)}개"><i style="height:${Math.max(4,v/maxY*100).toFixed(0)}%"></i><small>${String(y).slice(2)}</small></button>`).join('')}</div>${guess?`<p class="hint">연도를 파일 수정일로만 짐작한 기록 ${num(guess)}개는 빼고 그렸습니다.</p>`:''}</div>`:''}
${narrow.length||whole.length?`<div class="cs-block"><h2>${(c.themes||[]).length?'함께 나온 주제':'많이 나온 주제'}</h2>${narrow.length?`<p class="hint">누르면 지금 조건에 더해 좁힙니다.</p><p>${narrow.slice(0,12).map(([t,v])=>add('themes',t,L(t),v)).join('')}</p>`:''}${whole.length?`<p class="hint">찾은 기록 모두에 붙은 주제: ${whole.map(([t])=>esc(L(t))).join(', ')}</p>`:''}</div>`:''}
${areas.length>1?`<div class="cs-block"><h2>노트북</h2><p>${areas.slice(0,10).map(([a,v])=>add('areas',a,a,v)).join('')}</p></div>`:''}
<div class="cs-actions"><button type="button" class="primary" data-action="handoff">AI에게 건네기</button><button type="button" class="quiet" data-action="random3" ${n>2?'':'disabled'}>무작위 세 개</button><button type="button" class="quiet" data-action="cond-map">지도로 보기</button><button type="button" class="quiet" data-action="cond-save">조건 저장</button>${clear}</div>
<p class="hint">목록에서 기록을 누르면 여기에서 읽습니다.</p>`:`<p class="muted">조건에 맞는 기록이 없습니다. 목록 위 조건에서 ×를 눌러 하나씩 빼 보세요.</p><div class="cs-actions">${clear}</div>`;
 return `<section class="cond-summary" aria-labelledby="cs-title"><span class="eyebrow">찾은 기록</span><h1 id="cs-title">${num(n)}개</h1>${label?`<p class="cs-label">${esc(label)}</p>`:''}${body}</section>`;
}
