"use client";

import type { StreamEvent } from "@loomic/shared";
import { type FormEvent, useState } from "react";

import { createRun } from "../lib/server-api";
import { streamEvents } from "../lib/stream-events";

const initialPrompt = "Help me outline a short product launch storyboard.";

export function ChatWorkbench() {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "failed">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEvents([]);
    setErrorMessage(null);
    setStatus("running");

    try {
      const run = await createRun({
        sessionId: "session_demo",
        conversationId: "conversation_demo",
        prompt,
      });

      for await (const streamEvent of streamEvents(run.runId)) {
        setEvents((current) => [...current, streamEvent]);
        if (streamEvent.type === "run.failed") {
          setStatus("failed");
        }
      }

      setStatus("idle");
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
        <p className="eyebrow">Loomic Phase D</p>
        <h1>Minimal Chat Workbench</h1>
        <p className="description">
          Directly calls the Loomic server and renders streamed SSE events.
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

      <div aria-live="polite" className="stream-status">
        <strong>Status:</strong> {status}
      </div>

      {errorMessage ? <p className="error">{errorMessage}</p> : null}

      <section aria-label="streamed event log" className="event-log">
        <h2>Streamed Event Log</h2>
        <ul>
          {events.length === 0 ? (
            <li>No events yet.</li>
          ) : (
            events.map((streamEvent, index) => (
              <li key={`${streamEvent.type}-${index}`}>
                <code>{streamEvent.type}</code>
                <pre>{JSON.stringify(streamEvent, null, 2)}</pre>
              </li>
            ))
          )}
        </ul>
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
        }

        .error {
          color: #a53d3d;
          font-weight: 700;
        }

        .event-log {
          margin-top: 24px;
          padding: 24px;
        }

        .event-log ul {
          display: grid;
          gap: 12px;
          padding: 0;
          margin: 0;
          list-style: none;
        }

        .event-log li {
          border-radius: 18px;
          padding: 16px;
          background: #eff5fb;
        }

        .event-log pre {
          margin: 10px 0 0;
          overflow: auto;
          white-space: pre-wrap;
          word-break: break-word;
          color: #27425f;
        }
      `}</style>
    </section>
  );
}
