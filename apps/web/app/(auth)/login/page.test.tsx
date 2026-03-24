import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock auth-context
const mockLogin = vi.fn();
const mockAuthValue = {
  user: null,
  workspace: null,
  members: [],
  agents: [],
  isLoading: false,
  login: mockLogin,
  logout: vi.fn(),
  refreshMembers: vi.fn(),
  refreshAgents: vi.fn(),
  getMemberName: () => "Unknown",
  getAgentName: () => "Unknown Agent",
  getActorName: () => "System",
  getActorInitials: () => "XX",
};

vi.mock("../../../lib/auth-context", () => ({
  useAuth: () => mockAuthValue,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import LoginPage from "./page";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders login form with heading, inputs, and button", () => {
    render(<LoginPage />);

    expect(screen.getByText("Multica")).toBeInTheDocument();
    expect(screen.getByText("AI-native task management")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("does not call login when email is empty", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    // The email input has required attribute, so browser validation blocks submit
    // Verify login was never called
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("calls login with correct args on submit", async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText("Email"), "test@multica.ai");
    await user.type(screen.getByPlaceholderText("Name"), "Test User");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("test@multica.ai", "Test User", undefined);
    });
  });

  it("calls login with email only when name is empty", async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText("Email"), "test@multica.ai");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("test@multica.ai", undefined, undefined);
    });
  });

  it("shows 'Signing in...' while submitting", async () => {
    // Make login hang
    mockLogin.mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText("Email"), "test@multica.ai");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByText("Signing in...")).toBeInTheDocument();
    });
  });

  it("shows error when login fails", async () => {
    mockLogin.mockRejectedValueOnce(new Error("Network error"));
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText("Email"), "test@multica.ai");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(
        screen.getByText("Login failed. Make sure the server is running."),
      ).toBeInTheDocument();
    });
  });
});
