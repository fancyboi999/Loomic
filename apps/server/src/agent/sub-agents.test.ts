import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";

import type { AvailableVideoModel } from "../generation/providers/registry.js";
import { createVideoGenerateTool } from "./tools/video-generate.js";
import { createTaskTool } from "./sub-agents.js";

function setup(responses: Parameters<ReturnType<typeof fauxProvider>["setResponses"]>[0]) {
  const faux = fauxProvider();
  faux.setResponses(responses);
  const models = createModels();
  models.setProvider(faux.provider);
  const executeVideo = vi.fn(async () => ({
    content: [{ type: "text" as const, text: JSON.stringify({ summary: "Generated video", videoUrl: "https://example.com/video.mp4", elementId: "video-1" }) }],
    details: undefined,
  }));
  const executeFile = vi.fn(async () => ({ content: [{ type: "text" as const, text: "notes" }], details: undefined }));
  const task = createTaskTool({
    model: faux.getModel(), streamFn: models.streamSimple.bind(models), systemPrompt: "Main agent prompt",
    tools: [
      { name: "generate_video", label: "Generate video", description: "Generate a video", parameters: Type.Object({ title: Type.String(), prompt: Type.String() }), execute: executeVideo },
      { name: "read_file", label: "Read file", description: "Read a file", parameters: Type.Object({ file_path: Type.String() }), execute: executeFile },
    ],
  });
  return { task, faux, executeVideo, executeFile };
}

describe("Pi task subagents", () => {
  it("returns the artifact from the real bound video tool", async () => {
    const model: AvailableVideoModel = {
      id: "test/video", displayName: "Test Video", description: "Video model", provider: "test",
      capabilities: { textToVideo: true, imageToVideo: false, videoToVideo: false, audio: false },
      limits: { maxDuration: 8, maxResolution: "720p", maxInputImages: 0 },
    };
    const faux = fauxProvider();
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("generate_video", { title: "Blue bird", prompt: "A blue bird flying", model: model.id })], { stopReason: "toolUse" }),
      fauxAssistantMessage("Done"),
    ]);
    const models = createModels();
    models.setProvider(faux.provider);
    const submitVideoJob = vi.fn().mockResolvedValue({ jobId: "job-1", videoUrl: "https://example.com/video.mp4", durationSeconds: 5 });
    const task = createTaskTool({
      model: faux.getModel(), streamFn: models.streamSimple.bind(models), systemPrompt: "Main prompt",
      tools: [createVideoGenerateTool({ availableModels: [model], submitVideoJob })],
    });
    const result = await task.execute("parent-call", { subagent_type: "video_generate", description: "Create a blue bird video" });
    expect(submitVideoJob).toHaveBeenCalledWith(expect.objectContaining({ title: "Blue bird", prompt: "A blue bird flying", model: model.id }));
    expect(JSON.parse(result.content[0]?.type === "text" ? result.content[0].text : "{}")).toMatchObject({
      videoUrl: "https://example.com/video.mp4", specialistAnswer: "Done",
    });
  });

  it("runs the video specialist in an isolated Pi context and returns its artifact", async () => {
    const { task, faux, executeVideo } = setup([
      fauxAssistantMessage([fauxToolCall("generate_video", { title: "Blue bird", prompt: "A blue bird flying" })], { stopReason: "toolUse" }),
      fauxAssistantMessage("The video is ready."),
    ]);
    const result = await task.execute("parent-call", { subagent_type: "video_generate", description: "Create a blue bird video" });
    const output = JSON.parse(result.content[0]?.type === "text" ? result.content[0].text : "{}");
    expect(executeVideo).toHaveBeenCalledOnce();
    expect(faux.state.callCount).toBe(2);
    expect(output).toMatchObject({ videoUrl: "https://example.com/video.mp4", elementId: "video-1", specialistAnswer: "The video is ready." });
  });

  it("runs a general-purpose subagent with the parent's tools and returns its answer", async () => {
    const { task, faux, executeFile } = setup([
      fauxAssistantMessage([fauxToolCall("read_file", { file_path: "/workspace/notes.txt" })], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxText("The notes say hello.")]),
    ]);
    const result = await task.execute("parent-call", { subagent_type: "general-purpose", description: "Read the notes" });
    expect(executeFile).toHaveBeenCalledOnce();
    expect(faux.state.callCount).toBe(2);
    expect(result.content).toEqual([{ type: "text", text: "The notes say hello." }]);
  });

  it("does not start a child run after cancellation", async () => {
    const { task, faux } = setup([]);
    const controller = new AbortController();
    controller.abort();
    await expect(task.execute("parent-call", { subagent_type: "video_generate", description: "Create a video" }, controller.signal)).rejects.toThrow("canceled");
    expect(faux.state.callCount).toBe(0);
  });

  it("returns a clear failure when the specialist cannot generate video", async () => {
    const { task } = setup([fauxAssistantMessage("No video provider is available.")]);
    const result = await task.execute("parent-call", { subagent_type: "video_generate", description: "Create a video" });
    expect(JSON.parse(result.content[0]?.type === "text" ? result.content[0].text : "{}")).toMatchObject({
      summary: "No video provider is available.", error: "No video provider is available.",
    });
  });

  it("does not report a failed general-purpose model turn as completed", async () => {
    const { task } = setup([fauxAssistantMessage("", { stopReason: "error", errorMessage: "Provider failed" })]);
    await expect(task.execute("parent-call", { subagent_type: "general-purpose", description: "Read the notes" }))
      .rejects.toThrow("Provider failed");
  });
});
