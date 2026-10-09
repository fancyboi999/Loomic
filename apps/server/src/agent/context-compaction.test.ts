import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";

import { createContextCompactor } from "./context-compaction.js";

describe("Pi context compaction", () => {
  it("keeps short conversations unchanged", async () => {
    const summarize = vi.fn();
    const messages: AgentMessage[] = [{ role: "user", content: "Short request", timestamp: 1 }];
    const compact = createContextCompactor(100_000, summarize);
    expect(await compact(messages)).toBe(messages);
    expect(summarize).not.toHaveBeenCalled();
  });

  it("summarizes older turns while keeping recent turns and tool pairs intact", async () => {
    const messages: AgentMessage[] = [{ role: "system", content: "You are helpful", timestamp: 1 }];
    for (let i = 0; i < 8; i++) {
      messages.push({ role: "user", content: `Request ${i}: ${"x".repeat(500)}`, timestamp: i + 2 });
      messages.push({
        role: "assistant", content: [{ type: "text", text: `Answer ${i}` }], timestamp: i + 2,
        api: "openai-completions", provider: "test", model: "test", stopReason: "stop",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      });
    }
    const summarize = vi.fn().mockResolvedValue("The user requested and received earlier answers.");
    const compact = createContextCompactor(1_500, summarize);
    const result = await compact(messages);

    expect(result[0]).toBe(messages[0]);
    expect(result[1]).toMatchObject({ role: "user", content: expect.stringContaining("Earlier conversation summary") });
    expect(result.at(-1)).toBe(messages.at(-1));
    expect(result[2]?.role).toBe("user");
    expect(summarize).toHaveBeenCalled();
    const summaryCalls = summarize.mock.calls.length;
    await compact(messages);
    expect(summarize).toHaveBeenCalledTimes(summaryCalls);
    expect(messages).toHaveLength(17);
  });

  it("keeps the current user request and complete tool pairs in a long single turn", async () => {
    const messages: AgentMessage[] = [{ role: "user", content: "Do a long task", timestamp: 1 }];
    for (let i = 0; i < 10; i++) {
      messages.push(fauxAssistantMessage([fauxToolCall("read_file", { file_path: `file-${i}` }, { id: `call-${i}` })], { stopReason: "toolUse" }));
      messages.push({ role: "toolResult", toolCallId: `call-${i}`, toolName: "read_file", content: [{ type: "text", text: "x".repeat(300) }], isError: false, timestamp: i + 2 });
    }
    const compact = createContextCompactor(1_500, vi.fn().mockResolvedValue("The earlier tool results were read."));
    const result = await compact(messages);
    expect(result[0]).toBe(messages[0]);
    expect(result[1]).toMatchObject({ role: "user", content: expect.stringContaining("Progress so far in this request") });
    expect(result[2]?.role).toBe("assistant");
    expect(result.at(-1)).toBe(messages.at(-1));
    expect(result.slice(2).every((message, index) => message.role === (index % 2 === 0 ? "assistant" : "toolResult"))).toBe(true);
  });

  it("preserves the latest reference image when older turns need compaction", async () => {
    const messages: AgentMessage[] = Array.from({ length: 8 }, (_, index) => ({
      role: "user", content: `Old request ${index}: ${"x".repeat(600)}`, timestamp: index,
    }));
    const latest: AgentMessage = {
      role: "user", timestamp: 9,
      content: [{ type: "text", text: "Use this reference" }, { type: "image", data: "image-bytes", mimeType: "image/png" }],
    };
    messages.push(latest);
    const result = await createContextCompactor(4_000, vi.fn().mockResolvedValue("Earlier requests discussed."))(messages);
    expect(result.at(-1)).toBe(latest);
    expect(result[0]).toMatchObject({ role: "user", content: expect.stringContaining("Earlier conversation summary") });
  });

  it("fails explicitly when the current image request alone exceeds the budget", async () => {
    const messages: AgentMessage[] = [{
      role: "user", timestamp: 1,
      content: [{ type: "text", text: "Use this image" }, { type: "image", data: "image-bytes", mimeType: "image/png" }],
    }];
    const summarize = vi.fn();
    await expect(createContextCompactor(1_500, summarize)(messages)).rejects.toThrow("Current request exceeds");
    expect(summarize).not.toHaveBeenCalled();
  });

  it("feeds the summary into a real Pi model turn", async () => {
    const faux = fauxProvider({ models: [{ id: "small-context", contextWindow: 1_500 }] });
    const models = createModels();
    models.setProvider(faux.provider);
    let observed = "";
    faux.setResponses([(context) => {
      observed = JSON.stringify(context.messages);
      return fauxAssistantMessage("Done");
    }]);
    const agent = new Agent({
      initialState: {
        model: faux.getModel(),
        messages: Array.from({ length: 10 }, (_, index): AgentMessage => ({
          role: "user", content: `Old request ${index}: ${"x".repeat(500)}`, timestamp: index,
        })),
      },
      streamFn: models.streamSimple.bind(models),
      transformContext: createContextCompactor(1_500, vi.fn().mockResolvedValue("Old requests were discussed.")),
    });
    await agent.prompt("New request");
    expect(observed).toContain("Earlier conversation summary");
    expect(observed).toContain("New request");
    expect(observed).not.toContain("Old request 0");
  });

  it("keeps an image in the model request after Pi applies compaction", async () => {
    const faux = fauxProvider({ models: [{ id: "image-context", contextWindow: 4_000 }] });
    const models = createModels();
    models.setProvider(faux.provider);
    let observed: AgentMessage[] = [];
    faux.setResponses([(context) => {
      observed = context.messages as AgentMessage[];
      return fauxAssistantMessage("Done");
    }]);
    const agent = new Agent({
      initialState: {
        model: faux.getModel(),
        messages: Array.from({ length: 8 }, (_, index): AgentMessage => ({
          role: "user", content: `Old request ${index}: ${"x".repeat(600)}`, timestamp: index,
        })),
      },
      streamFn: models.streamSimple.bind(models),
      transformContext: createContextCompactor(4_000, vi.fn().mockResolvedValue("Old requests were discussed.")),
    });
    await agent.prompt({
      role: "user", timestamp: 9,
      content: [{ type: "text", text: "Use this reference" }, { type: "image", data: "image-bytes", mimeType: "image/png" }],
    });
    const latest = observed.at(-1);
    expect(latest && "content" in latest ? latest.content : undefined).toEqual([
      { type: "text", text: "Use this reference" },
      { type: "image", data: "image-bytes", mimeType: "image/png" },
    ]);
  });
});
