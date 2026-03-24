// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatSidebar } from "../src/components/chat-sidebar";

const {
  createRunMock,
  createSessionMock,
  deleteSessionMock,
  fetchMessagesMock,
  fetchSessionsMock,
  saveMessageMock,
  streamEventsMock,
  updateSessionTitleMock,
} = vi.hoisted(() => ({
  createRunMock: vi.fn(),
  createSessionMock: vi.fn(),
  deleteSessionMock: vi.fn(),
  fetchMessagesMock: vi.fn(),
  fetchSessionsMock: vi.fn(),
  saveMessageMock: vi.fn(),
  streamEventsMock: vi.fn(),
  updateSessionTitleMock: vi.fn(),
}));

vi.mock("../src/lib/server-api", () => ({
  createRun: createRunMock,
  createSession: createSessionMock,
  deleteSession: deleteSessionMock,
  fetchMessages: fetchMessagesMock,
  fetchSessions: fetchSessionsMock,
  saveMessage: saveMessageMock,
  updateSessionTitle: updateSessionTitleMock,
}));

vi.mock("../src/lib/stream-events", () => ({
  streamEvents: streamEventsMock,
}));

describe("ChatSidebar", () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
    createRunMock.mockReset();
    createRunMock.mockResolvedValue({
      runId: "run_123",
      sessionId: "session-real",
      conversationId: "canvas-1",
      status: "accepted",
    });
    createSessionMock.mockReset();
    createSessionMock.mockResolvedValue({
      session: {
        id: "session-created",
        title: "New Chat",
        updatedAt: "2026-03-24T00:00:00.000Z",
      },
    });
    deleteSessionMock.mockReset();
    fetchMessagesMock.mockReset();
    fetchMessagesMock.mockResolvedValue({ messages: [] });
    fetchSessionsMock.mockReset();
    fetchSessionsMock.mockResolvedValue({
      sessions: [
        {
          id: "session-real",
          title: "Existing Chat",
          updatedAt: "2026-03-24T00:00:00.000Z",
        },
      ],
    });
    saveMessageMock.mockReset();
    saveMessageMock.mockResolvedValue(undefined);
    updateSessionTitleMock.mockReset();
    updateSessionTitleMock.mockResolvedValue(undefined);
    streamEventsMock.mockReset();
    streamEventsMock.mockImplementation(async function* () {});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("creates runs with the active real session id instead of a fabricated canvas-derived id", async () => {
    render(
      <ChatSidebar
        accessToken="token_abc"
        canvasId="canvas-1"
        open
        onToggle={() => {}}
      />,
    );

    const input = await screen.findByPlaceholderText(
      /start with an idea/i,
    );
    await userEvent.type(input, "hello loom{Enter}");

    await waitFor(() =>
      expect(createRunMock).toHaveBeenCalledWith(
        {
          sessionId: "session-real",
          conversationId: "canvas-1",
          prompt: "hello loom",
        },
        {
          accessToken: "token_abc",
        },
      ),
    );
    expect(createRunMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-canvas-1",
      }),
      expect.anything(),
    );
  });
});
