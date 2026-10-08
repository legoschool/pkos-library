import {uiIcon} from './ui-icons.js';
const KEY='pkos-guide-v1',FOLDER_KEY='pkos-folder-guide-v1';
let initialized=false;
export function setupGuide({demo=false,folderMirror=null}={}) {
 if(initialized)return; initialized=true;
 const connection=()=>folderMirror?.connection?.()||{supported:false,connected:false,enabled:false};
 const guide=document.createElement('dialog');guide.className='pkos-guide';guide.setAttribute('aria-labelledby','guide-title');guide.setAttribute('aria-describedby','guide-description');
 guide.innerHTML='<div class="guide-spot" aria-hidden="true"></div><section class="guide-card"><div class="guide-top"><span class="guide-count"></span><button type="button" data-guide="close" aria-label="사용 안내 닫기">닫기 ×</button></div>'+uiIcon('brand').replace('class="','class="guide-emblem ')+'<h2 id="guide-title"></h2><p id="guide-description"></p><p class="hint" data-guide-folder-result role="status" aria-live="polite" hidden></p><button type="button" class="primary wide" data-guide="connect" hidden>저장할 로컬 폴더 선택</button><div class="guide-progress" aria-hidden="true"></div><a class="guide-manual" href="manual/" target="_blank" rel="noopener" hidden>화면 사진이 든 사용 설명서와 실습 열기</a><footer><button type="button" data-guide="prev">이전</button><button type="button" class="primary" data-guide="next">둘러보기</button></footer></section>';
 document.body.append(guide);
 const folderStep={folder:true,target:'.topbar [data-action="folder-mirror"]',title:'저장할 폴더를 한 번 연결하세요',text:'글과 녹음·첨부를 PC 폴더에도 자동으로 저장합니다. 내 드라이브 안의 폴더도 고를 수 있고, 구글 드라이브가 온라인 동기화를 맡습니다. 다음에 열 때도 이 폴더를 기억합니다.'};
 const baseSteps=[
  {title:'나의지식서재에 오신 것을 환영해요',text:'펼친 책은 나의 기록, 연결된 세 점은 생각 사이의 관계를 뜻합니다. 쓰고, 찾고, 연결하는 방법을 잠깐 살펴볼까요?'},
  {target:'.sidebar [data-action="new"]',title:'떠오른 생각부터 한 줄',text:'새 기록에서 제목과 내용을 적으세요. 편집 내용은 자동 저장되며, 저장 버튼도 사용할 수 있습니다. “브라우저에 저장됨”과 연결한 “로컬 폴더 저장됨” 표시를 확인해 주세요.'},
  {target:'.sidebar [data-action="search"]',title:'쌓아 둔 기록을 다시 꺼내기',text:'제목과 본문으로 기록을 찾습니다. 「서재 현황」에서 출처·연도·주제별로 몇 개가 있는지 보고, 숫자를 누르면 그 기록이 나옵니다. 조건을 겹쳐 고르고 「AI에게 건네기」로 복사할 수도 있어요.'},
  {target:'.sidebar [data-view="graph"]',title:'지식맵으로 생각 사이의 연결 보기',text:'제목·본문·태그 등을 기준으로 기록의 관계를 보여 줍니다. 기록이 쌓이면 연결 기준과 비중을 바꿔 살펴보세요.'},
  {target:'.top-actions [data-action="settings"]',title:'소중한 기록은 백업까지',text:'기록은 지금 사용하는 브라우저에 저장됩니다. 백업에서 “첨부를 포함한 백업 내보내기”로 사본을 보관하세요. 카드의 원본 열기·탐색기는 PC에 구글 드라이브 데스크톱이 있고 폴더가 「오프라인으로 사용」이어야 바로 열립니다(설정 › 준비 조건). 이 안내는 상단 “사용 안내”에서 다시 볼 수 있습니다.'}
 ];
 let steps=baseSteps,index=0,previousFocus=null,hadNav=false,frame=0,folderOnly=false,connecting=false,folderMessage='';
 const card=guide.querySelector('.guide-card'),spot=guide.querySelector('.guide-spot');
 function remember(key=KEY){try{localStorage.setItem(key,'done');}catch{}}
 function close(){if(connecting)return;if(!folderOnly)remember();if(!demo)remember(FOLDER_KEY);guide.close();document.body.classList.toggle('nav-open',hadNav);if(previousFocus?.isConnected)previousFocus.focus();}
 function position(){
  if(!guide.open)return;
  const step=steps[index];document.body.classList.toggle('nav-open',hadNav||!!(step.target?.startsWith('.sidebar')&&innerWidth<=1100));
  const target=step.target&&document.querySelector(step.target);let r=target?.getBoundingClientRect();
  if(r&&(r.width===0||r.height===0))r=null;
  if(r&&(r.top<8||r.bottom>innerHeight-8)){target.scrollIntoView({block:'center',behavior:'instant'});r=target.getBoundingClientRect();}
  spot.hidden=!r;guide.classList.toggle('guide-centered',!r);
  if(r){Object.assign(spot.style,{left:Math.max(4,r.left-5)+'px',top:Math.max(4,r.top-5)+'px',width:Math.min(r.width+10,innerWidth-8)+'px',height:r.height+10+'px'});}
  const w=Math.min(380,innerWidth-24);card.style.width=w+'px';const h=card.getBoundingClientRect().height;
  let x=(innerWidth-w)/2,y=(innerHeight-h)/2;
  if(r){x=Math.min(innerWidth-w-12,Math.max(12,r.left));y=r.bottom+18;if(y+h>innerHeight-12)y=r.top-h-18;if(y<12){y=Math.max(12,innerHeight-h-12);if(r.right+w+24<innerWidth){x=r.right+20;y=Math.min(Math.max(12,r.top),innerHeight-h-12);}}}
  card.style.left=Math.max(12,x)+'px';card.style.top=Math.max(12,y)+'px';
 }
 function show(){
  const s=steps[index],state=connection(),isFolder=!!s.folder;
  guide.querySelector('#guide-title').textContent=isFolder&&state.connected?'연결한 폴더를 기억합니다':s.title;
  guide.querySelector('#guide-description').textContent=isFolder&&state.connected?(state.enabled?'다음에 이 주소를 열면 연결한 폴더로 자동 저장을 이어갑니다. 브라우저에서 권한을 다시 요청하면 「지금 저장 · 다시 시도」로 허용해 주세요.':'연결한 폴더를 기억하고 있습니다. 직접 꺼 둔 자동 저장은 그대로 유지합니다. 다시 켜려면 「로컬 폴더 자동 저장」에서 켜 주세요.'):isFolder&&!state.supported?'이 브라우저에서는 폴더 자동 저장을 지원하지 않습니다. PC의 Chrome·Edge에서 연결하거나, 「설정 · 백업」에서 Markdown 묶음으로 내보낼 수 있습니다.':s.text;
  const result=guide.querySelector('[data-guide-folder-result]');result.hidden=!isFolder||!folderMessage;result.textContent=folderMessage;
  const connect=guide.querySelector('[data-guide="connect"]');connect.hidden=!isFolder||!state.supported||state.connected;connect.disabled=connecting;connect.textContent=connecting?'폴더에 저장하는 중…':'저장할 로컬 폴더 선택';
  guide.querySelector('.guide-count').textContent=folderOnly?'로컬 폴더 자동 저장':'서재 안내 · '+(index+1)+' / '+steps.length;
  guide.querySelector('.guide-emblem').hidden=index!==0||folderOnly;
  guide.querySelector('[data-guide="prev"]').hidden=index===0;
  guide.querySelector('.guide-manual').hidden=folderOnly||index!==steps.length-1;
  const next=guide.querySelector('[data-guide="next"]');next.textContent=isFolder&&!state.connected?'나중에 연결':folderOnly?'서재 시작하기':index===0?'둘러보기':index===steps.length-1?'서재 시작하기':'다음';next.classList.toggle('primary',!(isFolder&&!state.connected));
  guide.querySelectorAll('[data-guide="close"],[data-guide="prev"],[data-guide="next"]').forEach(button=>button.disabled=connecting);
  guide.querySelector('.guide-progress').hidden=folderOnly;guide.querySelector('.guide-progress').innerHTML=steps.map((_,i)=>'<i class="'+(i===index?'current':'')+'"></i>').join('');
  position();if(!connecting)(isFolder&&!connect.hidden?connect:next).focus();cancelAnimationFrame(frame);frame=requestAnimationFrame(position);
 }
 function open(onlyFolder=false){
  if(guide.open||connecting)return;
  previousFocus=document.activeElement;hadNav=document.body.classList.contains('nav-open');folderOnly=onlyFolder;folderMessage='';
  steps=folderOnly?[folderStep]:demo?baseSteps:[baseSteps[0],folderStep,...baseSteps.slice(1)];index=0;guide.classList.toggle('guide-folder-only',folderOnly);
  guide.showModal();show();if(folderOnly)remember(FOLDER_KEY);
 }
 async function connect(){
  if(connecting||!folderMirror?.connect||connection().connected)return;
  connecting=true;folderMessage='';show();
  try{
   const saved=await folderMirror.connect(),state=connection();
   folderMessage=saved?'글과 첨부를 폴더에 저장했습니다.':state.error||'폴더 선택을 취소했습니다. 나중에 상단의 「로컬 폴더 연결」에서 다시 연결할 수 있습니다.';
   if(state.connected)remember(FOLDER_KEY);
  }catch(e){folderMessage=e?.message||'폴더를 연결하지 못했습니다. 나중에 다시 연결할 수 있습니다.';}
  finally{connecting=false;show();}
 }
 guide.addEventListener('click',e=>{const action=e.target.closest('[data-guide]')?.dataset.guide;if(connecting)return;if(action==='close')close();if(action==='connect')void connect();if(action==='prev'){index=Math.max(0,index-1);show();}if(action==='next'){if(steps[index].folder&&!demo)remember(FOLDER_KEY);if(index===steps.length-1)close();else{index++;show();}}});
 guide.addEventListener('cancel',e=>{e.preventDefault();close();});
 document.addEventListener('keydown',e=>{if(!guide.open)return;e.stopImmediatePropagation();if(e.key==='Escape'){e.preventDefault();close();}else if((e.ctrlKey||e.metaKey)&&['k','s'].includes(e.key.toLowerCase()))e.preventDefault();else if(e.key==='Tab'){const buttons=[...guide.querySelectorAll('button,a[href]')].filter(b=>!b.hidden&&!b.disabled);const first=buttons[0],last=buttons.at(-1);if(!first){e.preventDefault();return;}if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}},true);
 document.addEventListener('click',e=>{if(e.target.closest('[data-guide-open]'))open();});
 const reposition=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(position);};window.addEventListener('resize',reposition);document.addEventListener('scroll',reposition,true);
 let seen=false,folderSeen=false;try{seen=localStorage.getItem(KEY)==='done';folderSeen=localStorage.getItem(FOLDER_KEY)==='done';}catch{}
 if(!demo&&!seen&&!connection().connected)open();
 else if(!demo&&!folderSeen&&folderMirror&&connection().supported&&!connection().connected)open(true);
}
