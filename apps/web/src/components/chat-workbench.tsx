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
    <section className="chat-workbench">
      <div className="hero">
        <p className="eyebrow">Loomic Phase A</p>
        <h1>Runtime Chat Workbench</h1>
        <p className="description">
          Directly calls the Loomic server, renders incremental assistant
          output, and surfaces tool lifecycle events from the real runtime.
        </p>
      </div>

      <form
        aria-label="chat composer"
        className="composer"
        onSubmit={handleSubmit}
      >
        <label htmlFor="prompt">Prompt</label>
        <textarea
          id="prompt"
          name="prompt"
          rows={5}
          value={prompt}
          onChange={(inputEvent) => setPrompt(inputEvent.target.value)}
        />
        <button disabled={status === "running"} type="submit">
          {status === "running" ? "Running..." : "Start Run"}
        </button>
      </form>

      <output
        aria-live="polite"
        className={`stream-status stream-status--${status}`}
      >
        <strong>Status:</strong> {formatStatus(status)}
      </output>

      {errorMessage ? (
        <p className="error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="panels">
        <section aria-label="assistant response" className="panel">
          <h2>Assistant Response</h2>
          <div className="assistant-card">
            {assistantResponse ? (
              <p>{assistantResponse}</p>
            ) : (
              <p className="placeholder">
                {status === "running"
                  ? "Waiting for the first delta..."
                  : "No assistant response yet."}
              </p>
            )}
          </div>
        </section>

        <section aria-label="tool activity" className="panel">
          <h2>Tool Activity</h2>
          <ul className="tool-list">
            {toolActivities.length === 0 ? (
              <li className="tool-card placeholder">No tool activity yet.</li>
            ) : (
              toolActivities.map((activity) => (
                <li className="tool-card" key={activity.toolCallId}>
                  <div className="tool-header">
                    <strong>{activity.toolName}</strong>
                    <span
                      className={`tool-badge tool-badge--${activity.status}`}
                    >
                      {activity.status}
                    </span>
                  </div>
                  <p className="tool-id">call id: {activity.toolCallId}</p>
                  {activity.outputSummary ? (
                    <p className="tool-summary">{activity.outputSummary}</p>
                  ) : (
                    <p className="placeholder">Waiting for tool output...</p>
                  )}
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <section aria-label="stream timeline" className="event-log">
        <h2>Stream Timeline</h2>
        <ol>
          {events.length === 0 ? (
            <li className="placeholder">No events yet.</li>
          ) : (
            events.map((streamEvent, index) => (
              <li key={`${streamEvent.type}-${index}`}>
                <div className="timeline-row">
                  <code>{streamEvent.type}</code>
                  <span>{describeEvent(streamEvent)}</span>
                </div>
              </li>
            ))
          )}
        </ol>
      </section>

      <style>{`
        .chat-workbench {
          margin: 0 auto;
          max-width: 920px;
          padding: 48px 24px 72px;
          color: #132238;
        }

        .hero {
          margin-bottom: 28px;
        }

        .eyebrow {
          margin: 0 0 8px;
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #4f6f8f;
        }

        h1 {
          margin: 0;
          font-size: clamp(2.2rem, 6vw, 4rem);
          line-height: 0.95;
        }

        .description {
          max-width: 40rem;
          color: #51657d;
          font-size: 1rem;
          line-height: 1.6;
        }

        .composer,
        .panel,
        .event-log {
          border: 1px solid #d7e2ee;
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.88);
          box-shadow: 0 18px 50px rgba(32, 57, 87, 0.08);
        }

        .composer {
          display: grid;
          gap: 12px;
          padding: 24px;
        }

        label {
          font-size: 0.9rem;
          font-weight: 700;
        }

        textarea {
          resize: vertical;
          min-height: 140px;
          border: 1px solid #b9c7d6;
          border-radius: 18px;
          padding: 16px;
          font: inherit;
          background: #f7fafc;
        }

        button {
          justify-self: start;
          border: 0;
          border-radius: 999px;
          padding: 12px 20px;
          font: inherit;
          font-weight: 700;
          color: #fdfdfc;
          background: linear-gradient(135deg, #16395d, #217f80);
          cursor: pointer;
        }

        button[disabled] {
          cursor: progress;
          opacity: 0.72;
        }

        .stream-status {
          margin: 18px 0;
          color: #44576d;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 999px;
          background: #eef4fa;
        }

        .stream-status--completed {
          color: #1d5a43;
          background: #e6f6ef;
        }

        .stream-status--canceled {
          color: #7a5a14;
          background: #fff5da;
        }

        .stream-status--failed {
          color: #8f2e2e;
          background: #fde8e8;
        }

        .error {
          color: #a53d3d;
          font-weight: 700;
        }

        .panels {
          display: grid;
          gap: 24px;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          margin-top: 6px;
        }

        .panel {
          padding: 24px;
        }

        .panel h2,
        .event-log {
          margin-top: 24px;
        }

        .panel h2,
        .event-log h2 {
          margin-top: 0;
        }

        .assistant-card,
        .tool-card,
        .event-log li {
          border-radius: 18px;
          padding: 24px;
          background: #eff5fb;
        }

        .assistant-card p,
        .tool-card p {
          margin: 0;
          line-height: 1.6;
        }

        .tool-list,
        .event-log ol {
          display: grid;
          gap: 12px;
          padding: 0;
          margin: 0;
          list-style: none;
        }

        .tool-header,
        .timeline-row {
          display: flex;
          gap: 12px;
          align-items: center;
          justify-content: space-between;
        }

        .tool-badge {
          border-radius: 999px;
          padding: 4px 10px;
          font-size: 0.78rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          background: #dce8f5;
          color: #365777;
        }

        .tool-badge--completed {
          background: #dcf5e8;
          color: #1f694d;
        }

        .tool-id {
          margin-top: 10px;
          color: #5b7087;
          font-size: 0.88rem;
        }

        .tool-summary {
          margin-top: 12px;
        }

        .placeholder {
          color: #5b7087;
        }

        .event-log {
          padding: 24px;
        }

        .event-log code {
          color: #1d486a;
        }

        .event-log span {
          color: #304c68;
          text-align: right;
        }

        @media (max-width: 640px) {
          .timeline-row,
          .tool-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .event-log span {
            text-align: left;
          }
        }
      `}</style>
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
