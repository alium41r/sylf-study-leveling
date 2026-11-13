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
it('clamps max_tokens to 8192 when thinking is disabled so non-thinking requests never exceed upstream limits',async()=>{
  const fetch=transport();
  await new DeepSeekAdapter('synthetic-key','configured-model').generateResponse([{role:'user',content:'Return JSON'}],'Return JSON',[],{thinking:'disabled',responseFormat:'json_object',maxTokens:65536,singleAttempt:true});
  const request=fetch.mock.calls[0] as unknown as [string,RequestInit];
  expect(JSON.parse(request[1].body as string)).toMatchObject({thinking:{type:'disabled'},max_tokens:8192});
});
it('retries transient pre-stream HTTP 500/503 responses with identical payload while failing immediately on HTTP 400',async()=>{
  vi.useFakeTimers();
  try {
    const fetch=vi.fn()
      .mockResolvedValueOnce(new Response('{"error":"upstream 500"}',{status:500}))
      .mockResolvedValueOnce(new Response('{"error":"upstream 503"}',{status:503}))
      .mockResolvedValueOnce(new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}],usage:{prompt_tokens:12,completion_tokens:4,total_tokens:16}}),{status:200}));
    vi.stubGlobal('fetch',fetch);
    const pending=new DeepSeekAdapter('synthetic-key','deepseek-flash').generateResponse([{role:'user',content:'Return JSON'}],'Return JSON',[],{thinking:'disabled',responseFormat:'json_object',maxTokens:4096,singleAttempt:true,telemetry:false});
    await vi.advanceTimersByTimeAsync(2500);
    const response=await pending;
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(response.text).toBe('{"ok":true}');
  } finally {
    vi.useRealTimers();
  }
});
it('aborts a half-open stalled DeepSeek SSE stream after 30s idle and retries cleanly to completion',async()=>{
  vi.useFakeTimers();
  try {
    const encoder=new TextEncoder();
    const stalledStream=new ReadableStream<Uint8Array>({
      start(controller){
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({model:'deepseek-chat',choices:[{delta:{reasoning_content:'We'}}]})}\n\n`));
        // Intentionally never enqueue [DONE] or close — simulates half-open upstream TCP stall
      },
    });
    const healthyStream=new ReadableStream<Uint8Array>({
      start(controller){
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({model:'deepseek-chat',choices:[{delta:{reasoning_content:'Full reasoning.'}}]})}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({model:'deepseek-chat',choices:[{delta:{content:'{"ok":true}'},finish_reason:'stop'}],usage:{prompt_tokens:15,completion_tokens:8,total_tokens:23,completion_tokens_details:{reasoning_tokens:4}}})}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    const fetch=vi.fn()
      .mockResolvedValueOnce(new Response(stalledStream,{status:200}))
      .mockResolvedValueOnce(new Response(healthyStream,{status:200}));
    vi.stubGlobal('fetch',fetch);
    const pending=new DeepSeekAdapter('synthetic-key','deepseek-chat').generateResponse(
      [{role:'user',content:'Return JSON'}],
      'Return JSON',
      [],
      {thinking:'enabled',reasoningEffort:'low',responseFormat:'json_object',maxTokens:4096,singleAttempt:true,telemetry:false,onReasoningDelta:()=>{}}
    );
    await vi.advanceTimersByTimeAsync(31_500);
    const response=await pending;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(response.text).toBe('{"ok":true}');
    expect(response.reasoningText).toBe('Full reasoning.');
  } finally {
    vi.useRealTimers();
  }
});
