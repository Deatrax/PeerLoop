import type { Category, Request } from '../types';
import { terminalStates } from '../types';
import { lexicalScores, tokenize, jaccard } from './search';
export function findDuplicates(requests:Request[],space_id:string,text:string,category:Category,now:number){
  const candidates=requests.filter(r=>r.space_id===space_id&&!terminalStates.includes(r.state)&&!['DRAFT','CHECKING','ANSWERED_BY_KB'].includes(r.state)&&now-Date.parse(r.created_at)<=14*86400000);
  const scores=lexicalScores(text,candidates.map(r=>({title:r.body_text,body:r.normalised_question,tags:r.tags})));
  return candidates.map((request,i)=>({request,score:Math.min(1,.25*scores[i].lexical+.25*scores[i].title+.5*jaccard(tokenize(text),tokenize(request.body_text)))})).filter(x=>x.score>=.74&&x.request.category===category).sort((a,b)=>b.score-a.score);
}
