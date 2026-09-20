import type { Category, KnowledgeItem, SearchHit } from '../types';
const stop=new Set('a an the is are was were be been to of for in on at by with and or but it this that these those i we you my our have has anyone does do please can need where when which what how from'.split(' '));
export function tokenize(text:string):string[]{return text.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w&&!stop.has(w)).map(w=>w.length>5?w.replace(/(?:ing|es|ed|s)$/,''):w.length>3?w.replace(/s$/,''):w);}
export function jaccard(a:string[],b:string[]):number{const x=new Set(a),y=new Set(b);return [...x].filter(w=>y.has(w)).length/Math.max(1,new Set([...x,...y]).size);}
export interface RetrievalProvider {search(space_id:string,query:string,category:Category,now:number):Promise<SearchHit[]>}
export function lexicalScores(query:string,documents:{title:string;body:string;tags:string[]}[]):{lexical:number;title:number;tags:number}[]{
  const q=[...new Set(tokenize(query))]; if(!q.length)return documents.map(()=>({lexical:0,title:0,tags:0}));
  const tokens=documents.map(d=>tokenize(d.title+' '+d.body)); const avg=tokens.reduce((s,t)=>s+t.length,0)/Math.max(1,tokens.length);
  const idfs=q.map(w=>Math.log(1+(documents.length-tokens.filter(t=>t.includes(w)).length+.5)/(tokens.filter(t=>t.includes(w)).length+.5)));
  const max=idfs.reduce((s,v)=>s+v,0)*2.2;
  return documents.map((d,i)=>{const ts=tokens[i];let raw=0;for(let k=0;k<q.length;k++){const tf=ts.filter(w=>w===q[k]).length;raw+=idfs[k]*(tf*2.2)/(tf+1.2*(.25+.75*ts.length/Math.max(1,avg)));}const coverage=q.filter(w=>ts.includes(w)).length/q.length;const titleTokens=tokenize(d.title);const title=q.filter(w=>titleTokens.includes(w)).length/q.length;return {lexical:Math.min(1,.6*coverage+.4*raw/Math.max(.001,max)),title,tags:jaccard(q,d.tags)};});
}
export function searchKnowledge(items:KnowledgeItem[],space_id:string,query:string,category:Category,now:number):SearchHit[]{
  const candidates=items.filter(i=>i.space_id===space_id&&i.published&&i.status!=='RETIRED');
  const scores=lexicalScores(query,candidates.map(i=>({title:i.title,body:i.body_markdown,tags:i.tags})));
  return candidates.map((item,i)=>{const s=scores[i],stale=item.status==='STALE'||Date.parse(item.expires_at)<=now;const terms={...s,verified:item.status==='VERIFIED'?.12:0,pinned:item.kind==='PINNED_REF'&&['MATERIAL','INFORMATION'].includes(category)?.08:0,stale:stale?-.15:0,age:now-Date.parse(item.created_at)>60*86400000?-.10:0};const base=.65*s.lexical+.3*s.title+.05*s.tags;return {item,terms,score:Math.min(stale?.779:1,Math.max(0,base+terms.verified+terms.pinned+terms.stale+terms.age))};}).filter(h=>h.terms.lexical>0).sort((a,b)=>b.score-a.score).slice(0,8);
}
