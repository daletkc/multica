"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { User, Workspace, MemberWithUser, Agent } from "@multica/types";
import { api } from "./api";

interface AuthContextValue {
  user: User | null;
  workspace: Workspace | null;
  workspaces: Workspace[];
  members: MemberWithUser[];
  agents: Agent[];
  isLoading: boolean;
  login: (email: string, name?: string, redirectTo?: string) => Promise<void>;
  logout: () => void;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  createWorkspace: (data: { name: string; slug: string; description?: string }) => Promise<Workspace>;
  updateWorkspace: (ws: Workspace) => void;
  updateCurrentUser: (nextUser: User) => void;
  leaveWorkspace: (workspaceId: string) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspaces: () => Promise<Workspace[]>;
  refreshMembers: () => Promise<void>;
  refreshAgents: () => Promise<void>;
  getMemberName: (userId: string) => string;
  getAgentName: (agentId: string) => string;
  getActorName: (type: string, id: string) => string;
  getActorInitials: (type: string, id: string) => string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const hydrateWorkspace = useCallback(async (wsList: Workspace[], preferredWorkspaceId?: string | null) => {
    setWorkspaces(wsList);

    const nextWorkspace =
      (preferredWorkspaceId ? wsList.find((item) => item.id === preferredWorkspaceId) : null) ??
      wsList[0] ??
      null;

    if (!nextWorkspace) {
      api.setWorkspaceId(null);
      localStorage.removeItem("multica_workspace_id");
      setWorkspace(null);
      setMembers([]);
      setAgents([]);
      return null;
    }

    api.setWorkspaceId(nextWorkspace.id);
    localStorage.setItem("multica_workspace_id", nextWorkspace.id);
    setWorkspace(nextWorkspace);

    const [nextMembers, nextAgents] = await Promise.all([
      api.listMembers(nextWorkspace.id),
      api.listAgents({ workspace_id: nextWorkspace.id }),
    ]);
    setMembers(nextMembers);
    setAgents(nextAgents);

    return nextWorkspace;
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    const storedWorkspaceId = localStorage.getItem("multica_workspace_id");
    const wsList = await api.listWorkspaces();
    await hydrateWorkspace(wsList, workspace?.id ?? storedWorkspaceId);
    return wsList;
  }, [hydrateWorkspace, workspace]);

  // Initialize from stored token
  useEffect(() => {
    const token = localStorage.getItem("multica_token");
    const wsId = localStorage.getItem("multica_workspace_id");
    if (!token) {
      setIsLoading(false);
      return;
    }

    api.setToken(token);
    api.setWorkspaceId(wsId);

    (async () => {
      try {
        const me = await api.getMe();
        setUser(me);

        const wsList = await api.listWorkspaces();
        await hydrateWorkspace(wsList, wsId);
      } catch {
        // Token invalid, clear it
        api.setToken(null);
        api.setWorkspaceId(null);
        localStorage.removeItem("multica_token");
        localStorage.removeItem("multica_workspace_id");
        setUser(null);
        setWorkspace(null);
        setWorkspaces([]);
        setMembers([]);
        setAgents([]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [hydrateWorkspace]);

  const login = useCallback(async (email: string, name?: string, redirectTo?: string) => {
    const { token, user: u } = await api.login(email, name);
    api.setToken(token);
    localStorage.setItem("multica_token", token);
    setUser(u);

    const wsList = await api.listWorkspaces();
    await hydrateWorkspace(wsList);

    router.push(redirectTo || "/issues");
  }, [hydrateWorkspace, router]);

  const logout = useCallback(() => {
    api.setToken(null);
    api.setWorkspaceId(null);
    localStorage.removeItem("multica_token");
    localStorage.removeItem("multica_workspace_id");
    setUser(null);
    setWorkspace(null);
    setWorkspaces([]);
    setMembers([]);
    setAgents([]);
    router.push("/login");
  }, [router]);

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    const ws = workspaces.find((item) => item.id === workspaceId);
    if (!ws) return;

    await hydrateWorkspace(workspaces, ws.id);
    router.refresh();
  }, [hydrateWorkspace, router, workspaces]);

  const createNewWorkspace = useCallback(async (data: { name: string; slug: string; description?: string }) => {
    const ws = await api.createWorkspace(data);
    setWorkspaces((prev) => [...prev, ws]);
    return ws;
  }, []);

  const updateWorkspaceState = useCallback((ws: Workspace) => {
    setWorkspace(ws);
    setWorkspaces((prev) => prev.map((item) => (item.id === ws.id ? ws : item)));
  }, []);

  const updateCurrentUser = useCallback((nextUser: User) => {
    setUser(nextUser);
  }, []);

  const reloadAfterWorkspaceRemoval = useCallback(async (removedWorkspaceId: string) => {
    const wsList = await api.listWorkspaces();
    const preferredWorkspaceId = workspace?.id === removedWorkspaceId ? null : workspace?.id ?? null;
    await hydrateWorkspace(wsList, preferredWorkspaceId);
    router.refresh();
  }, [hydrateWorkspace, router, workspace]);

  const leaveWorkspace = useCallback(async (workspaceId: string) => {
    await api.leaveWorkspace(workspaceId);
    await reloadAfterWorkspaceRemoval(workspaceId);
  }, [reloadAfterWorkspaceRemoval]);

  const deleteWorkspace = useCallback(async (workspaceId: string) => {
    await api.deleteWorkspace(workspaceId);
    await reloadAfterWorkspaceRemoval(workspaceId);
  }, [reloadAfterWorkspaceRemoval]);

  const refreshMembers = useCallback(async () => {
    if (!workspace) return;
    const m = await api.listMembers(workspace.id);
    setMembers(m);
  }, [workspace]);

  const refreshAgents = useCallback(async () => {
    if (!workspace) return;
    const a = await api.listAgents({ workspace_id: workspace.id });
    setAgents(a);
  }, [workspace]);

  const getMemberName = useCallback(
    (userId: string) => {
      const m = members.find((m) => m.user_id === userId);
      return m?.name ?? "Unknown";
    },
    [members],
  );

  const getAgentName = useCallback(
    (agentId: string) => {
      const a = agents.find((a) => a.id === agentId);
      return a?.name ?? "Unknown Agent";
    },
    [agents],
  );

  const getActorName = useCallback(
    (type: string, id: string) => {
      if (type === "member") return getMemberName(id);
      if (type === "agent") return getAgentName(id);
      return "System";
    },
    [getMemberName, getAgentName],
  );

  const getActorInitials = useCallback(
    (type: string, id: string) => {
      const name = getActorName(type, id);
      return name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    },
    [getActorName],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        workspace,
        workspaces,
        members,
        agents,
        isLoading,
        login,
        logout,
        switchWorkspace,
        createWorkspace: createNewWorkspace,
        updateWorkspace: updateWorkspaceState,
        updateCurrentUser,
        leaveWorkspace,
        deleteWorkspace,
        refreshWorkspaces,
        refreshMembers,
        refreshAgents,
        getMemberName,
        getAgentName,
        getActorName,
        getActorInitials,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
