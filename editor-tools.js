const commands=[
 ['h1','큰 제목','서식','# 제목\n','heading title 제목1'],
 ['h2','소제목','서식','## 소제목\n','heading 제목2'],
 ['h3','작은 제목','서식','### 작은 제목\n','heading 제목3'],
 ['bold','굵게','서식','**내용**','bold'],
 ['italic','기울임','서식','*내용*','italic'],
 ['strike','취소선','서식','~~내용~~','strike'],
 ['bullet','글머리 목록','서식','- 항목\n','bullet list'],
 ['number','번호 목록','서식','1. 항목\n','number list'],
 ['task','할 일','서식','- [ ] 할 일\n','todo check task 체크'],
 ['quote','인용','서식','> 인용문\n','quote'],
 ['table','표','서식','| 항목 | 내용 |\n| --- | --- |\n|  |  |\n','table'],
 ['code','코드','서식','~~~text\n코드\n~~~\n','code'],
 ['divider','구분선','서식','\n---\n','divider'],
 ['link','웹 링크','연결','[링크 이름](https://)\n','url link'],
 ['wiki','기록 링크','연결','[[기록 제목]]','wiki link'],
 ['callout','안내 상자','서식','> **기억할 것**\n> 내용을 적으세요.\n','callout'],
 ['toggle','접어 두기','서식','<details>\n<summary>더 읽기</summary>\n\n내용\n\n</details>\n','toggle'],
 ['date','오늘 날짜','서식',null,'date'],
 ['attach','파일 첨부','자료',null,'file attachment'],
 ['image','사진 파일','자료',null,'image picture'],
 ['audio','음성 파일','자료',null,'audio'],
 ['video','영상 파일','자료',null,'video'],
 ['camera','사진 촬영','직접 담기',null,'camera'],
 ['record','녹음','직접 담기',null,'record microphone'],
 ['dictate','음성 받아쓰기','직접 담기',null,'speech dictate 전사']
];
let api,menu,rows=[],picked=0,range=null,manual=false,composing=false;
const $=s=>document.querySelector(s);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function bindEditorTools(callbacks){
 api=callbacks;
 if(!menu){
  menu=document.createElement('div');menu.id='editor-command-menu';menu.className='command-menu';menu.role='listbox';menu.setAttribute('aria-label','기록에 넣기');menu.hidden=true;document.body.append(menu);
  menu.addEventListener('mousedown',e=>e.preventDefault());
  menu.addEventListener('click',e=>{const el=e.target.closest('[data-command-index]');if(el)execute(Number(el.dataset.commandIndex));});
  document.addEventListener('click',e=>{const tool=e.target.closest('[data-editor-tool]');if(tool){const body=$('#edit-body');if(!body)return;range={start:body.selectionStart,end:body.selectionEnd};if(tool.dataset.editorTool==='commands'){manual=true;show('');}else openCapture(tool.dataset.editorTool);return;}if(!menu.contains(e.target)&&e.target.id!=='edit-body')hide();});
  window.addEventListener('resize',position);
 }
 hide();const body=$('#edit-body');if(!body)return;
 body.setAttribute('aria-controls',menu.id);body.setAttribute('aria-autocomplete','list');body.setAttribute('aria-expanded','false');
 body.addEventListener('compositionstart',()=>{composing=true;hide();});
 body.addEventListener('compositionend',()=>{composing=false;update();});
 body.addEventListener('input',update);
 body.addEventListener('click',()=>{if(!manual)update();});
 body.addEventListener('keydown',e=>{
  if(menu.hidden||composing||e.isComposing||e.keyCode===229)return;
  if(['ArrowDown','ArrowUp','Enter','Escape'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();
   if(e.key==='Escape')hide();else if(e.key==='Enter'){if(rows.length)execute(picked);}else{picked=(picked+(e.key==='ArrowDown'?1:-1)+rows.length)%Math.max(1,rows.length);draw();}
  }
 });
}
function hide(){if(menu)menu.hidden=true;const body=$('#edit-body');body?.setAttribute('aria-expanded','false');body?.removeAttribute('aria-activedescendant');manual=false;}
function update(){
 if(composing)return;const body=$('#edit-body');if(!body)return hide();
 const before=body.value.slice(0,body.selectionStart),match=before.match(/(?:^|\n)[ \t]*\/([^\n/]{0,40})$/);
 if(!match)return hide();manual=false;range={start:body.selectionStart-match[1].length-1,end:body.selectionStart};show(match[1]);
}
function show(query){rows=commands.filter(c=>(c[1]+' '+c[4]).toLowerCase().includes(query.trim().toLowerCase()));picked=0;menu.hidden=false;draw();$('#edit-body')?.focus();}
function draw(){menu.innerHTML='<div class="command-heading">기록에 넣기 <small>↑ ↓ 선택 · Enter · Esc 닫기</small></div>'+(rows.length?rows.map((c,i)=>'<button type="button" tabindex="-1" role="option" aria-selected="'+(i===picked)+'" id="command-'+i+'" data-command-index="'+i+'"><span>'+escape(c[1])+'</span><small>'+c[2]+'</small></button>').join(''):'<p>일치하는 명령이 없습니다.</p>');const body=$('#edit-body');body?.setAttribute('aria-expanded','true');if(rows.length){body?.setAttribute('aria-activedescendant','command-'+picked);menu.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'});}position();}
function position(){if(!menu||menu.hidden)return;const body=$('#edit-body');if(!body)return hide();const r=body.getBoundingClientRect(),v=window.visualViewport;const width=v?.width||innerWidth,height=v?.height||innerHeight,top=v?.offsetTop||0;menu.style.width=Math.min(340,width-24)+'px';menu.style.maxHeight=Math.max(120,Math.min(330,height-100))+'px';menu.style.left=Math.max(12,Math.min(r.left,width-menu.offsetWidth-12))+'px';menu.style.top=Math.max(top+12,Math.min(r.top+42,top+height-menu.offsetHeight-12))+'px';}
async function execute(i){
 const c=rows[i],body=$('#edit-body');if(!c||!body)return;
 const location=range||{start:body.selectionStart,end:body.selectionEnd};hide();
 let value=c[3];if(c[0]==='date')value=new Date().toLocaleDateString('sv-SE');
 body.setRangeText(value||'',location.start,location.end,'end');body.dispatchEvent(new Event('input'));hide();body.focus();
 if(value!==null)return;
 if(['attach','image','audio','video'].includes(c[0]))api.attach({image:'image/*',audio:'audio/*',video:'video/*'}[c[0]]||'');
 else await openCapture(c[0]);
}
let capture=null;
function errorText(e){return {NotAllowedError:'권한이 거부되었습니다. 주소창의 카메라·마이크 권한을 확인해 주세요.',NotFoundError:'사용 가능한 카메라 또는 마이크를 찾지 못했습니다.',NotReadableError:'장치를 사용할 수 없습니다. 다른 앱에서 사용 중인지 확인해 주세요.',SecurityError:'이 브라우저에서는 장치 접근이 제한되어 있습니다.'}[e.name]||e.message||'작업을 완료하지 못했습니다.';}
async function openCapture(mode){
 hide();if(capture||!api.note())return;
 const owner=api.note(),previous=document.activeElement;
 const d=document.createElement('dialog');d.className='capture-dialog';d.setAttribute('aria-labelledby','capture-title');
 const heading={camera:'사진 촬영',record:'녹음',dictate:'음성 받아쓰기'}[mode];if(!heading)return;
 const speech=window.SpeechRecognition||window.webkitSpeechRecognition;
 d.innerHTML='<header><h2 id="capture-title">'+heading+'</h2><button type="button" data-capture="close" aria-label="닫기">닫기 ×</button></header><div class="dialog-body"><p class="capture-owner"></p><p class="capture-status" role="status">시작 버튼을 눌러 주세요.</p><video class="camera-live" autoplay muted playsinline hidden></video><img class="camera-result" alt="촬영한 사진" hidden><audio class="record-result" controls hidden></audio><div class="capture-controls"></div><div class="speech-controls" '+(mode==='camera'?'hidden':'')+'><label class="speech-consent"><input type="checkbox" id="speech-consent"> 음성 인식 서비스를 사용하겠습니다.</label><p class="hint">받아쓰기는 브라우저 제공업체의 서버로 음성이 전송될 수 있으며 인터넷이 필요할 수 있습니다. 녹음 파일은 별도 전송하지 않습니다.</p><button type="button" data-capture="speech">받아쓰기 시작</button><button type="button" data-capture="speech-stop" hidden>받아쓰기 중지</button><label>받아쓴 글 · 저장 전에 고칠 수 있어요<textarea class="transcript" rows="5" placeholder="말한 내용이 여기에 표시됩니다."></textarea></label><p class="speech-status" role="status"></p><p class="speech-interim" aria-live="polite"></p></div><p class="capture-hint hint">내용을 확인한 뒤 이 기록에 저장하세요.</p></div><footer><button type="button" data-capture="download" hidden>원본 내려받기</button><button type="button" class="primary" data-capture="save" disabled>이 기록에 저장</button></footer>';
 document.body.append(d);d.querySelector('.capture-owner').textContent='저장할 기록: '+(owner.title||'제목 없는 기록');d.showModal();capture=d;
 const find=s=>d.querySelector(s),status=t=>find('.capture-status').textContent=t;
 let stream=null,recorder=null,recognizer=null,blob=null,url=null,timer=null,started=0,elapsed=0,chunks=[],pending=false,speechPending=false,active=false,busy=false,closed=false,token=0,queue=Promise.resolve(),recoveryId=null;
 const speechStatus=t=>find('.speech-status').textContent=t;
 function refresh(){find('[data-capture="save"]').disabled=busy||pending||active||!!recognizer||speechPending||(!blob&&!find('.transcript').value.trim());find('[data-capture="download"]').hidden=!blob;find('[data-capture="speech"]').disabled=!speech||!!recognizer||speechPending;find('[data-capture="speech-stop"]').hidden=!recognizer&&!speechPending;}
 function stopTracks(){stream?.getTracks().forEach(t=>t.stop());stream=null;find('video').srcObject=null;}
 function setPreview(){
  if(url)URL.revokeObjectURL(url);url=blob?URL.createObjectURL(blob):null;
  const el=find(mode==='camera'?'.camera-result':'.record-result');if(url){el.src=url;el.hidden=false;}refresh();
 }
 function stopSpeech(){if(recognizer){try{recognizer.stop();}catch{} } }
 function persist(){
  if(mode==='camera'||(!chunks.length&&!find('.transcript').value.trim()))return;
  if(!recoveryId)recoveryId='capture-recovery-'+crypto.randomUUID();
  const record={id:recoveryId,ownerId:owner.id,title:owner.title,blob:chunks.length?new Blob(chunks,{type:recorder?.mimeType||blob?.type||'audio/webm'}):blob,text:find('.transcript').value,updated:new Date().toISOString()};
  queue=queue.then(()=>api.recoveryWrite(record)).catch(()=>{if(!closed)find('.capture-hint').textContent='임시 보관에 실패했습니다. 창을 닫기 전에 원본을 내려받거나 기록에 저장하세요.';});
 }
 function finishRecording(){
  if(recorder&&recorder.state!=='inactive'){status('녹음을 마무리하고 있습니다…');recorder.stop();}stopSpeech();
 }
 function cleanup(){closed=true;token++;clearInterval(timer);if(recognizer){recognizer.onend=recognizer.onerror=recognizer.onresult=null;try{recognizer.abort();}catch{}recognizer=null;}stopTracks();if(url)URL.revokeObjectURL(url);d.close();d.remove();capture=null;window.removeEventListener('beforeunload',warnUnload);document.removeEventListener('keydown',guardKeys,true);if(previous?.isConnected)previous.focus();}
 function warnUnload(e){if(active||blob||find('.transcript').value.trim()||busy){e.preventDefault();e.returnValue='';}}
 function guardKeys(e){if(!d.open)return;if((e.ctrlKey||e.metaKey)&&['k','s'].includes(e.key.toLowerCase())){e.preventDefault();e.stopImmediatePropagation();}}
 async function close(){
  if(busy)return;
  if(active||recognizer||speechPending){finishRecording();status('정지한 내용을 확인하고 저장하거나 닫아 주세요.');return;}
  if((blob||find('.transcript').value.trim())&&!confirm('이 기록에 넣지 않고 닫을까요? 녹음과 받아쓴 글의 임시 보관분은 다음에 다시 열 수 있습니다. 사진은 보관되지 않습니다.'))return;
  persist();await queue;cleanup();
 }
 window.addEventListener('beforeunload',warnUnload);document.addEventListener('keydown',guardKeys,true);
 d.addEventListener('cancel',e=>{e.preventDefault();void close();});
 const controls=find('.capture-controls');
 controls.innerHTML=mode==='camera'?'<button type="button" class="primary" data-capture="camera-start">카메라 켜기</button><button type="button" data-capture="shot" hidden>사진 찍기</button>':mode==='record'?'<button type="button" class="primary" data-capture="record-start">녹음 시작</button><button type="button" data-capture="pause" hidden>일시정지</button><button type="button" data-capture="stop" hidden>녹음 마치기</button><output class="record-clock">00:00</output>':'';
 if(!speech&&mode!=='camera'){speechStatus('이 브라우저는 받아쓰기를 지원하지 않습니다. 직접 입력하거나 음성 파일을 첨부할 수 있습니다.');find('[data-capture="speech"]').disabled=true;}
 if(mode==='record')find('.capture-hint').textContent='녹음은 이 창을 열어 둔 동안만 진행됩니다. 최대 15분 또는 약 18MB에서 자동으로 마칩니다. 임시 보관은 종료된 녹음 파일을 대신하지 않습니다.';
 let recoveryOptions=[];
 if(mode!=='camera'){
  try{recoveryOptions=await api.recoveryList();}catch{}
  if(closed)return;
  if(recoveryOptions.length){
   const recover=document.createElement('section');recover.className='capture-recovery';
   recover.innerHTML='<label>이전에 임시 보관한 녹음·받아쓰기<select class="recovery-select">'+recoveryOptions.map((r,i)=>'<option value="'+i+'">'+escape(r.title||'제목 없는 기록')+' · '+escape(r.updated?.slice(0,16)||'')+'</option>').join('')+'</select></label><button type="button" data-capture="recover">이 기록으로 불러오기</button><button type="button" data-capture="discard-recovery">선택한 임시 보관 삭제</button><p class="hint">중단된 녹음은 일부만 남거나 재생되지 않을 수 있습니다. 불러온 뒤 재생해서 확인하세요.</p>';
   find('.dialog-body').prepend(recover);
  }
 }
 async function cameraStart(){
  if(pending||busy)return;
  if(blob&&!confirm('현재 사진을 버리고 다시 촬영할까요?'))return;
  if(!navigator.mediaDevices?.getUserMedia)throw Error('이 브라우저에서는 카메라를 사용할 수 없습니다. 사진 파일을 첨부해 주세요.');
  pending=true;refresh();const version=++token;status('카메라 권한을 기다리고 있습니다…');
  try{const incoming=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1600}},audio:false});if(closed||version!==token){incoming.getTracks().forEach(t=>t.stop());return;}stopTracks();stream=incoming;const video=find('video');video.srcObject=stream;video.hidden=false;await video.play();blob=null;find('img').hidden=true;find('[data-capture="shot"]').hidden=false;find('[data-capture="camera-start"]').textContent='카메라 다시 켜기';status('화면을 확인하고 사진 찍기를 누르세요.');}catch(e){stopTracks();throw e;}finally{pending=false;if(!closed)refresh();}
 }
 async function shot(){
  if(busy||pending)return;const video=find('video');if(!video.videoWidth)throw Error('카메라 화면을 불러오는 중입니다. 잠시 후 다시 눌러 주세요.');
  busy=true;refresh();try{const canvas=document.createElement('canvas');const scale=Math.min(1,1920/video.videoWidth);canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);const photo=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));if(!photo)throw Error('사진을 만들지 못했습니다.');blob=photo;stopTracks();video.hidden=true;find('[data-capture="shot"]').hidden=true;setPreview();status('사진을 확인한 뒤 기록에 저장하세요.');}finally{busy=false;refresh();}
 }
 async function recordStart(){
  if(pending||active||busy)return;if(blob)throw Error('현재 녹음을 먼저 저장하거나 내려받고 닫아 주세요.');
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('이 브라우저는 녹음을 지원하지 않습니다. 음성 파일 첨부를 이용해 주세요.');
  pending=true;refresh();const version=++token;status('마이크 권한을 기다리고 있습니다…');
  try{const incoming=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});if(closed||version!==token){incoming.getTracks().forEach(t=>t.stop());return;}stream=incoming;const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);chunks=[];elapsed=0;started=Date.now();active=true;
   recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);persist();if(chunks.reduce((n,b)=>n+b.size,0)>=18*1024*1024)finishRecording();}};
   recorder.onerror=e=>{status('녹음 장치 오류: '+(e.error?.message||'저장된 부분을 확인하세요.'));finishRecording();};
   recorder.onstop=()=>{active=false;stopSpeech();clearInterval(timer);blob=new Blob(chunks,{type:recorder.mimeType});stopTracks();find('[data-capture="pause"]').hidden=true;find('[data-capture="stop"]').hidden=true;find('[data-capture="record-start"]').disabled=false;setPreview();persist();status(blob.size?'녹음을 마쳤습니다. 재생해서 확인한 뒤 저장하세요.':'녹음된 소리가 없습니다. 다시 시작해 주세요.');if(!blob.size)blob=null;refresh();};
   recorder.start(3000);find('[data-capture="record-start"]').disabled=true;find('[data-capture="pause"]').hidden=false;find('[data-capture="stop"]').hidden=false;status('녹음 중 · 마치기 버튼을 눌러 저장할 수 있습니다.');
   timer=setInterval(()=>{const seconds=Math.floor((elapsed+(recorder.state==='recording'?Date.now()-started:0))/1000);find('.record-clock').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');if(seconds>=900)finishRecording();},500);
  }catch(e){stopTracks();active=false;throw e;}finally{pending=false;if(!closed)refresh();}
 }
 function startSpeech(){
  if(!speech)throw Error('이 브라우저는 받아쓰기를 지원하지 않습니다.');
  if(!find('#speech-consent').checked)throw Error('음성 인식 서비스 사용 안내를 확인하고 체크해 주세요.');
  if(recognizer||speechPending)return;
  const r=new speech();recognizer=r;speechPending=true;r.lang='ko-KR';r.continuous=true;r.interimResults=true;let finals=new Set();
  r.onstart=()=>{speechPending=false;speechStatus('듣고 있습니다. 정확하지 않은 부분은 아래에서 고칠 수 있습니다.');refresh();};
  r.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const result=e.results[i];if(result.isFinal&&!finals.has(i)){finals.add(i);const t=find('.transcript');t.value+=(t.value&&!/\s$/.test(t.value)?' ':'')+result[0].transcript;persist();}else if(!result.isFinal)interim+=result[0].transcript;}find('.speech-interim').textContent=interim;refresh();};
  r.onerror=e=>speechStatus(({network:'음성 인식 서버에 연결하지 못했습니다. 인터넷 연결을 확인하거나 직접 입력해 주세요.','not-allowed':'음성 인식 권한이 거부되었습니다.','service-not-allowed':'브라우저에서 음성 인식 서비스 사용을 허용하지 않습니다.','no-speech':'말소리를 듣지 못했습니다. 다시 시작해 주세요.','audio-capture':'마이크를 사용할 수 없습니다.'})[e.error]||'받아쓰기가 중단되었습니다: '+e.error);
  r.onend=()=>{recognizer=null;speechPending=false;find('.speech-interim').textContent='';if(find('.speech-status').textContent.startsWith('듣고'))speechStatus('받아쓰기를 마쳤습니다. 내용을 확인하고 저장하세요.');persist();refresh();};
  try{r.start();speechStatus('음성 인식에 연결하고 있습니다…');}catch(e){recognizer=null;speechPending=false;throw e;}refresh();
 }
 async function save(){
  if(active||recognizer||pending||speechPending||busy)return;
  const text=find('.transcript').value.trim();if(!blob&&!text)return;
  busy=true;refresh();status('기록에 저장하고 있습니다…');
  try{
   const extension=mode==='camera'?'jpg':blob?.type.includes('mp4')?'m4a':blob?.type.includes('ogg')?'ogg':'webm';
   const name=(mode==='camera'?'사진-':'녹음-')+new Date().toISOString().replace(/[:.]/g,'-')+'.'+extension;
   await queue;
   await api.commit({ownerId:owner.id,file:blob?new File([blob],name,{type:blob.type}):null,text,recoveryId});
   cleanup();api.toast('기록에 저장했습니다. 첨부와 글은 백업에도 포함됩니다.');
  }catch(e){status('저장 실패: '+errorText(e));find('.capture-hint').textContent='내용은 이 창에 남아 있습니다. 다시 저장하거나 원본을 내려받으세요.';}finally{busy=false;if(!closed)refresh();}
 }
 d.addEventListener('click',async e=>{
  const action=e.target.closest('[data-capture]')?.dataset.capture;if(!action)return;
  try{
   if(action==='close')await close();
   else if(action==='camera-start')await cameraStart();
   else if(action==='shot')await shot();
   else if(action==='record-start')await recordStart();
   else if(action==='stop')finishRecording();
   else if(action==='pause'){if(recorder?.state==='recording'){elapsed+=Date.now()-started;recorder.pause();e.target.textContent='녹음 계속';}else if(recorder?.state==='paused'){started=Date.now();recorder.resume();e.target.textContent='일시정지';}}
   else if(action==='speech')startSpeech();
   else if(action==='speech-stop')stopSpeech();
   else if(action==='save')await save();
   else if(action==='download'&&blob)api.download(blob,(mode==='camera'?'사진.jpg':blob.type.includes('mp4')?'녹음.m4a':blob.type.includes('ogg')?'녹음.ogg':'녹음.webm'));
   else if(action==='recover'){
    if(active||recognizer||blob||find('.transcript').value)throw Error('현재 내용을 먼저 저장하거나 닫아 주세요.');
    const r=recoveryOptions[Number(find('.recovery-select').value)];if(!r)return;recoveryId=r.id;blob=r.blob;chunks=blob?[blob]:[];find('.transcript').value=r.text||'';setPreview();status('임시 보관 내용을 불러왔습니다. 현재 기록에 저장할지 확인해 주세요.');refresh();
   }else if(action==='discard-recovery'){
    const r=recoveryOptions[Number(find('.recovery-select').value)];if(r&&confirm('선택한 임시 보관 내용을 삭제할까요?')){await api.recoveryDelete(r.id);find('.capture-recovery').remove();}
   }
  }catch(error){status(errorText(error));if(!closed)refresh();}
 });
 find('.transcript').addEventListener('input',()=>{refresh();persist();});
 refresh();
}

