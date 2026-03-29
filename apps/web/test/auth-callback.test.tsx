// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockReplace = vi.fn();
let currentSearchParams = new URLSearchParams();

const { mockExchangeCodeForSession, mockFetchViewer } = vi.hoisted(() => ({
  mockExchangeCodeForSession: vi.fn(),
  mockFetchViewer: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: mockReplace })),
  useSearchParams: vi.fn(() => ({
    get: (key: string) => currentSearchParams.get(key),
  })),
}));

vi.mock("../src/lib/supabase-browser", () => ({
  getSupabaseBrowserClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  })),
}));

vi.mock("../src/lib/server-api", () => ({
  ApiApplicationError: class ApiApplicationError extends Error {},
  ApiAuthError: class ApiAuthError extends Error {},
  fetchViewer: mockFetchViewer,
}));

import CallbackPage from "../src/app/auth/callback/page";

describe("Auth callback page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("exchanges the code, bootstraps viewer, and redirects to /home", async () => {
    currentSearchParams = new URLSearchParams("code=magic-code");
    mockExchangeCodeForSession.mockResolvedValue({
      data: {
        session: {
          access_token: "viewer-token",
          user: { id: "u1", email: "a@b.com" },
        },
      },
      error: null,
    });
    mockFetchViewer.mockResolvedValue({
      workspace: { id: "w1" },
      profile: { id: "u1" },
      membership: { workspaceId: "w1", userId: "u1", role: "owner" },
    });

    render(<CallbackPage />);

    await waitFor(() => {
      expect(mockExchangeCodeForSession).toHaveBeenCalledWith("magic-code");
      expect(mockFetchViewer).toHaveBeenCalledWith("viewer-token");
      expect(mockReplace).toHaveBeenCalledWith("/home");
    });
  });

  it("redirects to login with a concise code when exchange fails", async () => {
    currentSearchParams = new URLSearchParams("code=broken-code");
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: "link expired" },
    });

    render(<CallbackPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login?error=auth_exchange_failed");
    });
  });

  it("redirects to login with a concise code when the callback is missing a code", async () => {
    render(<CallbackPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        "/login?error=auth_callback_missing_code",
      );
    });
  });

  it("redirects to login when the auth provider returns an error", async () => {
    currentSearchParams = new URLSearchParams("error=access_denied");

    render(<CallbackPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login?error=access_denied");
    });
  });

  it("redirects to login when viewer bootstrap fails after a successful exchange", async () => {
    currentSearchParams = new URLSearchParams("code=magic-code");
    mockExchangeCodeForSession.mockResolvedValue({
      data: {
        session: {
          access_token: "viewer-token",
          user: { id: "u1", email: "a@b.com" },
        },
      },
      error: null,
    });
    mockFetchViewer.mockRejectedValue(new Error("bootstrap failed"));

    render(<CallbackPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        "/login?error=viewer_bootstrap_failed",
      );
    });
  });

  it("redirects to login when the callback times out", async () => {
    vi.useFakeTimers();
    currentSearchParams = new URLSearchParams("code=slow-code");
    mockExchangeCodeForSession.mockReturnValue(new Promise(() => {}));

    render(<CallbackPage />);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(mockReplace).toHaveBeenCalledWith(
      "/login?error=auth_callback_timeout",
    );
  });
});
