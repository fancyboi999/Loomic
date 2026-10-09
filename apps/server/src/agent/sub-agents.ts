import { Agent, type AgentEvent, type AgentMessage, type AgentTool, type AgentToolResult, type StreamFn } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import { Type } from "typebox";

/** Each task runs in a fresh Pi context; only its final result reaches the parent. */
export function createTaskTool(options: {
  model: Model<any>;
  streamFn: StreamFn;
  tools: AgentTool[];
  systemPrompt: string;
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
  onEvent?: (parentToolCallId: string, event: AgentEvent) => void;
}): AgentTool {
  const videoTool = options.tools.find((tool) => tool.name === "generate_video");
  if (!videoTool) throw new Error("The video specialist requires generate_video.");
  return {
    name: "task",
    label: "Delegate task",
    description: "Delegate a complex task to an isolated Pi agent. Use general-purpose for multi-step work, or video_generate for video generation. The subagent returns one result.",
    parameters: Type.Object({
      description: Type.String({ minLength: 1 }),
      subagent_type: Type.Union([Type.Literal("general-purpose"), Type.Literal("video_generate")]),
    }),
    async execute(id, params, signal) {
      if (signal?.aborted) throw new Error("Subagent task was canceled.");
      const { description, subagent_type } = params as { description: string; subagent_type: "general-purpose" | "video_generate" };
      const isVideo = subagent_type === "video_generate";
      const child = new Agent({
        initialState: {
          model: options.model,
          thinkingLevel: options.model.reasoning ? "medium" : "off",
          systemPrompt: isVideo
            ? "You are a video generation specialist. Use generate_video for the requested video. Preserve the user's subjects, colors, motion, camera, and lighting. If generation is unavailable or fails, explain why."
            : `${options.systemPrompt}\n\nYou are handling a delegated task in an isolated context. The delegated message does not include the parent's canvas_state; use inspect_canvas when you need current canvas details. Complete the task and return a concise result to the parent agent.`,
          tools: isVideo ? [videoTool] : options.tools,
        },
        streamFn: options.streamFn,
        ...(options.transformContext ? { transformContext: options.transformContext } : {}),
        toolExecution: "sequential",
        ...(options.model.reasoning && (options.model.provider === "google" || options.model.provider === "google-vertex") && options.model.id.includes("2.5")
          ? { thinkingBudgets: { medium: -1 } }
          : {}),
      });
      let videoResult: AgentToolResult | undefined;
      child.subscribe((event) => {
        if (isVideo && event.type === "tool_execution_end" && event.toolName === "generate_video") videoResult = event.result;
        options.onEvent?.(id, event);
      });
      const onAbort = () => child.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        await child.prompt(description);
        if (signal?.aborted) throw new Error("Subagent task was canceled.");
        const finalMessage = child.state.messages
          .filter((message) => message.role === "assistant")
          .at(-1);
        if (finalMessage?.stopReason === "error" || finalMessage?.stopReason === "aborted") {
          throw new Error(finalMessage.errorMessage || "Subagent model failed.");
        }
        const answer = finalMessage?.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("") ?? "";
        if (!isVideo) return { content: [{ type: "text", text: answer || "Task completed." }], details: undefined };
        const resultText = videoResult?.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("") ?? "";
        if (!resultText) {
          const error = answer || "Video specialist did not call generate_video.";
          return { content: [{ type: "text", text: JSON.stringify({ summary: error, error }) }], details: undefined };
        }
        const result = JSON.parse(resultText) as Record<string, unknown>;
        return {
          content: [{ type: "text", text: JSON.stringify({ ...result, ...(answer ? { specialistAnswer: answer } : {}) }) }],
          details: undefined,
        };
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
