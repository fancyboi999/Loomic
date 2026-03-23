// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: mockReplace })),
}));

const { mockOnAuthStateChange, mockGetSession } = vi.hoisted(() => ({
  mockOnAuthStateChange: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock("../src/lib/supabase-browser", () => ({
  getSupabaseBrowserClient: vi.fn(() => ({
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
      getSession: mockGetSession,
      signOut: vi.fn(),
    },
  })),
}));

import CallbackPage from "../src/app/auth/callback/page";
import { AuthProvider } from "../src/lib/auth-context";

describe("Auth callback page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("redirects to /projects when session is resolved", async () => {
    const session = {
      access_token: "tok",
      user: { id: "u1", email: "a@b.com" },
    };
    mockGetSession.mockResolvedValue({
      data: { session },
      error: null,
    });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    render(
      <AuthProvider>
        <CallbackPage />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/projects");
    });
  });

  it("shows a loading spinner while processing", () => {
    mockGetSession.mockReturnValue(
      new Promise(() => {}), // never resolves
    );
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    render(
      <AuthProvider>
        <CallbackPage />
      </AuthProvider>,
    );

    expect(screen.getByText(/signing you in/i)).toBeInTheDocument();
  });
});
