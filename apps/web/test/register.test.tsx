// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFetchViewer,
  mockGetSession,
  mockOnAuthStateChange,
  mockReplace,
  mockSignUp,
} = vi.hoisted(() => ({
  mockFetchViewer: vi.fn().mockResolvedValue({
    workspace: { id: "w1" },
    profile: { id: "u1" },
    membership: { workspaceId: "w1", userId: "u1", role: "owner" },
  }),
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockReplace: vi.fn(),
  mockSignUp: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
}));

vi.mock("../src/lib/server-api", () => ({
  fetchViewer: mockFetchViewer,
}));

vi.mock("../src/lib/supabase-browser", () => ({
  getSupabaseBrowserClient: vi.fn(() => ({
    auth: {
      signUp: mockSignUp,
      onAuthStateChange: mockOnAuthStateChange,
      getSession: mockGetSession,
      signOut: vi.fn(),
    },
  })),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: mockReplace })),
}));

import RegisterPage from "../src/app/register/page";
import { AuthProvider } from "../src/lib/auth-context";

describe("Register page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("creates an account and shows the confirmation state", async () => {
    render(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>,
    );

    fireEvent.change(await screen.findByLabelText(/^email$/i), {
      target: { value: "new-user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "password-123" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "new-user@example.com",
        password: "password-123",
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
    });

    expect((await screen.findByText(/check your email/i)).textContent).toContain("Check your email");
    expect(screen.getByRole("link", { name: /sign in/i }).getAttribute("href")).toBe("/login");
  });

  it("bootstraps the viewer when sign-up returns an active session", async () => {
    mockSignUp.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "fresh-token",
          user: { id: "u1", email: "new-user@example.com" },
        },
      },
      error: null,
    });

    render(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>,
    );

    fireEvent.change(await screen.findByLabelText(/^email$/i), {
      target: { value: "new-user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "password-123" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(mockFetchViewer).toHaveBeenCalledWith("fresh-token");
      expect(mockReplace).toHaveBeenCalledWith("/home");
    });
  });
});
