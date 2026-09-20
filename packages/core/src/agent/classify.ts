import { classificationSchema } from '../schemas';
import type { Classification, Priority } from '../types';
import { tokenize } from '../knowledge/search';
export interface ClassifyContext { code:string; priority_requested?:Priority }
export interface LLMProvider { name:string; classify(text:string,ctx:ClassifyContext):Promise<unknown> }
export class HeuristicProvider implements LLMProvider {
  name='heuristic-v1';
  async classify(text:string,ctx:ClassifyContext):Promise<Classification>{
    const t=text.toLowerCase();
    const authority=/extension|deadline change|permission|approval|\broom\b|\baccess\b|can we.*(?:change|move|extend|book|use|submit|delay)/i.test(t);
    const campus=/projector|broken|campus|electricity|water supply|unsafe/i.test(t);
    const category=campus?'CAMPUS_ISSUE':authority?'LOGISTICS_AUTHORITY':/slides|notes|recording|\bpdf\b|template|share the/.test(t)?'MATERIAL':/where|when|which|deadline|link|form|submit/.test(t)?'INFORMATION':/explain|how does|understand|solve|why/.test(t)?'ACADEMIC_HELP':/who is|are we|group|collecting|meeting/.test(t)?'COORDINATION':'INFORMATION';
    const detected:Priority=/(block|cannot|can't|stuck|urgent)/.test(t)&&/\b(?:[12]\s*(?:hours?|hrs?)|[1-9]\d?\s*(?:minutes?|mins?)|now)\b/.test(t)?'P0':/today|tomorrow|deadline|due\b/.test(t)?'P1':'P2';
    const asked=ctx.priority_requested??'P2';
    const priority=Number(asked[1])>=Number(detected[1])?asked:detected;
    const code=text.match(/\b[A-Z]{2,5}\s?\d{4}\b/i)?.[0].toUpperCase().replace(/([A-Z])(\d)/,'$1 $2')??null;
    return {category,request_class:authority||campus?'AUTHORITY':'KNOWLEDGE',priority_suggested:priority,priority_reason:priority!==asked?'No matching urgency signal; your CR can raise this.':detected==='P0'?'Blocking work within three hours.':detected==='P1'?'A near-term deadline is mentioned.':'Standard response pace.',tags:[...new Set([...tokenize(t),...(code?[code]:[])])].slice(0,20),normalised_question:text.trim().replace(/\s+/g,' ').slice(0,140),detected_space_hint:code&&code!==ctx.code?code:null,contains_personal_info:/[\w.+-]+@[\w.-]+\.[a-z]+|\b01\d{9}\b|medical|diagnos|my grade|my student id|my address/i.test(t)};
  }
}
export async function classify(text:string,ctx:ClassifyContext,provider:LLMProvider=new HeuristicProvider()):Promise<Classification>{
  for(let attempt=0;attempt<2;attempt++){try{return classificationSchema.parse(await provider.classify(text,ctx));}catch{/* Retry provider contract once; failures are surfaced by needs_review. */}}
  return {category:'INFORMATION',request_class:'KNOWLEDGE',priority_suggested:'P2',priority_reason:'Classification needs your class representative to review it.',tags:tokenize(text).slice(0,20),normalised_question:text.slice(0,140),detected_space_hint:null,contains_personal_info:true,needs_review:true};
}
