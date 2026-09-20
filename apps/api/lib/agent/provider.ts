import type { ClassifyContext, LLMProvider } from '@peerloop/core';
// Optional server-only adapter. The deterministic provider needs no model credentials.
export class RemoteProvider implements LLMProvider {
  name='remote-classifier';
  async classify(text:string,ctx:ClassifyContext):Promise<unknown>{if(!process.env.MODEL_ENDPOINT||!process.env.MODEL_API_KEY)throw new Error('Model provider is not configured.');const response=await fetch(process.env.MODEL_ENDPOINT,{method:'POST',headers:{Authorization:`Bearer ${process.env.MODEL_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({task:'classify',text,context:ctx}),signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error(`Model HTTP ${response.status}`);return response.json();}
}
