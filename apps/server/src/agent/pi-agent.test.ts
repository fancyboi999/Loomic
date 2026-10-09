import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ServerEnv } from "../config/env.js";
import { describe, expect, it, vi } from "vitest";

import type { AgentBackendResult } from "./backends/index.js";
import type { AgentPersistence } from "./persistence/index.js";
import { createLoomicPiAgent } from "./pi-agent.js";

describe("Pi agent runtime", () => {
  it("runs a tool, streams the response, and saves the transcript", async () => {
    const faux = fauxProvider();
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("ls", { path: "/workspace" })], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxText("Found the project files.")]),
    ]);
    const models = createModels();
    models.setProvider(faux.provider);
    const saveMessages = vi.fn().mockResolvedValue(undefined);
    const backend = {
      lsInfo: vi.fn().mockResolvedValue([{ path: "/workspace/readme.md", is_dir: false }]),
    };
    const agent = createLoomicPiAgent({
      env: { openAIApiKey: "test", agentModel: "gpt-4.1" } as ServerEnv,
      model: faux.getModel(),
      streamFn: models.streamSimple.bind(models),
      backendResult: { workspace: backend, sandboxDir: "/tmp/test-pi-agent" } as unknown as AgentBackendResult,
      persistence: {
        fileStore: {} as AgentPersistence["fileStore"],
        loadMessages: vi.fn().mockResolvedValue([]),
        saveMessages,
      },
    });

    const events = [];
    for await (const event of agent.stream(
      { role: "user", content: "List the files", timestamp: Date.now() },
      { threadId: "thread-1" },
      new AbortController().signal,
    )) events.push(event);

    expect(backend.lsInfo).toHaveBeenCalledWith("/workspace");
    expect(events.some((event) => event.type === "tool_execution_end")).toBe(true);
    expect(events.some((event) => event.type === "message_update" && event.assistantMessageEvent.type === "text_delta")).toBe(true);
    expect(saveMessages).toHaveBeenCalledOnce();
    expect(saveMessages.mock.calls[0]?.[0]).toBe("thread-1");
    expect(saveMessages.mock.calls[0]?.[1].map((message: { role: string }) => message.role)).toContain("toolResult");
  });

  it("loads the saved transcript on the next turn", async () => {
    const faux = fauxProvider();
    const seenRoles: string[][] = [];
    faux.setResponses([
      fauxAssistantMessage("First answer"),
      (context) => {
        seenRoles.push(context.messages.map((item) => item.role));
        return fauxAssistantMessage("Second answer");
      },
    ]);
    const models = createModels();
    models.setProvider(faux.provider);
    let saved: Awaited<ReturnType<AgentPersistence["loadMessages"]>> = [];
    const persistence = {
      fileStore: {} as AgentPersistence["fileStore"],
      loadMessages: vi.fn(async () => saved),
      saveMessages: vi.fn(async (_threadId: string, messages: AgentMessage[]) => { saved = messages.filter((message) => message.role !== "system"); }),
    } satisfies AgentPersistence;
    const agent = createLoomicPiAgent({
      env: { openAIApiKey: "test", agentModel: "gpt-4.1" } as ServerEnv,
      model: faux.getModel(),
      streamFn: models.streamSimple.bind(models),
      backendResult: { workspace: {}, sandboxDir: "/tmp/test-pi-agent" } as unknown as AgentBackendResult,
      persistence,
    });
    for (const content of ["First question", "Second question"]) {
      for await (const _event of agent.stream(
        { role: "user", content, timestamp: Date.now() },
        { threadId: "thread-1" },
        new AbortController().signal,
      )) { /* Consume the stream before starting another turn. */ }
    }

    expect(seenRoles).toEqual([["system", "user", "assistant", "user"]]);
    expect(saved.map((message) => message.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(persistence.saveMessages).toHaveBeenCalledTimes(2);
  });

  it("passes a reasoning level to a reasoning-capable model", async () => {
    const faux = fauxProvider({ models: [{ id: "reasoning-test", reasoning: true }] });
    const models = createModels();
    models.setProvider(faux.provider);
    const reasoningLevels: unknown[] = [];
    faux.setResponses([(context, options) => {
      reasoningLevels.push(options?.reasoning);
      return fauxAssistantMessage("Done");
    }]);
    const agent = createLoomicPiAgent({
      env: { openAIApiKey: "test", agentModel: "gpt-4.1" } as ServerEnv,
      model: faux.getModel(),
      streamFn: models.streamSimple.bind(models),
      backendResult: { workspace: {}, sandboxDir: "/tmp/test-pi-agent" } as unknown as AgentBackendResult,
    });
    for await (const _event of agent.stream(
      { role: "user", content: "Think", timestamp: Date.now() },
      {},
      new AbortController().signal,
    )) { /* Consume the model stream. */ }
    expect(reasoningLevels).toEqual(["medium"]);
  });

  it("does not start a model turn when the run was already canceled", async () => {
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    const agent = createLoomicPiAgent({
      env: { openAIApiKey: "test", agentModel: "gpt-4.1" } as ServerEnv,
      model: faux.getModel(),
      streamFn: models.streamSimple.bind(models),
      backendResult: { workspace: {}, sandboxDir: "/tmp/test-pi-agent" } as unknown as AgentBackendResult,
    });
    const controller = new AbortController();
    controller.abort();
    const events = [];
    for await (const event of agent.stream(
      { role: "user", content: "Do not run", timestamp: Date.now() },
      {}, controller.signal,
    )) events.push(event);
    expect(events).toEqual([]);
    expect(faux.state.callCount).toBe(0);
  });
});
