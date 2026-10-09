// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useChatSessions } from "../src/hooks/use-chat-sessions";

const { createSession, fetchMessages, fetchSessions } = vi.hoisted(() => ({
  createSession: vi.fn(),
  fetchMessages: vi.fn(),
  fetchSessions: vi.fn(),
}));

vi.mock("../src/lib/server-api", () => ({ createSession, fetchMessages, fetchSessions }));

afterEach(() => vi.clearAllMocks());

describe("new chat transition", () => {
  it("blocks sends until the newly created session is active", async () => {
    fetchSessions.mockResolvedValue({ sessions: [{ id: "old", title: "Old" }] });
    fetchMessages.mockResolvedValue({ messages: [] });
    let finishCreation!: (value: unknown) => void;
    createSession.mockReturnValue(new Promise((resolve) => { finishCreation = resolve; }));

    const { result } = renderHook(() => useChatSessions({ canvasId: "canvas", accessToken: "token" }));
    await waitFor(() => expect(result.current.sessionsLoading).toBe(false));
    expect(result.current.activeSessionId).toBe("old");

    let transition!: Promise<void>;
    act(() => { transition = result.current.handleNewChat(); });
    expect(result.current.creatingSessionRef.current).toBe(true);
    expect(result.current.sessionsLoading).toBe(true);
    expect(result.current.activeSessionIdRef.current).toBe("old");

    await act(async () => {
      finishCreation({ session: { id: "new", title: "New Chat" } });
      await transition;
    });
    expect(result.current.activeSessionId).toBe("new");
    expect(result.current.creatingSessionRef.current).toBe(false);
    expect(result.current.sessionsLoading).toBe(false);
  });
});
