export type DaemonPairingSessionStatus = "pending" | "approved" | "claimed" | "expired";

export interface DaemonPairingSession {
  token: string;
  daemon_id: string;
  device_name: string;
  runtime_name: string;
  runtime_type: string;
  runtime_version: string;
  workspace_id: string | null;
  status: DaemonPairingSessionStatus;
  approved_at: string | null;
  claimed_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  link_url?: string | null;
}

export interface ApproveDaemonPairingSessionRequest {
  workspace_id: string;
}
