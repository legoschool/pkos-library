// Keep writing in the document's single scrolling surface, without rebuilding inputs.
let disposeCurrent=()=>{};

export function setupWritingLayout(){
 disposeCurrent();
 const textarea=document.querySelector('#edit-body');
 const surface=textarea?.closest('.document');
 const header=surface?.querySelector('.editor-header');
 if(!textarea||!surface){disposeCurrent=()=>{};return disposeCurrent;}
 let disposed=false,frame=0,inputPending=false,lastWidth=-1,lastHeaderHeight=-1;

 function fit(){
  frame=0;
  if(disposed||!textarea.isConnected)return;
  const headerHeight=header?Math.ceil(header.getBoundingClientRect().height):0;
  if(headerHeight!==lastHeaderHeight){
   lastHeaderHeight=headerHeight;
   surface.style.setProperty('--editor-header-height',headerHeight+'px');
  }
  const fromInput=inputPending;inputPending=false;
  if(textarea.hidden||!textarea.getClientRects().length)return;
  const width=textarea.getBoundingClientRect().width;
  if(!width)return;
  lastWidth=width;
  const scroll=surface.scrollTop;
  // The browser may briefly scroll the input to its caret before this frame.
  const caretScroll=fromInput&&document.activeElement===textarea?textarea.scrollTop:0;
  const style=getComputedStyle(textarea);
  const borders=(parseFloat(style.borderTopWidth)||0)+(parseFloat(style.borderBottomWidth)||0);
  textarea.style.height='auto';
  const height=textarea.scrollHeight+(style.boxSizing==='border-box'?borders:-(parseFloat(style.paddingTop)||0)-(parseFloat(style.paddingBottom)||0));
  textarea.style.height=Math.ceil(height)+'px';
  textarea.scrollTop=0;
  // Measuring a temporary smaller height can clamp the document's scroll position.
  surface.scrollTop=scroll+caretScroll;
 }
 function schedule(fromInput=false){
  if(disposed)return;
  inputPending=inputPending||fromInput;
  if(!frame)frame=requestAnimationFrame(fit);
 }
 const input=()=>schedule(true),resize=()=>schedule();
 textarea.addEventListener('input',input);
 window.addEventListener('resize',resize,{passive:true});

 const sizes=new ResizeObserver(entries=>{
  for(const entry of entries){
   if(entry.target===header){
    if(Math.ceil(header.getBoundingClientRect().height)!==lastHeaderHeight)schedule();
   }else if(entry.target===textarea&&textarea.getBoundingClientRect().width!==lastWidth)schedule();
  }
 });
 sizes.observe(textarea);if(header)sizes.observe(header);
 // Block mode changes hidden; reading-size and theme settings live on the root.
 const attributes=new MutationObserver(()=>schedule());
 attributes.observe(textarea,{attributes:true,attributeFilter:['hidden']});
 attributes.observe(document.documentElement,{attributes:true,attributeFilter:['style','class']});
 document.fonts?.addEventListener('loadingdone',resize);
 document.fonts?.ready.then(()=>{if(!disposed)schedule();});

 const dispose=()=>{
  if(disposed)return;disposed=true;
  if(frame)cancelAnimationFrame(frame);
  sizes.disconnect();attributes.disconnect();
  textarea.removeEventListener('input',input);
  window.removeEventListener('resize',resize);
  document.fonts?.removeEventListener('loadingdone',resize);
 };
 disposeCurrent=dispose;
 fit();
 return dispose;
}
