import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { User, Workspace, MemberWithUser, Agent } from "@multica/types";

// Mock next/navigation
const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

// Must use vi.hoisted so the mock object is defined before vi.mock factory runs
const mockApi = vi.hoisted(() => ({
  setToken: vi.fn(),
  setWorkspaceId: vi.fn(),
  login: vi.fn(),
  getMe: vi.fn(),
  listWorkspaces: vi.fn(),
  listMembers: vi.fn(),
  listAgents: vi.fn(),
  createWorkspace: vi.fn(),
  updateMe: vi.fn(),
  leaveWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
}));

vi.mock("./api", () => ({
  api: mockApi,
}));

import { AuthProvider, useAuth } from "./auth-context";

const mockUser: User = {
  id: "user-1",
  name: "Test User",
  email: "test@multica.ai",
  avatar_url: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockWorkspace: Workspace = {
  id: "ws-1",
  name: "Test WS",
  slug: "test",
  description: null,
  settings: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockMembers: MemberWithUser[] = [
  {
    id: "member-1",
    workspace_id: "ws-1",
    user_id: "user-1",
    role: "owner",
    created_at: "2026-01-01T00:00:00Z",
    name: "Test User",
    email: "test@multica.ai",
    avatar_url: null,
  },
  {
    id: "member-2",
    workspace_id: "ws-1",
    user_id: "user-2",
    role: "member",
    created_at: "2026-01-01T00:00:00Z",
    name: "Other User",
    email: "other@multica.ai",
    avatar_url: null,
  },
];

const mockAgents: Agent[] = [
  {
    id: "agent-1",
    workspace_id: "ws-1",
    runtime_id: "runtime-1",
    name: "Claude",
    description: "",
    avatar_url: null,
    status: "idle",
    runtime_mode: "cloud",
    runtime_config: {},
    visibility: "workspace",
    max_concurrent_tasks: 3,
    owner_id: null,
    skills: "",
    tools: [],
    triggers: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage manually since jsdom may not have .clear()
    localStorage.removeItem("multica_token");
    localStorage.removeItem("multica_workspace_id");
  });

  it("starts with null user when no token stored", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.workspace).toBeNull();
  });

  it("login stores token and navigates to /issues", async () => {
    mockApi.login.mockResolvedValueOnce({ token: "test-jwt", user: mockUser });
    mockApi.listWorkspaces.mockResolvedValueOnce([mockWorkspace]);
    mockApi.listMembers.mockResolvedValueOnce(mockMembers);
    mockApi.listAgents.mockResolvedValueOnce(mockAgents);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login("test@multica.ai", "Test User");
    });

    expect(mockApi.login).toHaveBeenCalledWith("test@multica.ai", "Test User");
    expect(mockApi.setToken).toHaveBeenCalledWith("test-jwt");
    expect(localStorage.getItem("multica_token")).toBe("test-jwt");
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.workspace).toEqual(mockWorkspace);
    expect(result.current.members).toEqual(mockMembers);
    expect(result.current.agents).toEqual(mockAgents);
    expect(mockPush).toHaveBeenCalledWith("/issues");
  });

  it("logout clears state and navigates to /login", async () => {
    mockApi.login.mockResolvedValueOnce({ token: "test-jwt", user: mockUser });
    mockApi.listWorkspaces.mockResolvedValueOnce([mockWorkspace]);
    mockApi.listMembers.mockResolvedValueOnce(mockMembers);
    mockApi.listAgents.mockResolvedValueOnce(mockAgents);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login("test@multica.ai");
    });

    act(() => {
      result.current.logout();
    });

    expect(localStorage.getItem("multica_token")).toBeNull();
    expect(localStorage.getItem("multica_workspace_id")).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.workspace).toBeNull();
    expect(result.current.members).toEqual([]);
    expect(result.current.agents).toEqual([]);
    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("getMemberName returns correct name for known user", async () => {
    mockApi.login.mockResolvedValueOnce({ token: "test-jwt", user: mockUser });
    mockApi.listWorkspaces.mockResolvedValueOnce([mockWorkspace]);
    mockApi.listMembers.mockResolvedValueOnce(mockMembers);
    mockApi.listAgents.mockResolvedValueOnce(mockAgents);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login("test@multica.ai");
    });

    expect(result.current.getMemberName("user-1")).toBe("Test User");
    expect(result.current.getMemberName("user-2")).toBe("Other User");
    expect(result.current.getMemberName("unknown")).toBe("Unknown");
  });

  it("getAgentName returns correct name for known agent", async () => {
    mockApi.login.mockResolvedValueOnce({ token: "test-jwt", user: mockUser });
    mockApi.listWorkspaces.mockResolvedValueOnce([mockWorkspace]);
    mockApi.listMembers.mockResolvedValueOnce(mockMembers);
    mockApi.listAgents.mockResolvedValueOnce(mockAgents);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login("test@multica.ai");
    });

    expect(result.current.getAgentName("agent-1")).toBe("Claude");
    expect(result.current.getAgentName("unknown")).toBe("Unknown Agent");
  });

  it("getActorName dispatches to member or agent", async () => {
    mockApi.login.mockResolvedValueOnce({ token: "test-jwt", user: mockUser });
    mockApi.listWorkspaces.mockResolvedValueOnce([mockWorkspace]);
    mockApi.listMembers.mockResolvedValueOnce(mockMembers);
    mockApi.listAgents.mockResolvedValueOnce(mockAgents);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login("test@multica.ai");
    });

    expect(result.current.getActorName("member", "user-1")).toBe("Test User");
    expect(result.current.getActorName("agent", "agent-1")).toBe("Claude");
    expect(result.current.getActorName("system", "xxx")).toBe("System");
  });

  it("getActorInitials returns uppercase initials", async () => {
    mockApi.login.mockResolvedValueOnce({ token: "test-jwt", user: mockUser });
    mockApi.listWorkspaces.mockResolvedValueOnce([mockWorkspace]);
    mockApi.listMembers.mockResolvedValueOnce(mockMembers);
    mockApi.listAgents.mockResolvedValueOnce(mockAgents);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login("test@multica.ai");
    });

    expect(result.current.getActorInitials("member", "user-1")).toBe("TU");
    expect(result.current.getActorInitials("agent", "agent-1")).toBe("C");
  });

  it("initializes from localStorage token on mount", async () => {
    localStorage.setItem("multica_token", "stored-token");
    localStorage.setItem("multica_workspace_id", "ws-1");

    mockApi.getMe.mockResolvedValueOnce(mockUser);
    mockApi.listWorkspaces.mockResolvedValueOnce([mockWorkspace]);
    mockApi.listMembers.mockResolvedValueOnce(mockMembers);
    mockApi.listAgents.mockResolvedValueOnce(mockAgents);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockApi.setToken).toHaveBeenCalledWith("stored-token");
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.workspace).toEqual(mockWorkspace);
  });

  it("updateWorkspace updates workspace in context", async () => {
    mockApi.login.mockResolvedValueOnce({ token: "test-jwt", user: mockUser });
    mockApi.listWorkspaces.mockResolvedValueOnce([mockWorkspace]);
    mockApi.listMembers.mockResolvedValueOnce(mockMembers);
    mockApi.listAgents.mockResolvedValueOnce(mockAgents);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login("test@multica.ai");
    });

    expect(result.current.workspace?.name).toBe("Test WS");

    const updated: Workspace = { ...mockWorkspace, name: "Renamed WS", description: "new desc" };
    act(() => {
      result.current.updateWorkspace(updated);
    });

    expect(result.current.workspace?.name).toBe("Renamed WS");
    expect(result.current.workspace?.description).toBe("new desc");
  });

  it("clears token when stored token is invalid", async () => {
    localStorage.setItem("multica_token", "invalid-token");

    mockApi.getMe.mockRejectedValueOnce(new Error("Unauthorized"));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem("multica_token")).toBeNull();
  });

  it("initialization prefers stored workspace ID from list", async () => {
    const mockWorkspace2: Workspace = {
      id: "ws-2",
      name: "Second WS",
      slug: "second",
      description: null,
      settings: {},
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    localStorage.setItem("multica_token", "stored-token");
    localStorage.setItem("multica_workspace_id", "ws-2");

    mockApi.getMe.mockResolvedValueOnce(mockUser);
    mockApi.listWorkspaces.mockResolvedValueOnce([mockWorkspace, mockWorkspace2]);
    mockApi.listMembers.mockResolvedValueOnce(mockMembers);
    mockApi.listAgents.mockResolvedValueOnce(mockAgents);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.workspace).toEqual(mockWorkspace2);
    expect(result.current.workspaces).toHaveLength(2);
  });

  it("initialization falls back to first workspace when stored ID not in list", async () => {
    localStorage.setItem("multica_token", "stored-token");
    localStorage.setItem("multica_workspace_id", "ws-deleted");

    mockApi.getMe.mockResolvedValueOnce(mockUser);
    mockApi.listWorkspaces.mockResolvedValueOnce([mockWorkspace]);
    mockApi.listMembers.mockResolvedValueOnce(mockMembers);
    mockApi.listAgents.mockResolvedValueOnce(mockAgents);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.workspace).toEqual(mockWorkspace);
  });

  it("createWorkspace calls API and adds to workspaces list", async () => {
    mockApi.login.mockResolvedValueOnce({ token: "test-jwt", user: mockUser });
    mockApi.listWorkspaces.mockResolvedValueOnce([mockWorkspace]);
    mockApi.listMembers.mockResolvedValueOnce(mockMembers);
    mockApi.listAgents.mockResolvedValueOnce(mockAgents);

    const newWs: Workspace = {
      id: "ws-new",
      name: "New WS",
      slug: "new-ws",
      description: null,
      settings: {},
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    mockApi.createWorkspace.mockResolvedValueOnce(newWs);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login("test@multica.ai");
    });

    let created: Workspace | undefined;
    await act(async () => {
      created = await result.current.createWorkspace({ name: "New WS", slug: "new-ws" });
    });

    expect(mockApi.createWorkspace).toHaveBeenCalledWith({ name: "New WS", slug: "new-ws" });
    expect(created).toEqual(newWs);
    expect(result.current.workspaces).toHaveLength(2);
    expect(result.current.workspaces[1]).toEqual(newWs);
  });

  it("switchWorkspace updates context and calls setWorkspaceId", async () => {
    const mockWorkspace2: Workspace = {
      id: "ws-2",
      name: "Second WS",
      slug: "second",
      description: null,
      settings: {},
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    mockApi.login.mockResolvedValueOnce({ token: "test-jwt", user: mockUser });
    mockApi.listWorkspaces.mockResolvedValueOnce([mockWorkspace, mockWorkspace2]);
    mockApi.listMembers.mockResolvedValueOnce(mockMembers);
    mockApi.listAgents.mockResolvedValueOnce(mockAgents);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login("test@multica.ai");
    });

    // Setup mocks for the switch
    mockApi.listMembers.mockResolvedValueOnce([]);
    mockApi.listAgents.mockResolvedValueOnce([]);

    await act(async () => {
      await result.current.switchWorkspace("ws-2");
    });

    expect(mockApi.setWorkspaceId).toHaveBeenCalledWith("ws-2");
    expect(localStorage.getItem("multica_workspace_id")).toBe("ws-2");
    expect(mockRefresh).toHaveBeenCalled();
  });
});
