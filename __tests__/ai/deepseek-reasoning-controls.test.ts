import { afterEach, expect, it, vi } from 'vitest';
import { DeepSeekAdapter } from '@/lib/ai/providers/deepseek';

afterEach(()=>vi.unstubAllGlobals());
function transport() {
  const fetch=vi.fn(async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"result":"observed"}',reasoning_content:'Internal reasoning'}}],usage:{prompt_tokens:20,completion_tokens:8,total_tokens:28,completion_tokens_details:{reasoning_tokens:5}}})}));
  vi.stubGlobal('fetch',fetch);return fetch;
}
it.each(['low','high'] as const)('passes opt-in %s reasoning without changing JSON mode, caps, cancellation or actual usage',async(reasoningEffort)=>{
  const fetch=transport(),signal=new AbortController().signal;
  const response=await new DeepSeekAdapter('synthetic-key','configured-model').generateResponse([{role:'user',content:'Return JSON'}],'Return JSON',[],{thinking:'enabled',reasoningEffort,responseFormat:'json_object',maxTokens:8192,singleAttempt:true,signal});
  const request=fetch.mock.calls[0] as unknown as [string,RequestInit];
  expect(JSON.parse(request[1].body as string)).toMatchObject({thinking:{type:'enabled'},reasoning_effort:reasoningEffort,response_format:{type:'json_object'},max_tokens:8192});
  expect(request[1].signal).toBe(signal);expect(fetch).toHaveBeenCalledTimes(1);
  expect(response.usage).toMatchObject({promptTokens:20,completionTokens:8,totalTokens:28});
});
it('leaves the provider reasoning default untouched when no effort control is supplied',async()=>{
  const fetch=transport();await new DeepSeekAdapter('synthetic-key','configured-model').generateResponse([{role:'user',content:'Return JSON'}],'Return JSON',[],{thinking:'enabled',singleAttempt:true});
  const request=fetch.mock.calls[0] as unknown as [string,RequestInit];
  expect(JSON.parse(request[1].body as string)).not.toHaveProperty('reasoning_effort');
});
