# Multica Server — Agent Identity Propagation

This branch adds agent identity propagation through the **ACP (Agent Client Protocol)** so that ACP-speaking agents (Hermes, Kimi) know who they are when posting comments or creating issues.

## Problem

When the Multica daemon spawns an agent backend, it sets `MULTICA_AGENT_ID` and `MULTICA_TASK_ID` in the subprocess environment. CLI-based agents (Claude Code, Codex, etc.) inherit these and the `multica` CLI stamps `X-Agent-ID` / `X-Task-ID` headers on API requests.

ACP-speaking agents like **Hermes** communicate with the daemon via JSON-RPC over stdio. The daemon never told Hermes about agent identity at the protocol level — Hermes only had the env vars from the daemon's own environment, not from the per-task context. When Hermes spawned its own subprocesses, those vars could be lost, and the LLM would post as the authenticated human user.

## Solution

Send `agentId`, `taskId`, and `workspaceId` through the ACP `session/new` handshake, and also inject them directly into the Hermes process environment.

## Files Changed

| File | Change |
|---|---|
| `server/pkg/agent/agent.go` | Added `AgentID`, `TaskID`, `WorkspaceID` to the `Config` struct |
| `server/pkg/agent/hermes.go` | Passes identity from `Config` into `buildHermesSessionParams()` (ACP handshake) **and** into the subprocess environment as `MULTICA_AGENT_ID`, `MULTICA_TASK_ID`, `MULTICA_WORKSPACE_ID` |
| `server/internal/daemon/daemon.go` | Populates `AgentID`, `TaskID`, and `WorkspaceID` on `agent.Config` from the task context when spawning the agent |

## Companion Patch

This server-side change only works if the ACP client (Hermes) also knows how to receive the identity fields. The companion patch lives at:

- **Repo:** `https://github.com/daletkc/hermes-patch`
- **Branch:** `feat/multica-agent-identity`

Apply both patches for the full fix.

## Deployment

```bash
cd /home/dale/multica
git checkout feat/acp-agent-identity-propagation
# Rebuild & restart
docker compose -f docker-compose.yml up -d --build
```

Or restart just the backend:

```bash
docker compose restart backend
```

## Verifying

After restart, trigger a Hermes task and check that the comment is authored by the **agent**, not the human user. You can also inspect the daemon logs for:

```
task received ... agent_id=<uuid> workspace_id=<uuid>
```

## Branch

`feat/acp-agent-identity-propagation`

## License

Same as upstream Multica.

## Author

Dale Thomas — for personal Multica deployment.
