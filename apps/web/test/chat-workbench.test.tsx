// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "../src/app/page";
import { getServerBaseUrl } from "../src/lib/env";

class MockEventSource {
  static instances: MockEventSource[] = [];

  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  url: string;
  #listeners = new Map<string, Set<() => void>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    setTimeout(() => this.#emit("open"), 0);
  }

  addEventListener(type: string, listener: () => void) {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void) {
    this.#listeners.get(type)?.delete(listener);
  }

  close() {
    this.#listeners.clear();
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  #emit(type: string) {
    for (const listener of this.#listeners.get(type) ?? []) {
      listener();
    }
  }
}

describe("ChatWorkbench", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "EventSource",
      MockEventSource as unknown as typeof EventSource,
    );
    MockEventSource.instances.length = 0;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        runId: "run_123",
        sessionId: "session_demo",
        conversationId: "conversation_demo",
        status: "accepted",
      }),
    } as Response);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders a minimal chat workbench with composer and event log", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("form", { name: /chat composer/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /start run/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /assistant response/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /tool activity/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /stream timeline/i }),
    ).toBeInTheDocument();
  });

  it("uses explicit server base url config for direct server requests", async () => {
    render(<HomePage />);

    await userEvent.click(screen.getByRole("button", { name: /start run/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `${getServerBaseUrl()}/api/agent/runs`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${getServerBaseUrl()}/api/agent/runs`,
    );
  });

  it("streams incoming SSE events into the UI incrementally", async () => {
    render(<HomePage />);

    await userEvent.click(screen.getByRole("button", { name: /start run/i }));

    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));

    const stream = MockEventSource.instances[0];
    expect(stream).toBeDefined();

    if (!stream) {
      throw new Error("Expected a mock stream instance.");
    }

    stream.emitMessage({
      type: "run.started",
      runId: "run_123",
      sessionId: "session_demo",
      conversationId: "conversation_demo",
      timestamp: "2026-03-23T12:00:00.000Z",
    });
    stream.emitMessage({
      type: "tool.started",
      runId: "run_123",
      toolCallId: "tool_call_123",
      toolName: "project_search",
      timestamp: "2026-03-23T12:00:00.500Z",
    });
    stream.emitMessage({
      type: "tool.completed",
      runId: "run_123",
      toolCallId: "tool_call_123",
      toolName: "project_search",
      outputSummary: "Found 1 workspace match.",
      timestamp: "2026-03-23T12:00:00.800Z",
    });
    stream.emitMessage({
      type: "message.delta",
      runId: "run_123",
      messageId: "message_123",
      delta: "Hello from Loomic",
      timestamp: "2026-03-23T12:00:01.000Z",
    });
    stream.emitMessage({
      type: "run.completed",
      runId: "run_123",
      timestamp: "2026-03-23T12:00:02.000Z",
    });

    const toolActivity = screen.getByRole("region", { name: /tool activity/i });
    expect(
      await within(toolActivity).findByText(/^project_search$/i),
    ).toBeInTheDocument();
    expect(
      await within(toolActivity).findByText(/^completed$/i),
    ).toBeInTheDocument();
    expect(
      await within(toolActivity).findByText(/Found 1 workspace match./i),
    ).toBeInTheDocument();
    const assistantResponse = screen.getByRole("region", {
      name: /assistant response/i,
    });
    expect(
      await within(assistantResponse).findByText(/Hello from Loomic/i),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/completed/i),
    );
  });

  it("treats run cancellation differently from transport failure", async () => {
    render(<HomePage />);

    await userEvent.click(screen.getByRole("button", { name: /start run/i }));
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));

    const stream = MockEventSource.instances[0];
    if (!stream) {
      throw new Error("Expected a mock stream instance.");
    }

    stream.emitMessage({
      type: "run.started",
      runId: "run_123",
      sessionId: "session_demo",
      conversationId: "conversation_demo",
      timestamp: "2026-03-23T12:00:00.000Z",
    });
    stream.emitMessage({
      type: "run.canceled",
      runId: "run_123",
      timestamp: "2026-03-23T12:00:02.000Z",
    });

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/canceled/i),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a failed state when the SSE transport errors", async () => {
    render(<HomePage />);

    await userEvent.click(screen.getByRole("button", { name: /start run/i }));
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));

    const stream = MockEventSource.instances[0];
    if (!stream) {
      throw new Error("Expected a mock stream instance.");
    }

    stream.onerror?.();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /failed to stream run events/i,
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/failed/i);
  });
});
