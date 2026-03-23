// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: mockReplace })),
}));

vi.mock("../src/lib/supabase-browser", () => {
  const mockOnAuthStateChange = vi.fn();
  const mockGetSession = vi.fn();
  return {
    getSupabaseBrowserClient: vi.fn(() => ({
      auth: {
        onAuthStateChange: mockOnAuthStateChange,
        getSession: mockGetSession,
        signOut: vi.fn(),
      },
    })),
    __mockOnAuthStateChange: mockOnAuthStateChange,
    __mockGetSession: mockGetSession,
  };
});

import CallbackPage from "../src/app/auth/callback/page";
import { AuthProvider } from "../src/lib/auth-context";
import { __mockOnAuthStateChange, __mockGetSession } from "../src/lib/supabase-browser";

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
    (__mockGetSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session },
      error: null,
    });
    (__mockOnAuthStateChange as ReturnType<typeof vi.fn>).mockReturnValue({
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
    (__mockGetSession as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}), // never resolves
    );
    (__mockOnAuthStateChange as ReturnType<typeof vi.fn>).mockReturnValue({
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
