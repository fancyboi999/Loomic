import type { AgentMessage } from "@earendil-works/pi-agent-core";

type Summarize = (text: string, signal?: AbortSignal) => Promise<string>;

/** Keep the stored transcript intact while shortening only the model request. */
export function createContextCompactor(contextWindow: number, summarize: Summarize) {
  let cached: { source: string; summary: string } | undefined;
  return async (messages: AgentMessage[], signal?: AbortSignal): Promise<AgentMessage[]> => {
    const budget = Math.max(512, Math.floor(contextWindow * 0.7));
    if (estimateTokens(messages) <= budget) return messages;

    const firstUser = messages.findIndex((message) => message.role === "user");
    if (firstUser < 0) return messages;
    let latestUser = firstUser;
    for (let index = firstUser + 1; index < messages.length; index++) {
      if (messages[index]?.role === "user") latestUser = index;
    }
    const system = messages.slice(0, firstUser);
    const summaryAllowance = Math.min(2048, Math.max(128, Math.floor(budget * 0.2)));
    const fits = (kept: AgentMessage[]) => estimateTokens([...system, ...kept]) + summaryAllowance <= budget;

    // Keep the newest user turn verbatim, including images. Cut at a user boundary
    // when possible; a long single turn may instead cut before an assistant message.
    let cut = -1;
    for (let index = firstUser + 1; index <= latestUser; index++) {
      if (messages[index]?.role === "user" && fits(messages.slice(index))) {
        cut = index;
        break;
      }
    }
    let splitTurn = false;
    if (cut < 0) {
      for (let index = latestUser + 1; index < messages.length; index++) {
        if (messages[index]?.role === "assistant" && fits([messages[latestUser]!, ...messages.slice(index)])) {
          cut = index;
          splitTurn = true;
          break;
        }
      }
    }
    if (cut < 0) {
      throw new Error("Current request exceeds the model context budget; its text and images cannot be safely compressed.");
    }

    const older = splitTurn
      ? [...messages.slice(firstUser, latestUser), ...messages.slice(latestUser + 1, cut)]
      : messages.slice(firstUser, cut);
    const kept = splitTurn ? [messages[latestUser]!, ...messages.slice(cut)] : messages.slice(cut);

    const source = older.map(renderMessage).join("\n\n");
    if (!cached || cached.source !== source) {
      let summary = "";
      const chunkSize = Math.min(16_000, Math.max(1_000, Math.floor(contextWindow)));
      for (let offset = 0; offset < source.length; offset += chunkSize) {
        const chunk = source.slice(offset, offset + chunkSize);
        summary = await summarize(
          `Summarize this earlier conversation for a continuing assistant. Preserve user requirements, decisions, file paths, identifiers, tool results, and unresolved work. Do not add facts.\n\nPrevious summary:\n${summary}\n\nNext segment:\n${chunk}`,
          signal,
        );
        if (!summary.trim()) throw new Error("Context summarization returned an empty result.");
      }
      cached = { source, summary };
    }
    const summaryMessage: AgentMessage = {
      role: "user",
      content: `${splitTurn ? "Progress so far in this request" : "Earlier conversation summary"}:\n${cached.summary}`,
      timestamp: Date.now(),
    };
    const result: AgentMessage[] = splitTurn
      ? [...system, kept[0]!, summaryMessage, ...kept.slice(1)]
      : [...system, summaryMessage, ...kept];
    if (estimateTokens(result) > budget) {
      throw new Error("Context summary exceeds the model context budget.");
    }
    return result;
  };
}

function estimateTokens(messages: AgentMessage[]): number {
  // Do not count base64 bytes, but reserve model context for each visible image.
  return messages.reduce((total, message) => {
    const images = (message.role === "user" || message.role === "toolResult") && Array.isArray(message.content)
      ? message.content.filter((part) => part.type === "image").length
      : 0;
    return total + Math.ceil(renderMessage(message).length / 2) + images * 1200 + 20;
  }, 0);
}

function renderMessage(message: AgentMessage): string {
  if (message.role === "system") return `System: ${message.content}`;
  if (message.role === "user") {
    const text = typeof message.content === "string"
      ? message.content
      : message.content.map((part) => part.type === "text" ? part.text : "[image]").join("\n");
    return `User: ${text}`;
  }
  if (message.role === "assistant") {
    return `Assistant: ${message.content.map((part) => part.type === "text" ? part.text
      : part.type === "toolCall" ? `[called ${part.name}: ${JSON.stringify(part.arguments)}]` : "").join("\n")}`;
  }
  if (message.role === "toolResult") {
    return `Tool ${message.toolName}: ${message.content.map((part) => part.type === "text" ? part.text : "[image]").join("\n")}`;
  }
  return "";
}
