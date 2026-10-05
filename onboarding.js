const KEY='pkos-guide-v1';
let initialized=false;
export function setupGuide({demo=false}={}) {
 if(initialized)return; initialized=true;
 const guide=document.createElement('dialog');guide.className='pkos-guide';guide.setAttribute('aria-labelledby','guide-title');guide.setAttribute('aria-describedby','guide-description');
 guide.innerHTML='<div class="guide-spot" aria-hidden="true"></div><section class="guide-card"><div class="guide-top"><span class="guide-count"></span><button type="button" data-guide="close" aria-label="사용 안내 닫기">닫기 ×</button></div><img class="guide-emblem" src="icon.svg" alt="펼친 책 속에 지식이 연결된 PKOS 상징" width="64" height="64"><h2 id="guide-title"></h2><p id="guide-description"></p><div class="guide-progress" aria-hidden="true"></div><a class="guide-manual" href="manual/" target="_blank" rel="noopener" hidden>화면 사진이 든 사용 설명서와 실습 열기</a><footer><button type="button" data-guide="prev">이전</button><button type="button" class="primary" data-guide="next">둘러보기</button></footer></section>';
 document.body.append(guide);
 const steps=[
  {title:'나의지식서재에 오신 것을 환영해요',text:'펼친 책은 나의 기록, 연결된 세 점은 생각 사이의 관계를 뜻합니다. 쓰고, 찾고, 연결하는 방법을 잠깐 살펴볼까요?'},
  {target:'.sidebar [data-action="new"]',title:'떠오른 생각부터 한 줄',text:'새 기록에서 제목과 내용을 적으세요. 편집 내용은 자동 저장되며, 저장 버튼도 사용할 수 있습니다. “저장됨” 표시를 확인해 주세요.'},
  {target:'.sidebar [data-action="search"]',title:'쌓아 둔 기록을 다시 꺼내기',text:'제목과 본문으로 기록을 찾습니다. 「서재 현황」에서 출처·연도·주제별로 몇 개가 있는지 보고, 숫자를 누르면 그 기록이 나옵니다. 조건을 겹쳐 고르고 「AI에게 건네기」로 복사할 수도 있어요.'},
  {target:'.sidebar [data-view="graph"]',title:'지식맵으로 생각 사이의 연결 보기',text:'제목·본문·태그 등을 기준으로 기록의 관계를 보여 줍니다. 기록이 쌓이면 연결 기준과 비중을 바꿔 살펴보세요.'},
  {target:'.top-actions [data-action="settings"]',title:'소중한 기록은 백업까지',text:'기록은 지금 사용하는 브라우저에 저장됩니다. 백업에서 “첨부를 포함한 백업 내보내기”로 사본을 보관하세요. 카드의 원본 열기·탐색기는 PC에 구글 드라이브 데스크톱이 있고 폴더가 「오프라인으로 사용」이어야 바로 열립니다(설정 › 준비 조건). 이 안내는 상단 “사용 안내”에서 다시 볼 수 있습니다.'}
 ];
 let index=0,previousFocus=null,hadNav=false,frame=0;
 const card=guide.querySelector('.guide-card'),spot=guide.querySelector('.guide-spot');
 function remember(){try{localStorage.setItem(KEY,'done');}catch{}}
 function close(){remember();guide.close();document.body.classList.toggle('nav-open',hadNav);if(previousFocus?.isConnected)previousFocus.focus();}
 function position(){
  if(!guide.open)return;
  const step=steps[index];document.body.classList.toggle('nav-open',hadNav||!!(step.target?.startsWith('.sidebar')&&innerWidth<=1100));
  const target=step.target&&document.querySelector(step.target);let r=target?.getBoundingClientRect();
  if(r&&(r.top<8||r.bottom>innerHeight-8)){target.scrollIntoView({block:'center',behavior:'instant'});r=target.getBoundingClientRect();}
  spot.hidden=!r;guide.classList.toggle('guide-centered',!r);
  if(r){Object.assign(spot.style,{left:Math.max(4,r.left-5)+'px',top:Math.max(4,r.top-5)+'px',width:Math.min(r.width+10,innerWidth-8)+'px',height:r.height+10+'px'});}
  const w=Math.min(380,innerWidth-24);card.style.width=w+'px';const h=card.getBoundingClientRect().height;
  let x=(innerWidth-w)/2,y=(innerHeight-h)/2;
  if(r){x=Math.min(innerWidth-w-12,Math.max(12,r.left));y=r.bottom+18;if(y+h>innerHeight-12)y=r.top-h-18;if(y<12){y=Math.max(12,innerHeight-h-12);if(r.right+w+24<innerWidth){x=r.right+20;y=Math.min(Math.max(12,r.top),innerHeight-h-12);}}}
  card.style.left=Math.max(12,x)+'px';card.style.top=Math.max(12,y)+'px';
 }
 function show(){const s=steps[index];guide.querySelector('#guide-title').textContent=s.title;guide.querySelector('#guide-description').textContent=s.text;guide.querySelector('.guide-count').textContent='서재 안내 · '+(index+1)+' / '+steps.length;guide.querySelector('.guide-emblem').hidden=index!==0;guide.querySelector('[data-guide="prev"]').hidden=index===0;guide.querySelector('.guide-manual').hidden=index!==steps.length-1;const next=guide.querySelector('[data-guide="next"]');next.textContent=index===0?'둘러보기':index===steps.length-1?'서재 시작하기':'다음';guide.querySelector('.guide-progress').innerHTML=steps.map((_,i)=>'<i class="'+(i===index?'current':'')+'"></i>').join('');position();next.focus();cancelAnimationFrame(frame);frame=requestAnimationFrame(position);}
 function open(){if(guide.open)return;previousFocus=document.activeElement;hadNav=document.body.classList.contains('nav-open');index=0;guide.showModal();show();}
 guide.addEventListener('click',e=>{const action=e.target.closest('[data-guide]')?.dataset.guide;if(action==='close')close();if(action==='prev'){index=Math.max(0,index-1);show();}if(action==='next'){if(index===steps.length-1)close();else{index++;show();}}});
 guide.addEventListener('cancel',e=>{e.preventDefault();close();});
 document.addEventListener('keydown',e=>{if(!guide.open)return;e.stopImmediatePropagation();if(e.key==='Escape'){e.preventDefault();close();}else if((e.ctrlKey||e.metaKey)&&['k','s'].includes(e.key.toLowerCase()))e.preventDefault();else if(e.key==='Tab'){const buttons=[...guide.querySelectorAll('button,a[href]')].filter(b=>!b.hidden);const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}},true);
 document.addEventListener('click',e=>{if(e.target.closest('[data-guide-open]'))open();});
 const reposition=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(position);};window.addEventListener('resize',reposition);document.addEventListener('scroll',reposition,true);
 let seen=false;try{seen=localStorage.getItem(KEY)==='done';}catch{}if(!demo&&!seen)open();
}
