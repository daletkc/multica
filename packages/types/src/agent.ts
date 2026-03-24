export type AgentStatus = "idle" | "working" | "blocked" | "error" | "offline";

export type AgentRuntimeMode = "local" | "cloud";

export type AgentVisibility = "workspace" | "private";

export type AgentTriggerType = "on_assign" | "scheduled";

export interface RuntimeDevice {
  id: string;
  workspace_id: string;
  daemon_id: string | null;
  name: string;
  runtime_mode: AgentRuntimeMode;
  provider: string;
  status: "online" | "offline";
  device_info: string;
  metadata: Record<string, unknown>;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AgentRuntime = RuntimeDevice;

export interface AgentTool {
  id: string;
  name: string;
  description: string;
  auth_type: "oauth" | "api_key" | "none";
  connected: boolean;
  config: Record<string, unknown>;
}

export interface AgentTrigger {
  id: string;
  type: AgentTriggerType;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface AgentTask {
  id: string;
  agent_id: string;
  runtime_id: string;
  issue_id: string;
  status: "queued" | "dispatched" | "running" | "completed" | "failed" | "cancelled";
  priority: number;
  dispatched_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  result: unknown;
  error: string | null;
  created_at: string;
}

export interface Agent {
  id: string;
  workspace_id: string;
  runtime_id: string;
  name: string;
  description: string;
  avatar_url: string | null;
  runtime_mode: AgentRuntimeMode;
  runtime_config: Record<string, unknown>;
  visibility: AgentVisibility;
  status: AgentStatus;
  max_concurrent_tasks: number;
  owner_id: string | null;
  skills: string;
  tools: AgentTool[];
  triggers: AgentTrigger[];
  created_at: string;
  updated_at: string;
}

export interface CreateAgentRequest {
  name: string;
  description?: string;
  avatar_url?: string;
  runtime_id: string;
  runtime_config?: Record<string, unknown>;
  visibility?: AgentVisibility;
  max_concurrent_tasks?: number;
  skills?: string;
  tools?: AgentTool[];
  triggers?: AgentTrigger[];
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  avatar_url?: string;
  runtime_id?: string;
  runtime_config?: Record<string, unknown>;
  visibility?: AgentVisibility;
  status?: AgentStatus;
  max_concurrent_tasks?: number;
  skills?: string;
  tools?: AgentTool[];
  triggers?: AgentTrigger[];
}
