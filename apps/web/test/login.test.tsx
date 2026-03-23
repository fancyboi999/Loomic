// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock("../src/lib/supabase-browser", () => ({
  getSupabaseBrowserClient: vi.fn(() => ({
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: mockOnAuthStateChange,
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
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
    expect(await screen.findByText("Loomic")).toBeInTheDocument();
    expect(screen.getByText(/Send Magic Link/i)).toBeInTheDocument();
    expect(screen.getByText(/Continue with Google/i)).toBeInTheDocument();
  });

  it("renders email input field", async () => {
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );
    expect(await screen.findByPlaceholderText(/you@example\.com/i)).toBeInTheDocument();
  });
});
