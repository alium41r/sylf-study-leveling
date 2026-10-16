// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { DeepSeekAdapter } from "@/lib/ai/providers/deepseek";
import type { NormalizedMessage } from "@/lib/ai/providers/types";
afterEach(() => vi.unstubAllGlobals());
it("round-trips thinking metadata privately for tool continuation, omitting it on text-only calls", async () => {
  const wire = vi.fn().mockResolvedValueOnce(Response.json({model: "deepseek-flash", choices:[{message:{content:null,reasoning_content:"PRIVATE_FIXTURE_METADATA",tool_calls:[{id:"call-1",function:{name:"getQuests",arguments:"{}"}}]},finish_reason:"tool_calls"}]}))
    .mockImplementation(async () => Response.json({model:"deepseek-flash",choices:[{message:{content:"Visible answer"},finish_reason:"stop"}]}));
  vi.stubGlobal("fetch",wire);
  const adapter = new DeepSeekAdapter("synthetic");
  const tools = [{name:"getQuests",description:"Fixture"}];
  const history: NormalizedMessage[] = [{role:"assistant",content:"Previous visible answer"},{role:"user",content:"Review my tasks"}];
  const first = await adapter.generateResponse(history,"Fixture",tools);
  history.push({role:"assistant",toolCalls:first.toolCalls,rawParts:first.rawCandidateParts},{role:"tool",toolResults:[{toolCallId:"call-1",name:"getQuests",result:{count:1}}]});
  const second = await adapter.generateResponse(history,"Fixture",tools);
  expect(second.text).toBe("Visible answer");
  const toolPayload = JSON.parse(wire.mock.calls[1][1].body);
  expect(toolPayload.messages[1].reasoning_content).toBe("");
  expect(toolPayload.messages[3].reasoning_content).toBe("PRIVATE_FIXTURE_METADATA");
  expect(second.text).not.toContain("PRIVATE");
  await adapter.generateResponse(history,"Fixture",[]);
  expect(JSON.stringify(JSON.parse(wire.mock.calls[2][1].body).messages)).not.toContain("PRIVATE_FIXTURE_METADATA");
});
