const KEY='pkos-appearance-v1';
export const DEFAULT_COLOR='#2563eb';
export const THEME_COLORS=[['파랑','#2563eb'],['초록','#238354'],['청록','#087f8c'],['주황','#c65d18'],['분홍','#c63868'],['보라','#7351b5'],['갈색','#865d42'],['회색','#475569']];
export const validColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():null;
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const hex=values=>'#'+values.map(n=>Math.round(n).toString(16).padStart(2,'0')).join('');
const blend=(a,b,weight)=>hex(rgb(a).map((n,i)=>n*(1-weight)+rgb(b)[i]*weight));
const luminance=color=>rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
export function themeTokens(color){
 color=validColor(color)||DEFAULT_COLOR;
 const selection=blend(color,'#ffffff',.84);
 let text=color;while(contrast(text,selection)<4.8)text=blend(text,'#000000',.08);
 const on=contrast(color,'#ffffff')>=contrast(color,'#000000')?'#ffffff':'#000000';
 return {'--accent':color,'--accent-hover':blend(color,on==='#ffffff'?'#000000':'#ffffff',.13),'--accent-text':text,'--on-accent':on,'--soft':blend(color,'#ffffff',.92),'--soft-hover':blend(color,'#ffffff',.84),'--accent-border':blend(color,'#ffffff',.66),'--accent-tint':blend(color,'#ffffff',.97),'--accent-muted':text,'--side':blend(color,'#ffffff',.97),'--selection':blend(color,'#ffffff',.84)};
}
let current=DEFAULT_COLOR;
const read=()=>{try{return validColor(JSON.parse(localStorage.getItem(KEY)||'null')?.color)||DEFAULT_COLOR;}catch{return DEFAULT_COLOR;}};
export function applyAppearance(color,{save=true}={}){
 const next=validColor(color);if(!next)return false;
 current=next;
 for(const [key,value]of Object.entries(themeTokens(next)))document.documentElement.style.setProperty(key,value);
 document.documentElement.dataset.themeColor=next;
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',next);
 let stored=true;if(save)try{localStorage.setItem(KEY,JSON.stringify({version:1,color:next}));}catch{stored=false;}
 window.dispatchEvent(new CustomEvent('pkos-appearance-change',{detail:{color:next,stored}}));
 return stored;
}
export function appearanceHTML(){
 return '<p class="dialog-lead">원하는 색을 고르면 화면에 바로 적용됩니다.</p><div class="theme-swatches" role="group" aria-label="테마색 선택">'+THEME_COLORS.map(([label,color])=>'<button type="button" class="theme-swatch" data-theme-color="'+color+'" aria-pressed="'+(color===current)+'" style="--swatch:'+color+';--swatch-ink:'+themeTokens(color)['--on-accent']+'"><span class="theme-color-dot" aria-hidden="true">'+(color===current?'✓':'')+'</span><span>'+label+'</span></button>').join('')+'</div><div class="theme-custom"><label for="theme-color-picker">직접 고르기</label><input id="theme-color-picker" type="color" value="'+current+'" aria-label="사용자 지정 테마색"><label class="sr-only" for="theme-color-hex">테마색 코드</label><input id="theme-color-hex" type="text" value="'+current.toUpperCase()+'" maxlength="7" spellcheck="false" autocomplete="off" placeholder="#2563EB" aria-describedby="theme-color-status"></div><p id="theme-color-status" class="hint" role="status">선택한 색은 이 브라우저에 기억합니다.</p><div class="theme-preview"><strong>선택한 테마</strong><span class="tag">기록 태그</span><span class="theme-preview-button">저장</span></div><button type="button" class="quiet small" data-appearance-reset>기본 파랑으로</button>';
}
export function bindAppearance(host){
 const picker=host.querySelector('#theme-color-picker'),input=host.querySelector('#theme-color-hex'),status=host.querySelector('#theme-color-status');
 const paint=()=>{host.querySelectorAll('[data-theme-color]').forEach(button=>{const selected=button.dataset.themeColor===current;button.setAttribute('aria-pressed',String(selected));button.querySelector('.theme-color-dot').textContent=selected?'✓':'';});picker.value=current;input.value=current.toUpperCase();input.removeAttribute('aria-invalid');};
 const choose=color=>{const stored=applyAppearance(color);paint();status.textContent=stored?'테마색을 저장했습니다. 다음에 열 때도 유지됩니다.':'화면에 적용했습니다. 브라우저 설정 때문에 색을 기억하지 못했습니다.';};
 host.querySelectorAll('[data-theme-color]').forEach(button=>button.onclick=()=>choose(button.dataset.themeColor));
 picker.oninput=()=>choose(picker.value);
 input.addEventListener('input',()=>{const color=validColor(input.value);if(color)choose(color);else{input.setAttribute('aria-invalid','true');status.textContent='#으로 시작하는 여섯 자리 색상 코드를 적어 주세요.';}});
 host.querySelector('[data-appearance-reset]').onclick=()=>choose(DEFAULT_COLOR);
 const sync=()=>{if(host.open)paint();};window.addEventListener('pkos-appearance-change',sync);
 host.addEventListener('close',()=>window.removeEventListener('pkos-appearance-change',sync),{once:true});
}
// Runs before the application draws; invalid or unavailable storage uses blue.
applyAppearance(read(),{save:false});
window.addEventListener('storage',event=>{if(event.key===KEY||event.key===null)applyAppearance(read(),{save:false});});
