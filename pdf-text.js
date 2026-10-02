// Conservative cleanup: preserve lines unless PDF geometry establishes a wrapped paragraph.
export function normalizePDFText(text){return String(text||'').replace(/[ﬀﬁﬂﬃﬄ]/g,c=>({'ﬀ':'ff','ﬁ':'fi','ﬂ':'fl','ﬃ':'ffi','ﬄ':'ffl'}[c])).replace(/\u00ad/g,'').replace(/[\t\u00a0 ]+/g,' ').replace(/ +\n/g,'\n').trim()}
export function pageText(items){
 const rows=[];let row=[];
 for(const item of items){if(typeof item.str!=='string')continue;row.push(item);if(item.hasEOL){rows.push(row);row=[];}}
 if(row.length)rows.push(row);
 const raw=items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('');
 const lines=rows.map(parts=>{
  let text='';for(let i=0;i<parts.length;i++){const p=parts[i],previous=parts[i-1];if(previous){const end=previous.transform[4]+previous.width,gap=p.transform[4]-end,h=Math.max(1,Math.abs(p.transform[3]));if(gap>h*.18&&!/\s$/.test(text)&&!/^\s/.test(p.str))text+=' ';}text+=p.str;}
  const first=parts.find(p=>p.str.trim())||parts[0],last=parts.at(-1);return {text:normalizePDFText(text),x:first.transform[4],y:first.transform[5],h:Math.abs(first.transform[3]),end:last.transform[4]+last.width};
 }).filter(l=>l.text);
 const joined=[];let mergedLines=0;
 for(let i=0;i<lines.length;i++){const l=lines[i],next=lines[i+1];let text=l.text;
  // Join only at an ordinary left margin, near-identical size and regular line spacing.
  // Never merge list items, short labels, headings, table columns or completed sentences.
  if(next&&text.length>45&&Math.abs(l.x-next.x)<2&&Math.abs(l.h-next.h)<.5&&l.y>next.y&&l.y-next.y<l.h*1.9&&!/[.!?:。！？]$/.test(text)&&!/^([•●\-★⚠]|\d+[.) ]|#{1,6} )/.test(next.text)&&!/^https?:/.test(text)){
   next.text=text+' '+next.text;mergedLines++;continue;
  }
  joined.push(text);
 }
 return {raw,text:joined.join('\n'),mergedLines,lineCount:lines.length};
}
