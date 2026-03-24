"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { DaemonPairingSession } from "@multica/types";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";

function formatExpiresAt(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function LocalDaemonPairPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { user, workspaces, workspace, isLoading } = useAuth();
  const [session, setSession] = useState<DaemonPairingSession | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const nextLoginURL = useMemo(() => {
    const next = `/pair/local?token=${encodeURIComponent(token)}`;
    return `/login?next=${encodeURIComponent(next)}`;
  }, [token]);

  useEffect(() => {
    if (!token) {
      setError("Missing pairing token.");
      setLoading(false);
      return;
    }

    setLoading(true);
    api.getDaemonPairingSession(token)
      .then((value) => {
        setSession(value);
        setSelectedWorkspaceId(value.workspace_id || workspace?.id || workspaces[0]?.id || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load pairing session."))
      .finally(() => setLoading(false));
  }, [token, workspace?.id, workspaces]);

  const approve = async () => {
    if (!token || !selectedWorkspaceId) return;
    setSubmitting(true);
    setError("");
    try {
      const approved = await api.approveDaemonPairingSession(token, {
        workspace_id: selectedWorkspaceId,
      });
      setSession(approved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve pairing session.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-xl rounded-2xl border bg-background p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold">Connect Local Codex Runtime</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Approve this pairing request to register your local Codex runtime with a workspace.
          </p>
        </div>

        {loading || isLoading ? (
          <div className="mt-8 text-sm text-muted-foreground">Loading pairing session...</div>
        ) : error ? (
          <div className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : session ? (
          <>
            <div className="mt-6 rounded-xl border bg-muted/30 p-4">
              <div className="text-sm font-medium">{session.runtime_name}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {session.device_name}
                {session.runtime_version ? ` · ${session.runtime_version}` : ""}
              </div>
              <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                {session.runtime_type}
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Expires {formatExpiresAt(session.expires_at)}
              </div>
            </div>

            {!user ? (
              <div className="mt-6 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Sign in first, then choose which workspace should own this local runtime.
                </p>
                <Link
                  href={nextLoginURL}
                  className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Sign in to continue
                </Link>
              </div>
            ) : session.status === "approved" || session.status === "claimed" ? (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                This runtime is linked to a workspace. Return to the daemon window to finish setup.
              </div>
            ) : session.status === "expired" ? (
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                This pairing link expired. Restart the daemon to generate a new link.
              </div>
            ) : workspaces.length === 0 ? (
              <div className="mt-6 rounded-xl border px-4 py-3 text-sm text-muted-foreground">
                You do not have a workspace yet. Create one first, then reopen this pairing link.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">Workspace</label>
                  <select
                    value={selectedWorkspaceId}
                    onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    {workspaces.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={approve}
                  disabled={submitting || !selectedWorkspaceId}
                  className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting ? "Registering..." : "Register runtime"}
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function LocalDaemonPairPage() {
  return (
    <Suspense fallback={null}>
      <LocalDaemonPairPageContent />
    </Suspense>
  );
}
