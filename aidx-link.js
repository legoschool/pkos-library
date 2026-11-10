// ai-dx(AI·디지털 전환 지도)로 보내기. 지도 상단 「기록장」으로 이 앱을 열면 연결이 켜진다.
// 「ai-dx에 임시저장」한 글은 공개되지 않고, 지도 화면에서 강사가 확인하고 승인해야 공개된다(ai-dx sql/dx_kirok.sql).
// 공개 키(publishable)는 브라우저에 있어도 되는 키다. 비밀번호는 이 탭을 닫을 때까지만 기억한다.

export const AIDX={site:'https://ai-dx-map.vercel.app',sb:'https://oawbzsdjkzucxlcyhgdr.supabase.co',key:'sb_publishable_ZgTRFJinUZSekn_Uzn1REg_s7wFF_xg'};
const LINK='pkos-aidx-link',SITE='pkos-aidx-site',PIN='pkos-aidx-pin';

// ai-dx data.js 의 D.zones 순서와 이름. 지도 칸을 바꾸면 여기도 고친다(지도 쪽 반영 창은 지도 칸 목록을 직접 읽는다)
export const AIDX_AREAS=[
 ['수업',[['mat','수업 자료'],['game','게임 코딩'],['basic','디지털 기초'],['sel','사회정서·인성'],['gym','체육관·놀이'],['club','창체·동아리']]],
 ['주제',[['grow','교사의 성장'],['grad','대학원'],['research','수업 연구교사 3년'],['meta','학생자치·메타버스'],['gdeal','G-DEAL'],['read','부기 · 독서와 문해력']]],
 ['사업',[['biz','사업과 지원단']]],
 ['강의·연수',[['teach','강의·연수']]],
 ['저서',[['book','저서']]],
 ['채널·공개 공간',[['blog','블로그'],['lego','레고학교'],['award','성과와 기록']]]
];
export const AIDX_KINDS=[['post','글'],['doc','자료'],['tool','도구'],['site','사이트']];

const ls={get:k=>{try{return localStorage.getItem(k);}catch{return null;}},set:(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v);}catch{}}};
const ss={get:k=>{try{return sessionStorage.getItem(k);}catch{return null;}},set:(k,v)=>{try{v==null?sessionStorage.removeItem(k):sessionStorage.setItem(k,v);}catch{}}};
// 지도 주소만 받는다. 내 컴퓨터 시험 주소(127.0.0.1, localhost)는 시험할 때 쓴다
export function okSite(value){try{const u=new URL(value);return u.origin===AIDX.site||(/^(127\.0\.0\.1|localhost)$/.test(u.hostname)&&/^https?:$/.test(u.protocol))?u.origin:'';}catch{return '';}}

// 지도에서 「기록장」으로 열면 주소 끝에 #aidx=<지도 주소> 가 붙는다. 앱이 주소를 다루기 전에 읽고 지운다
(function consumeLaunch(){
 try{
  const params=new URLSearchParams(location.hash.slice(1)),value=params.get('aidx');
  if(value===null)return;
  ls.set(LINK,'1');const site=okSite(value);if(site)ls.set(SITE,site);
  params.delete('aidx');const rest=params.toString();
  history.replaceState(null,'',location.pathname+location.search+(rest?'#'+rest:''));
 }catch{}
})();

export const aidxLinked=()=>ls.get(LINK)==='1';
export const aidxSite=()=>okSite(ls.get(SITE)||'')||AIDX.site;
export const aidxPin=()=>ss.get(PIN)||'';
export function unlinkAidx(){ls.set(LINK,null);ls.set(SITE,null);ss.set(PIN,null);}

async function rpc(fn,body){
 let r;
 try{r=await fetch(AIDX.sb+'/rest/v1/rpc/'+fn,{method:'POST',cache:'no-store',credentials:'omit',headers:{apikey:AIDX.key,Authorization:'Bearer '+AIDX.key,'Content-Type':'application/json'},body:JSON.stringify(body)});}
 catch{throw Error('인터넷 연결을 확인한 뒤 다시 보내 주세요.');}
 const j=await r.json().catch(()=>null);
 if(!r.ok)throw Error('ai-dx가 요청을 받지 못했어요. 잠시 뒤 다시 보내 주세요.');
 return j;
}
const ERR={pin:'비밀번호가 맞지 않아요. 여러 번 틀리면 5분 동안 잠겨요.',area:'올릴 칸을 다시 골라 주세요.',title:'카드 제목을 1~120자로 적어 주세요.',size:'글이 너무 길어요. 기록 수를 줄여 주세요.',full:'확인을 기다리는 글이 50개라 더 저장할 수 없어요. ai-dx에서 먼저 정리해 주세요.'};

// 임시저장한 글: 고른 기록 묶음(기록 id를 정렬해 붙인 것)마다 ai-dx 글 번호, 열쇠, 칸·제목, 지난 가림 결정을 이 브라우저에 둔다.
// 같은 기록을 다시 임시저장하면 새 글이 아니라 같은 글의 다음 판이 된다
const POSTS='pkos-aidx-posts';
export const postKey=ids=>[...ids].sort().join(',');
function posts(){try{const v=JSON.parse(ls.get(POSTS)||'{}');return v&&typeof v==='object'?v:{};}catch{return {};}}
export const getPost=key=>posts()[key]||null;
function putPost(key,value){const all=posts();if(value)all[key]=value;else delete all[key];ls.set(POSTS,JSON.stringify(all));}

// 상태(비밀번호 없이, 열쇠가 맞는 내 글만): review pending·changes·none, visible, rev, live_rev, review_note
export async function aidxStatus(post){
 if(!post?.id||!post?.token)return null;
 const r=await rpc('dx_kirok_status',{p_items:[{id:post.id,token:post.token}]});
 return r?.ok?r.items?.[0]||{missing:true}:null;
}
export function describeStatus(st){
 if(!st)return '';
 if(st.missing)return 'ai-dx에서 지운 글이에요. 다시 임시저장하면 새 글로 들어가요.';
 const live=st.live_rev?(st.visible?'지도에 '+st.live_rev+'판이 공개돼 있어요':'지도에서 내린 글이에요('+st.live_rev+'판)'):'';
 if(st.review==='changes')return '보완 요청을 받았어요. 고친 뒤 다시 임시저장해 주세요.'+(live?' '+live+'.':'');
 if(st.review==='pending')return (live?live+'. ':'')+'임시저장 '+st.rev+'판이 확인을 기다리고 있어요.';
 return live?live+'.':'임시저장 '+st.rev+'판';
}

// 임시저장. 처음이면 새 글(열쇠를 받아 둔다), 이미 있으면 다음 판. ai-dx에서 지운 글이면 새 글로 다시 저장한다.
// 성공하면 비밀번호를 이 탭에 기억하고, 지도 창이 이 앱을 열었다면 그 창에 알린다
export async function saveToAidx(key,{pin,area,kind,title,desc,html,markdown,records,privacy,decisions}){
 const before=getPost(key);
 const call=post=>rpc('dx_kirok_save',{p_pin:pin,p_id:post?.id||null,p_token:post?.token||null,p_area:area,p_kind:kind,p_title:title,p_desc:desc,p_html:html,p_markdown:markdown,p_records:records,p_privacy:privacy});
 let r=await call(before),renewed=false;
 if(!r?.ok&&r?.error==='missing'&&before){putPost(key,null);r=await call(null);renewed=true;}
 if(!r?.ok){if(r?.error==='pin')ss.set(PIN,null);throw Error(ERR[r?.error]||'임시저장하지 못했어요. 다시 시도해 주세요.');}
 ss.set(PIN,pin);
 const token=r.token||(renewed?null:before?.token);
 putPost(key,{id:r.id,token,rev:r.rev,area,kind,title,desc,decisions,savedAt:new Date().toISOString()});
 const site=aidxSite();
 try{if(window.opener&&!window.opener.closed)window.opener.postMessage({type:'pkos-kirok-sent',id:r.id,title,rev:r.rev},site);}catch{}
 return {id:r.id,rev:r.rev,renewed,first:!before||renewed,reviewUrl:site+'/?kirok='+encodeURIComponent(r.id)};
}
