import {extractBodyLinks} from './body-links-model.js';

let disposeCurrent=()=>{},nextId=0;

// Link previews live beside the Markdown input, so typing never replaces its DOM.
export function setupBodyLinks({body=''}={}){
 disposeCurrent();
 const host=document.querySelector('#body-link-previews');
 if(!host){disposeCurrent=()=>{};return disposeCurrent;}
 const textarea=document.querySelector('#edit-body'),editorPage=textarea?.closest('.editor-page');
 const heading=document.createElement('h2');heading.textContent='본문 링크';
 const count=document.createElement('span');count.className='body-link-count';
 const header=document.createElement('header');header.append(heading,count);
 const list=document.createElement('div');list.className='body-link-list';
 host.replaceChildren(header,list);
 const cards=new Map();let timer=0,composing=false,disposed=false,previousBody;

 function closePreview(card){
  card.querySelector('.body-link-media')?.remove();
  const button=card.querySelector('[data-link-preview]');
  if(button){button.setAttribute('aria-expanded','false');button.textContent='영상 미리보기';}
 }
 function createCard(link){
  const card=document.createElement('article');card.className='body-link-card';card.dataset.url=link.url;
  const open=document.createElement('a');open.className='body-link-open';open.href=link.url;open.target='_blank';open.rel='noopener noreferrer';
  if(link.thumbnailUrl){
   const img=document.createElement('img');img.className='body-link-thumbnail';img.src=link.thumbnailUrl;img.alt='';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
   img.addEventListener('error',()=>{img.hidden=true;});open.append(img);
  }
  const info=document.createElement('span');info.className='body-link-info';
  const title=document.createElement('strong');title.className='body-link-title';
  const address=document.createElement('span');address.className='body-link-address';address.textContent=link.url;
  info.append(title,address);open.append(info);card.append(open);
  if(link.embedUrl){
   const button=document.createElement('button');button.type='button';button.className='quiet small body-link-preview';button.dataset.linkPreview='';button.textContent='영상 미리보기';
   button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','body-link-media-'+(++nextId));
   button.addEventListener('click',()=>{
    if(card.querySelector('iframe')){closePreview(card);return;}
    for(const other of cards.values())closePreview(other);
    const media=document.createElement('div');media.id=button.getAttribute('aria-controls');media.className='body-link-media';
    const frame=document.createElement('iframe');frame.src=link.embedUrl;frame.title=title.textContent+' 미리보기';frame.referrerPolicy='strict-origin-when-cross-origin';
    frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation');frame.allow='fullscreen; picture-in-picture; encrypted-media';frame.allowFullscreen=true;
    media.append(frame);card.append(media);button.setAttribute('aria-expanded','true');button.textContent='미리보기 닫기';
   });card.append(button);
  }
  return card;
 }
 function update(){
  clearTimeout(timer);timer=0;if(disposed||!host.isConnected||composing)return;
  const markdown=textarea?textarea.value:body;
  if(markdown===previousBody)return;previousBody=markdown;
  const links=extractBodyLinks(markdown),keep=new Set(links.map(link=>link.url));
  for(const [url,card]of cards)if(!keep.has(url)){card.remove();cards.delete(url);}
  links.forEach((link,index)=>{
   let card=cards.get(link.url);if(!card){card=createCard(link);cards.set(link.url,card);}
   const title=card.querySelector('.body-link-title');if(title.textContent!==link.title)title.textContent=link.title;
   // Moving an existing iframe reloads it; leave unchanged cards in place.
   if(list.children[index]!==card)list.insertBefore(card,list.children[index]||null);
  });
  const changedVisibility=host.hidden===!!links.length;
  count.textContent=links.length+'개';host.hidden=!links.length;
  editorPage?.classList.toggle('has-body-links',!!links.length);
  if(changedVisibility)textarea?.dispatchEvent(new Event('bodylinkschange'));
 }
 const input=e=>{if(composing||e?.isComposing)return;clearTimeout(timer);timer=setTimeout(update,180);};
 const start=()=>{composing=true;clearTimeout(timer);};
 const end=()=>{composing=false;input();};
 textarea?.addEventListener('input',input);textarea?.addEventListener('compositionstart',start);textarea?.addEventListener('compositionend',end);
 const dispose=()=>{disposed=true;clearTimeout(timer);textarea?.removeEventListener('input',input);textarea?.removeEventListener('compositionstart',start);textarea?.removeEventListener('compositionend',end);};
 disposeCurrent=dispose;update();return dispose;
}
