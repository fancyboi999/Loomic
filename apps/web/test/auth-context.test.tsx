// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

// Mock supabase-browser before importing auth-context
vi.mock("../src/lib/supabase-browser", () => {
  const mockOnAuthStateChange = vi.fn();
  const mockGetSession = vi.fn();
  const mockSignOut = vi.fn();
  return {
    getSupabaseBrowserClient: vi.fn(() => ({
      auth: {
        onAuthStateChange: mockOnAuthStateChange,
        getSession: mockGetSession,
        signOut: mockSignOut,
      },
    })),
    __mockOnAuthStateChange: mockOnAuthStateChange,
    __mockGetSession: mockGetSession,
    __mockSignOut: mockSignOut,
  };
});

import { AuthProvider, useAuth } from "../src/lib/auth-context";
import {
  __mockOnAuthStateChange,
  __mockGetSession,
} from "../src/lib/supabase-browser";

function TestConsumer() {
  const { user, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user?.email ?? "none"}</span>
    </div>
  );
}

describe("AuthProvider", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (__mockGetSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: null },
      error: null,
    });
    (__mockOnAuthStateChange as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it("starts in loading state then resolves to no user", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("user").textContent).toBe("none");
  });

  it("exposes user when session exists", async () => {
    const mockSession = {
      access_token: "token_123",
      user: { id: "user_1", email: "test@test.com" },
    };
    (__mockGetSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("test@test.com");
    });
  });
});
