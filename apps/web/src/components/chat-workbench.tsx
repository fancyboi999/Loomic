"use client";

import type { StreamEvent } from "@loomic/shared";
import { type FormEvent, useState } from "react";

import { createRun } from "../lib/server-api";
import { streamEvents } from "../lib/stream-events";

const initialPrompt = "Help me outline a short product launch storyboard.";

type WorkbenchStatus = "idle" | "running" | "completed" | "canceled" | "failed";

type ToolActivity = {
  outputSummary: string | null;
  status: "running" | "completed";
  toolCallId: string;
  toolName: string;
};

function statusClasses(status: WorkbenchStatus): string {
  switch (status) {
    case "completed":
      return "text-green-800 bg-green-100";
    case "canceled":
      return "text-yellow-800 bg-yellow-100";
    case "failed":
      return "text-red-800 bg-red-100";
    default:
      return "text-neutral-600 bg-neutral-100";
  }
}

export function ChatWorkbench() {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [assistantResponse, setAssistantResponse] = useState("");
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [status, setStatus] = useState<WorkbenchStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssistantResponse("");
    setEvents([]);
    setErrorMessage(null);
    setStatus("running");
    setToolActivities([]);

    try {
      const run = await createRun({
        sessionId: "session_demo",
        conversationId: "conversation_demo",
        prompt,
      });

      let terminalStatus: WorkbenchStatus | null = null;

      for await (const streamEvent of streamEvents(run.runId)) {
        setEvents((current) => [...current, streamEvent]);

        switch (streamEvent.type) {
          case "message.delta":
            setAssistantResponse((current) => current + streamEvent.delta);
            break;
          case "run.canceled":
            terminalStatus = "canceled";
            setStatus("canceled");
            break;
          case "run.completed":
            terminalStatus = "completed";
            setStatus("completed");
            break;
          case "run.failed":
            terminalStatus = "failed";
            setErrorMessage(streamEvent.error.message);
            setStatus("failed");
            break;
          case "tool.completed":
            setToolActivities((current) =>
              current.map((activity) =>
                activity.toolCallId === streamEvent.toolCallId
                  ? {
                      ...activity,
                      outputSummary: streamEvent.outputSummary ?? null,
                      status: "completed",
                    }
                  : activity,
              ),
            );
            break;
          case "tool.started":
            setToolActivities((current) => [
              ...current.filter(
                (activity) => activity.toolCallId !== streamEvent.toolCallId,
              ),
              {
                outputSummary: null,
                status: "running",
                toolCallId: streamEvent.toolCallId,
                toolName: streamEvent.toolName,
              },
            ]);
            break;
          default:
            break;
        }
      }

      if (!terminalStatus) {
        setStatus("completed");
      }
    } catch (error) {
      setStatus("failed");
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to start Loomic run.",
      );
    }
  }

  return (
    <section className="mx-auto max-w-[920px] px-6 py-12 text-foreground">
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Loomic Phase A
        </p>
        <h1 className="text-4xl font-bold leading-[0.95] md:text-5xl">
          Runtime Chat Workbench
        </h1>
        <p className="max-w-[40rem] text-base leading-relaxed text-muted-foreground">
          Directly calls the Loomic server, renders incremental assistant
          output, and surfaces tool lifecycle events from the real runtime.
        </p>
      </div>

      <form
        aria-label="chat composer"
        className="grid gap-3 rounded-3xl border border-border bg-white/90 p-6 shadow-lg"
        onSubmit={handleSubmit}
      >
        <label className="text-sm font-bold" htmlFor="prompt">
          Prompt
        </label>
        <textarea
          className="min-h-[140px] resize-y rounded-2xl border border-border bg-neutral-50 p-4 font-[inherit]"
          id="prompt"
          name="prompt"
          rows={5}
          value={prompt}
          onChange={(inputEvent) => setPrompt(inputEvent.target.value)}
        />
        <button
          className="justify-self-start rounded-full border-0 bg-gradient-to-br from-[#16395d] to-[#217f80] px-5 py-3 font-bold text-white cursor-pointer disabled:cursor-progress disabled:opacity-70"
          disabled={status === "running"}
          type="submit"
        >
          {status === "running" ? "Running..." : "Start Run"}
        </button>
      </form>

      <output
        aria-live="polite"
        className={`my-4 inline-flex items-center gap-2 rounded-full px-3.5 py-2.5 ${statusClasses(status)}`}
      >
        <strong>Status:</strong> {formatStatus(status)}
      </output>

      {errorMessage ? (
        <p className="font-bold text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-1.5 grid gap-6 grid-cols-1 md:grid-cols-2">
        <section
          aria-label="assistant response"
          className="rounded-3xl border border-border bg-white/90 p-6 shadow-lg"
        >
          <h2>Assistant Response</h2>
          <div className="rounded-2xl bg-neutral-100 p-6">
            {assistantResponse ? (
              <p className="m-0 leading-relaxed">{assistantResponse}</p>
            ) : (
              <p className="m-0 leading-relaxed text-muted-foreground">
                {status === "running"
                  ? "Waiting for the first delta..."
                  : "No assistant response yet."}
              </p>
            )}
          </div>
        </section>

        <section
          aria-label="tool activity"
          className="rounded-3xl border border-border bg-white/90 p-6 shadow-lg"
        >
          <h2>Tool Activity</h2>
          <ul className="grid gap-3 p-0 m-0 list-none">
            {toolActivities.length === 0 ? (
              <li className="rounded-2xl bg-neutral-100 p-6 text-muted-foreground">
                No tool activity yet.
              </li>
            ) : (
              toolActivities.map((activity) => (
                <li
                  className="rounded-2xl bg-neutral-100 p-6"
                  key={activity.toolCallId}
                >
                  <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
                    <strong>{activity.toolName}</strong>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
                        activity.status === "completed"
                          ? "bg-green-100 text-green-800"
                          : "bg-neutral-200 text-neutral-700"
                      }`}
                    >
                      {activity.status}
                    </span>
                  </div>
                  <p className="mt-2.5 text-sm text-muted-foreground">
                    call id: {activity.toolCallId}
                  </p>
                  {activity.outputSummary ? (
                    <p className="mt-3 m-0 leading-relaxed">
                      {activity.outputSummary}
                    </p>
                  ) : (
                    <p className="m-0 leading-relaxed text-muted-foreground">
                      Waiting for tool output...
                    </p>
                  )}
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <section
        aria-label="stream timeline"
        className="mt-6 rounded-3xl border border-border bg-white/90 p-6 shadow-lg"
      >
        <h2>Stream Timeline</h2>
        <ol className="grid gap-3 p-0 m-0 list-none">
          {events.length === 0 ? (
            <li className="rounded-2xl bg-neutral-100 p-6 text-muted-foreground">
              No events yet.
            </li>
          ) : (
            events.map((streamEvent, index) => (
              <li
                className="rounded-2xl bg-neutral-100 p-6"
                key={`${streamEvent.type}-${index}`}
              >
                <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
                  <code className="text-blue-900">{streamEvent.type}</code>
                  <span className="text-neutral-600 text-right max-sm:text-left">
                    {describeEvent(streamEvent)}
                  </span>
                </div>
              </li>
            ))
          )}
        </ol>
      </section>
    </section>
  );
}

function formatStatus(status: WorkbenchStatus) {
  switch (status) {
    case "completed":
      return "completed";
    case "canceled":
      return "canceled";
    case "failed":
      return "failed";
    case "running":
      return "running";
    default:
      return "idle";
  }
}

function describeEvent(event: StreamEvent) {
  switch (event.type) {
    case "message.delta":
      return event.delta;
    case "run.failed":
      return event.error.message;
    case "tool.completed":
      return event.outputSummary ?? `${event.toolName} finished.`;
    case "tool.started":
      return `${event.toolName} started.`;
    default:
      return `run ${event.runId}`;
  }
}
