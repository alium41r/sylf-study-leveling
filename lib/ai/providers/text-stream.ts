import { readEventStream } from "../sylvie/event-stream";

export interface TextChunk {
  model?: string;
  system_fingerprint?: string|null;
  choices?: { delta?: { content?: string | null; reasoning_content?:string|null; tool_calls?: unknown[] }; finish_reason?: string | null }[];
  usage?: unknown;
  x_groq?: { usage?: unknown; error?: string | null };
}

/** Only visible answer text is forwarded. Private reasoning/tool arguments never leave the provider boundary. */
export async function collectTextChunks(chunks: AsyncIterable<TextChunk>, onText: (text: string) => void) {
  let text = "", model: string | undefined, fingerprint:string|null|undefined, usage: Record<string, unknown> | undefined, finish: string | null = null;
  for await (const chunk of chunks) {
    if (chunk.x_groq?.error) throw new Error("Provider stream interrupted");
    model = chunk.model || model;
    if(chunk.system_fingerprint!==undefined)fingerprint=chunk.system_fingerprint;
    if (chunk.usage || chunk.x_groq?.usage) usage = (chunk.usage || chunk.x_groq?.usage) as Record<string, unknown>;
    const choice = chunk.choices?.[0];
    if (choice?.delta?.tool_calls?.length) throw new Error("Unexpected tool call in text stream");
    if (typeof choice?.delta?.content === "string") { text += choice.delta.content; onText(choice.delta.content); }
    finish = choice?.finish_reason || finish;
  }
  if (!finish) throw new Error("Provider stream interrupted");
  return { model, system_fingerprint:fingerprint, usage, choices: [{ message: { content: text, tool_calls: undefined, reasoning_content: undefined }, finish_reason: finish }] };
}

/** The provider reasoning channel is captured only by explicit opt-in callers,
 * never merged into answer text or default telemetry. */
export async function collectHttpTextStream(response: Response, onText: (text: string) => void, signal?: AbortSignal,onReasoning?:(text:string)=>void,idleTimeoutMs?:number) {
  let text = "", model: string | undefined, fingerprint:string|null|undefined, usage: Record<string, unknown> | undefined, finish: string | null = null, completed = false;
  let reasoning="";
  await readEventStream(response, (_event, data) => {
    if (data === "[DONE]") { completed = true; return; }
    const chunk = JSON.parse(data) as TextChunk;
    model = chunk.model || model;
    if(chunk.system_fingerprint!==undefined)fingerprint=chunk.system_fingerprint;
    if (chunk.usage) usage = chunk.usage as Record<string, unknown>;
    const choice = chunk.choices?.[0];
    if (choice?.delta?.tool_calls?.length) throw new Error("Unexpected tool call in text stream");
    if(onReasoning&&typeof choice?.delta?.reasoning_content==="string"){reasoning+=choice.delta.reasoning_content;onReasoning(choice.delta.reasoning_content);}
    if (typeof choice?.delta?.content === "string") { text += choice.delta.content; onText(choice.delta.content); }
    finish = choice?.finish_reason || finish;
  }, signal, idleTimeoutMs);
  if (!completed || !finish) throw new Error("Provider stream interrupted");
  return { model, system_fingerprint:fingerprint, usage, choices: [{ message: { content: text, tool_calls: undefined, reasoning_content:onReasoning&&reasoning.length>0?reasoning:undefined }, finish_reason: finish }] };
}
