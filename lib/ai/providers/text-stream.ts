import { readEventStream } from "../sylvie/event-stream";

export interface TextChunk {
  model?: string;
  choices?: { delta?: { content?: string | null; tool_calls?: unknown[] }; finish_reason?: string | null }[];
  usage?: unknown;
  x_groq?: { usage?: unknown; error?: string | null };
}

/** Only visible answer text is forwarded. Private reasoning/tool arguments never leave the provider boundary. */
export async function collectTextChunks(chunks: AsyncIterable<TextChunk>, onText: (text: string) => void) {
  let text = "", model: string | undefined, usage: Record<string, unknown> | undefined, finish: string | null = null;
  for await (const chunk of chunks) {
    if (chunk.x_groq?.error) throw new Error("Provider stream interrupted");
    model = chunk.model || model;
    if (chunk.usage || chunk.x_groq?.usage) usage = (chunk.usage || chunk.x_groq?.usage) as Record<string, unknown>;
    const choice = chunk.choices?.[0];
    if (choice?.delta?.tool_calls?.length) throw new Error("Unexpected tool call in text stream");
    if (typeof choice?.delta?.content === "string") { text += choice.delta.content; onText(choice.delta.content); }
    finish = choice?.finish_reason || finish;
  }
  if (!finish) throw new Error("Provider stream interrupted");
  return { model, usage, choices: [{ message: { content: text, tool_calls: undefined, reasoning_content: undefined }, finish_reason: finish }] };
}

export async function collectHttpTextStream(response: Response, onText: (text: string) => void, signal?: AbortSignal) {
  let text = "", model: string | undefined, usage: Record<string, unknown> | undefined, finish: string | null = null, completed = false;
  await readEventStream(response, (_event, data) => {
    if (data === "[DONE]") { completed = true; return; }
    const chunk = JSON.parse(data) as TextChunk;
    model = chunk.model || model;
    if (chunk.usage) usage = chunk.usage as Record<string, unknown>;
    const choice = chunk.choices?.[0];
    if (choice?.delta?.tool_calls?.length) throw new Error("Unexpected tool call in text stream");
    if (typeof choice?.delta?.content === "string") { text += choice.delta.content; onText(choice.delta.content); }
    finish = choice?.finish_reason || finish;
  }, signal);
  if (!completed || !finish) throw new Error("Provider stream interrupted");
  return { model, usage, choices: [{ message: { content: text, tool_calls: undefined, reasoning_content: undefined }, finish_reason: finish }] };
}
