// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFetchViewer,
  mockGetSession,
  mockOnAuthStateChange,
  mockSignInWithOtp,
  mockSignInWithPassword,
  mockSignInWithOAuth,
  mockReplace,
  mockSearchParams,
} = vi.hoisted(() => ({
  mockFetchViewer: vi.fn().mockResolvedValue({
    workspace: { id: "w1" },
    profile: { id: "u1" },
    membership: { workspaceId: "w1", userId: "u1", role: "owner" },
  }),
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockSignInWithOtp: vi.fn().mockResolvedValue({ error: null }),
  mockSignInWithPassword: vi.fn().mockResolvedValue({
    data: {
      session: {
        access_token: "session-token",
        user: { id: "u1", email: "user@example.com" },
      },
    },
    error: null,
  }),
  mockSignInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
  mockReplace: vi.fn(),
  mockSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("../src/lib/server-api", () => ({
  fetchViewer: mockFetchViewer,
}));

vi.mock("../src/lib/supabase-browser", () => ({
  getSupabaseBrowserClient: vi.fn(() => ({
    auth: {
      signInWithOtp: mockSignInWithOtp,
      signInWithPassword: mockSignInWithPassword,
      signInWithOAuth: mockSignInWithOAuth,
      onAuthStateChange: mockOnAuthStateChange,
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: mockReplace })),
  useSearchParams: mockSearchParams,
}));

import LoginPage from "../src/app/login/page";
import { AuthProvider } from "../src/lib/auth-context";

describe("Login page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mockSearchParams.mockReturnValue(new URLSearchParams());
  });

  afterEach(() => {
    cleanup();
  });

  it("renders split screen with brand panel and login form", async () => {
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );
    expect((await screen.findByText("Loomic")).textContent).toBe("Loomic");
    expect(screen.getByText(/Send login link/i).textContent).toContain("Send login link");
    expect(screen.getByText(/Continue with Google/i).textContent).toContain("Continue with Google");
    expect(screen.getByRole("link", { name: /create one/i }).getAttribute("href")).toBe("/register");
  });

  it("shows callback errors from the query string as a banner", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("error=auth_exchange_failed"));

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "This sign-in link could not be verified. Request a new one and try again.",
    );
  });

  it("sends a login-only magic link", async () => {
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    fireEvent.change(await screen.findByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send login link/i }));

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith({
        email: "user@example.com",
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: false,
        },
      });
    });
  });

  it("bootstraps the viewer before redirecting after password sign-in", async () => {
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /use password instead/i }));
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "password-123",
      });
      expect(mockFetchViewer).toHaveBeenCalledWith("session-token");
      expect(mockReplace).toHaveBeenCalledWith("/home");
    });
  });
});
