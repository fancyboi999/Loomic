import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerEnv } from "../config/env.js";
import { describe, expect, it, vi } from "vitest";

import type { AgentBackendResult } from "./backends/index.js";
import { createWorkspace } from "./backends/workspace.js";
import type { AgentPersistence } from "./persistence/index.js";
import { createLoomicPiAgent } from "./pi-agent.js";

describe("Pi agent runtime", () => {
  it("loads an automatically discovered Skill's instructions and keeps its files readable", async () => {
    const root = await mkdtemp(join(tmpdir(), "loomic-pi-skill-"));
    try {
      const skillsRoot = join(root, "skills");
      await mkdir(join(skillsRoot, "new-skill"), { recursive: true });
      await writeFile(join(skillsRoot, "new-skill", "SKILL.md"), "---\nname: new-skill\ndescription: Use for a blue bird.\n---\n\nPaint a blue bird.");
      const faux = fauxProvider();
      faux.setResponses([
        (context) => {
          const transcript = JSON.stringify(context.messages);
          expect(transcript).toContain("/skills/new-skill/SKILL.md");
          expect(transcript).toContain("Use for a blue bird.");
          expect(transcript).toContain("Paint a blue bird.");
          return fauxAssistantMessage([fauxToolCall("read_file", { file_path: "/skills/new-skill/SKILL.md" })], { stopReason: "toolUse" });
        },
        fauxAssistantMessage("I followed the skill."),
      ]);
      const models = createModels();
      models.setProvider(faux.provider);
      const workspace = createWorkspace({ sandboxDir: root, skillsRoot });
      const agent = createLoomicPiAgent({
        env: { openAIApiKey: "test", agentModel: "gpt-4.1" } as ServerEnv,
        model: faux.getModel(), streamFn: models.streamSimple.bind(models),
        backendResult: { workspace, sandboxDir: root, skillsRoot },
        discoverLocalSkills: true,
      });
      const events = [];
      for await (const event of agent.stream(
        { role: "user", content: "Paint a blue bird", timestamp: Date.now() },
        {}, new AbortController().signal,
      )) events.push(event);
      expect(events.find((event) => event.type === "tool_execution_end" && event.toolName === "read_file"))
        .toMatchObject({ result: { content: [{ type: "text", text: expect.stringContaining("Paint a blue bird.") }] } });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("routes task to a Pi video specialist while keeping direct generate_video available", async () => {
    const faux = fauxProvider();
    faux.setResponses([
      () => {
        return fauxAssistantMessage([fauxToolCall("task", { subagent_type: "video_generate", description: "Make a blue bird video" })], { stopReason: "toolUse" });
      },
      () => {
        return fauxAssistantMessage([fauxToolCall("generate_video", { title: "Blue bird", prompt: "A blue bird flying" })], { stopReason: "toolUse" });
      },
      fauxAssistantMessage("Video generation was attempted."),
      fauxAssistantMessage("I attempted the video."),
    ]);
    const models = createModels();
    models.setProvider(faux.provider);
    const agent = createLoomicPiAgent({
      env: { openAIApiKey: "test", agentModel: "gpt-4.1" } as ServerEnv,
      model: faux.getModel(),
      streamFn: models.streamSimple.bind(models),
      backendResult: { workspace: {}, sandboxDir: "/tmp/test-pi-agent" } as unknown as AgentBackendResult,
    });
    const events = [];
    for await (const event of agent.stream(
      { role: "user", content: "Make a blue bird video", timestamp: Date.now() },
      {}, new AbortController().signal,
    )) events.push(event);

    expect(faux.state.callCount).toBe(4);
    expect(events.some((event) => event.type === "tool_execution_end" && event.toolName === "task")).toBe(true);
    expect(events.some((event) => event.type === "tool_execution_end" && event.toolName === "generate_video" && event.toolCallId.includes(":"))).toBe(true);
  });

  it("runs a tool, streams the response, and saves the transcript", async () => {
    const faux = fauxProvider();
    const saveMessages = vi.fn().mockResolvedValue(undefined);
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("ls", { path: "/workspace" })], { stopReason: "toolUse" }),
      () => {
        expect(saveMessages).toHaveBeenCalledOnce();
        return fauxAssistantMessage([fauxText("Found the project files.")]);
      },
    ]);
    const models = createModels();
    models.setProvider(faux.provider);
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
    expect(saveMessages).toHaveBeenCalledTimes(2);
    expect(saveMessages.mock.calls[0]?.[0]).toBe("thread-1");
    expect(saveMessages.mock.calls[0]?.[1].map((message: { role: string }) => message.role)).toContain("toolResult");
    expect(saveMessages.mock.calls[1]?.[1].at(-1)).toMatchObject({ role: "assistant" });
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

  it("continues through the Pi model event path when context summarization fails", async () => {
    const faux = fauxProvider();
    faux.setResponses([
      fauxAssistantMessage("", { stopReason: "error", errorMessage: "Summary unavailable" }),
      fauxAssistantMessage("Current answer"),
    ]);
    const models = createModels();
    models.setProvider(faux.provider);
    const agent = createLoomicPiAgent({
      env: { openAIApiKey: "test", agentModel: "gpt-4.1" } as ServerEnv,
      model: { ...faux.getModel(), contextWindow: 4096 },
      streamFn: models.streamSimple.bind(models),
      backendResult: { workspace: {}, sandboxDir: "/tmp/test-pi-agent" } as unknown as AgentBackendResult,
      persistence: {
        fileStore: {} as AgentPersistence["fileStore"],
        loadMessages: vi.fn().mockResolvedValue([{ role: "user", content: "old ".repeat(5000), timestamp: 1 }]),
        saveMessages: vi.fn().mockResolvedValue(undefined),
      },
    });
    const events = [];
    for await (const event of agent.stream(
      { role: "user", content: "New request", timestamp: Date.now() },
      { threadId: "thread-1" }, new AbortController().signal,
    )) events.push(event);
    expect(faux.state.callCount).toBe(2);
    expect(events.some((event) => event.type === "message_end" && event.message.role === "assistant" && event.message.content.some((part) => part.type === "text" && part.text === "Current answer"))).toBe(true);
  });

  it("fails the run when a turn cannot be checkpointed", async () => {
    const faux = fauxProvider();
    faux.setResponses([fauxAssistantMessage("Done")]);
    const models = createModels();
    models.setProvider(faux.provider);
    const agent = createLoomicPiAgent({
      env: { openAIApiKey: "test", agentModel: "gpt-4.1" } as ServerEnv,
      model: faux.getModel(), streamFn: models.streamSimple.bind(models),
      backendResult: { workspace: {}, sandboxDir: "/tmp/test-pi-agent" } as unknown as AgentBackendResult,
      persistence: {
        fileStore: {} as AgentPersistence["fileStore"],
        loadMessages: vi.fn().mockResolvedValue([]),
        saveMessages: vi.fn().mockRejectedValue(new Error("Database unavailable")),
      },
    });
    await expect((async () => {
      for await (const _event of agent.stream(
        { role: "user", content: "Reply", timestamp: Date.now() },
        { threadId: "thread-1" }, new AbortController().signal,
      )) { /* Consume the run. */ }
    })()).rejects.toThrow("Database unavailable");
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
