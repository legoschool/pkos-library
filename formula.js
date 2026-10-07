// Parse a small expression language. No eval, Function, property access, or JS execution.
const cache=new Map();
const number=v=>{const n=Number(v);if(!Number.isFinite(n))throw Error('숫자로 계산할 수 없습니다.');return n;};
const text=v=>v==null?'':Array.isArray(v)?v.map(text).join(', '):String(v);
const array=v=>Array.isArray(v)?v:v===''||v==null?[]:[v];
const date=v=>{const d=new Date(v);if(!Number.isFinite(d.getTime()))throw Error('올바른 날짜가 아닙니다.');return d;};
const iso=v=>date(v).toISOString().slice(0,10);
const empty=v=>v==null||v===''||Array.isArray(v)&&!v.length;
const reserved=new Set(['__proto__','prototype','constructor']);
export function parseFormula(source){
 source=String(source||'');if(source.length>16000)throw Error('수식이 너무 깁니다.');
 if(cache.has(source))return cache.get(source);
 const tokens=[];let i=0;
 while(i<source.length){
  const ch=source[i];if(/\s/.test(ch)){i++;continue;}
  if(ch==='"'||ch==="'"){let value='',closed=false;i++;while(i<source.length){let c=source[i++];if(c===ch){closed=true;break;}if(c==='\\'){c=source[i++];value+=({n:'\n',r:'\r',t:'\t'})[c]??c;}else value+=c;}if(!closed)throw Error('문자열의 따옴표를 닫아 주세요.');tokens.push({type:'literal',value});continue;}
  if(ch==='['){const end=source.indexOf(']',i+1);if(end<0)throw Error('속성 이름의 ]를 닫아 주세요.');tokens.push({type:'property',value:source.slice(i+1,end)});i=end+1;continue;}
  const num=source.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);if(num){tokens.push({type:'literal',value:number(num[0])});i+=num[0].length;continue;}
  const name=source.slice(i).match(/^[A-Za-z_][A-Za-z_0-9]*/);if(name){tokens.push({type:'name',value:name[0]});i+=name[0].length;continue;}
  const op=source.slice(i).match(/^(?:==|!=|>=|<=|&&|\|\||[()+\-*/%^<>,!?:.])/);if(!op)throw Error('수식에서 사용할 수 없는 문자: '+ch);tokens.push({type:'op',value:op[0]});i+=op[0].length;
 }
 if(tokens.length>4000)throw Error('수식이 너무 복잡합니다.');let cursor=0,depth=0;
 const peek=()=>tokens[cursor]?.value,take=value=>{if(peek()!==value)throw Error(value+' 기호를 확인하세요.');cursor++;};
 const precedence={'or':1,'||':1,'and':2,'&&':2,'==':3,'!=':3,'>':4,'<':4,'>=':4,'<=':4,'+':5,'-':5,'*':6,'/':6,'%':6,'^':7};
 function expression(min=0){if(++depth>60)throw Error('수식의 중첩이 너무 깊습니다.');let left;const t=tokens[cursor++];if(!t)throw Error('수식이 비어 있거나 불완전합니다.');
  if(['-','+','!','not'].includes(t.value)&&t.type!=='literal')left={type:'unary',op:t.value,value:expression(8)};
  else if(t.value==='('&&t.type==='op'){left=expression();take(')');}
  else if(t.type==='literal'||t.type==='property')left=t;
  else if(t.type==='name'){if(peek()==='(')left=call(t.value);else left=t.value==='true'||t.value==='false'?{type:'literal',value:t.value==='true'}:{type:'variable',value:t.value};}
  else throw Error('수식의 값이나 함수를 확인하세요.');
  while(peek()==='.'){cursor++;const method=tokens[cursor++];if(method?.type!=='name')throw Error('함수 이름을 확인하세요.');left=call(method.value,[left]);}
  while(precedence[peek()]!==undefined&&precedence[peek()]>=min){const op=tokens[cursor++].value,p=precedence[op];left={type:'binary',op,left,right:expression(p+(op==='^'?0:1))};}
  if(min===0&&peek()==='?'){cursor++;const yes=expression();take(':');left={type:'call',name:'if',args:[left,yes,expression()]};}depth--;return left;
 }
 function call(name,args=[]){if(reserved.has(name))throw Error('사용할 수 없는 함수');take('(');if(peek()!==')'){do{args.push(expression());if(peek()!==',')break;cursor++;}while(true);}take(')');return {type:'call',name,args};}
 const ast=expression();if(cursor!==tokens.length)throw Error('수식 뒤에 잘못된 기호가 있습니다.');if(cache.size>=300)cache.delete(cache.keys().next().value);cache.set(source,ast);return ast;
}
const fns={
 abs:x=>Math.abs(number(x)),ceil:x=>Math.ceil(number(x)),floor:x=>Math.floor(number(x)),sqrt:x=>Math.sqrt(number(x)),sign:x=>Math.sign(number(x)),
 round:(x,d=0)=>{const power=10**Math.max(-12,Math.min(12,number(d)));return Math.round((number(x)+Number.EPSILON)*power)/power;},pow:(x,y)=>number(x)**number(y),mod:(x,y)=>number(x)%number(y),
 min:(...x)=>Math.min(...x.flat().map(number)),max:(...x)=>Math.max(...x.flat().map(number)),sum:(...x)=>x.flat().reduce((n,v)=>n+number(v),0),mean:(...x)=>{const v=x.flat().map(number);return v.length?v.reduce((n,v)=>n+v,0)/v.length:0;},
 empty,length:x=>Array.isArray(x)?x.length:text(x).length,format:text,toNumber:number,toBoolean:x=>!!x,
 contains:(x,y)=>Array.isArray(x)?x.includes(y):text(x).includes(text(y)),startsWith:(x,y)=>text(x).startsWith(text(y)),endsWith:(x,y)=>text(x).endsWith(text(y)),
 lower:x=>text(x).toLocaleLowerCase(),upper:x=>text(x).toLocaleUpperCase(),trim:x=>text(x).trim(),concat:(...x)=>x.some(Array.isArray)?x.flat():x.map(text).join(''),
 replace:(x,a,b)=>text(x).replace(text(a),text(b)),replaceAll:(x,a,b)=>text(x).split(text(a)).join(text(b)),substring:(x,a,b)=>text(x).slice(number(a),b===undefined?undefined:number(b)),
 split:(x,separator)=>text(x).split(text(separator)),join:(x,separator=', ')=>array(x).map(text).join(text(separator)),
 list:(...v)=>v,unique:x=>[...new Set(array(x))],first:x=>array(x)[0]??'',last:x=>array(x).at(-1)??'',at:(x,i)=>array(x).at(number(i))??'',
 slice:(x,a,b)=>array(x).slice(number(a),b===undefined?undefined:number(b)),reverse:x=>array(x).slice().reverse(),sort:x=>array(x).slice().sort((a,b)=>typeof a==='number'&&typeof b==='number'?a-b:text(a).localeCompare(text(b))),
 count:x=>array(x).length,includes:(x,y)=>array(x).includes(y),not:x=>!x,and:(...x)=>x.every(Boolean),or:(...x)=>x.some(Boolean),
 now:()=>new Date().toISOString(),today:()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');},
 parseDate:iso,date:x=>date(x).getUTCDate(),day:x=>date(x).getUTCDay()||7,month:x=>date(x).getUTCMonth()+1,year:x=>date(x).getUTCFullYear(),hour:x=>date(x).getUTCHours(),minute:x=>date(x).getUTCMinutes(),
 timestamp:x=>date(x).getTime(),fromTimestamp:x=>new Date(number(x)).toISOString(),dateStart:x=>text(x),dateEnd:x=>text(x),
 dateAdd:(x,amount,unit)=>{const d=date(x),n=number(amount),u=text(unit).replace(/s$/,'');if(u==='year'||u==='month'){const day=d.getUTCDate();d.setUTCDate(1);if(u==='year')d.setUTCFullYear(d.getUTCFullYear()+n);else d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));}else{const factor={week:604800000,day:86400000,hour:3600000,minute:60000,second:1000}[u];if(!factor)throw Error('날짜 단위: years, months, weeks, days, hours, minutes, seconds');d.setTime(d.getTime()+n*factor);}return text(x).length===10?d.toISOString().slice(0,10):d.toISOString();},
 dateBetween:(a,b,unit)=>{const x=date(a),y=date(b),u=text(unit).replace(/s$/,'');if(u==='year')return x.getUTCFullYear()-y.getUTCFullYear();if(u==='month')return (x.getUTCFullYear()-y.getUTCFullYear())*12+x.getUTCMonth()-y.getUTCMonth();const factor={week:604800000,day:86400000,hour:3600000,minute:60000,second:1000}[u];if(!factor)throw Error('날짜 단위를 확인하세요.');return Math.trunc((x-y)/factor);},
 formatDate:(value,pattern='YYYY-MM-DD')=>{const d=date(value),pad=n=>String(n).padStart(2,'0'),v={YYYY:d.getUTCFullYear(),MM:pad(d.getUTCMonth()+1),DD:pad(d.getUTCDate()),HH:pad(d.getUTCHours()),mm:pad(d.getUTCMinutes()),ss:pad(d.getUTCSeconds())};return text(pattern).replace(/YYYY|MM|DD|HH|mm|ss/g,t=>v[t]);}
};
fns.average=fns.mean;fns.dateSubtract=(x,n,unit)=>fns.dateAdd(x,-number(n),unit);
export const formulaFunctions=Object.freeze(['prop','if','ifs','let','lets','map','filter','some','every','find','findIndex',...Object.keys(fns)].sort());
export function renameFormulaProperty(source,oldName,newName){
 let changed=false;function emit(node){if(node.type==='literal')return JSON.stringify(node.value);if(node.type==='property'){const name=node.value===oldName?(changed=true,newName):node.value;return 'prop('+JSON.stringify(name)+')';}if(node.type==='variable')return node.value;if(node.type==='unary')return '('+node.op+' '+emit(node.value)+')';if(node.type==='binary')return '('+emit(node.left)+' '+node.op+' '+emit(node.right)+')';if(node.type==='call'){const args=node.args.map((a,i)=>node.name==='prop'&&i===0&&a.type==='literal'&&a.value===oldName?(changed=true,JSON.stringify(newName)):emit(a));return node.name+'('+args.join(', ')+')';}throw Error('수식 형식');}try{const next=emit(parseFormula(source));return changed?next:source;}catch{return source;}
}
export function evaluateFormula(source,getProperty,variables={}){
 const ast=typeof source==='string'?parseFormula(source):source;let steps=0;
 function evaluate(node,scope){if(++steps>30000)throw Error('수식 계산량이 너무 많습니다.');let result;
  if(node.type==='literal')result=node.value;
  else if(node.type==='property')result=getProperty(node.value);
  else if(node.type==='variable'){if(!Object.hasOwn(scope,node.value)||reserved.has(node.value))throw Error('알 수 없는 변수: '+node.value);result=scope[node.value];}
  else if(node.type==='unary'){const v=evaluate(node.value,scope);result=node.op==='-'?-number(v):node.op==='+'?number(v):!v;}
  else if(node.type==='binary'){const a=evaluate(node.left,scope);if(node.op==='and'||node.op==='&&')return !!a&&!!evaluate(node.right,scope);if(node.op==='or'||node.op==='||')return !!a||!!evaluate(node.right,scope);const b=evaluate(node.right,scope);switch(node.op){case '+':result=typeof a==='string'||typeof b==='string'?text(a)+text(b):number(a)+number(b);break;case '-':result=number(a)-number(b);break;case '*':result=number(a)*number(b);break;case '/':result=number(a)/number(b);break;case '%':result=number(a)%number(b);break;case '^':result=number(a)**number(b);break;case '==':result=JSON.stringify(a)===JSON.stringify(b);break;case '!=':result=JSON.stringify(a)!==JSON.stringify(b);break;case '>':result=a>b;break;case '>=':result=a>=b;break;case '<':result=a<b;break;case '<=':result=a<=b;break;}}
  else if(node.type==='call'){
   const {name,args}=node,ev=a=>evaluate(a,scope);
   if(name==='if'){if(args.length!==3)throw Error('if(조건, 참일 때, 거짓일 때)');result=ev(args[0])?ev(args[1]):ev(args[2]);}
   else if(name==='ifs'){let found=false;for(let i=0;i+1<args.length;i+=2)if(ev(args[i])){result=ev(args[i+1]);found=true;break;}if(!found)result=args.length%2?ev(args.at(-1)):'';}
   else if(name==='prop'){if(args.length!==1)throw Error('prop("속성 이름")');result=getProperty(text(ev(args[0])));}
   else if(name==='let'||name==='lets'){if(args.length<3||args.length%2!==1)throw Error('let(변수, 값, 결과)');const local={...scope};for(let i=0;i<args.length-1;i+=2){const key=args[i].type==='variable'?args[i].value:text(evaluate(args[i],local));if(!/^[A-Za-z_][\w]*$/.test(key)||reserved.has(key))throw Error('변수 이름을 확인하세요.');local[key]=evaluate(args[i+1],local);}result=evaluate(args.at(-1),local);}
   else if(['map','filter','some','every','find','findIndex'].includes(name)){if(args.length!==2)throw Error(name+'(목록, current를 사용한 식)');const list=array(ev(args[0])),callback=(current,index)=>evaluate(args[1],{...scope,current,index});result=list[name](callback);if(result===undefined)result='';}
   else{if(!Object.hasOwn(fns,name))throw Error('지원하지 않는 함수: '+name);result=fns[name](...args.map(ev));}
  }
  if(typeof result==='number'&&!Number.isFinite(result))throw Error('0으로 나누기 등 계산할 수 없는 수식입니다.');if(typeof result==='string'&&result.length>100000||Array.isArray(result)&&result.length>10000)throw Error('수식 결과가 너무 큽니다.');return result;
 }
 return evaluate(ast,variables);
}
