import type { StreamEvent } from "@loomic/shared";

import { getServerBaseUrl } from "./env";

export function createEventsUrl(runId: string) {
  return `${getServerBaseUrl()}/api/agent/runs/${runId}/events`;
}

export async function* streamEvents(
  runId: string,
  eventSourceFactory: EventSourceFactory = (url) => new EventSource(url),
) {
  const source = eventSourceFactory(createEventsUrl(runId));
  const queue: StreamEvent[] = [];
  let closed = false;
  let rejectedError: Error | null = null;

  source.onmessage = (event) => {
    const parsed = JSON.parse(event.data) as StreamEvent;
    queue.push(parsed);
    if (parsed.type === "run.completed" || parsed.type === "run.failed") {
      closed = true;
      source.close();
    }
  };

  source.onerror = () => {
    rejectedError = new Error("Failed to stream run events.");
    closed = true;
    source.close();
  };

  const onOpen = () => {
    source.removeEventListener("open", onOpen);
  };

  source.addEventListener("open", onOpen);

  try {
    while (!closed || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift() as StreamEvent;
        continue;
      }

      if (rejectedError) {
        throw rejectedError;
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    source.close();
  }
}

export type EventSourceFactory = (
  url: string,
) => Pick<
  EventSource,
  "addEventListener" | "close" | "onerror" | "onmessage" | "removeEventListener"
>;
