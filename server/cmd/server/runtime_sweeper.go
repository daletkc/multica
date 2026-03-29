package main

import (
	"context"
	"log/slog"
	"time"

	"github.com/multica-ai/multica/server/internal/events"
	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

const (
	// sweepInterval is how often we check for stale runtimes.
	sweepInterval = 30 * time.Second
	// staleThresholdSeconds marks runtimes offline if no heartbeat for this long.
	// The daemon heartbeat interval is 15s, so 45s = 3 missed heartbeats.
	staleThresholdSeconds = 45.0
)

// runRuntimeSweeper periodically marks runtimes as offline if their
// last_seen_at exceeds the stale threshold. This handles cases where the
// daemon crashes or is killed without calling the deregister endpoint.
func runRuntimeSweeper(ctx context.Context, queries *db.Queries, bus *events.Bus) {
	ticker := time.NewTicker(sweepInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			staleRows, err := queries.MarkStaleRuntimesOffline(ctx, staleThresholdSeconds)
			if err != nil {
				slog.Warn("runtime sweeper: failed to mark stale runtimes offline", "error", err)
				continue
			}
			if len(staleRows) == 0 {
				continue
			}

			// Collect unique workspace IDs to notify.
			workspaces := make(map[string]bool)
			for _, row := range staleRows {
				wsID := util.UUIDToString(row.WorkspaceID)
				workspaces[wsID] = true
			}

			slog.Info("runtime sweeper: marked stale runtimes offline", "count", len(staleRows), "workspaces", len(workspaces))

			// Fail orphaned tasks (dispatched/running) whose runtimes just went offline.
			failedTasks, err := queries.FailTasksForOfflineRuntimes(ctx)
			if err != nil {
				slog.Warn("runtime sweeper: failed to clean up stale tasks", "error", err)
			} else if len(failedTasks) > 0 {
				slog.Info("runtime sweeper: failed orphaned tasks", "count", len(failedTasks))
				for _, ft := range failedTasks {
					bus.Publish(events.Event{
						Type:      protocol.EventTaskFailed,
						ActorType: "system",
						Payload: map[string]any{
							"task_id":  util.UUIDToString(ft.ID),
							"agent_id": util.UUIDToString(ft.AgentID),
							"issue_id": util.UUIDToString(ft.IssueID),
							"status":   "failed",
						},
					})
				}
			}

			// Notify frontend clients so they re-fetch runtime list.
			for wsID := range workspaces {
				bus.Publish(events.Event{
					Type:        protocol.EventDaemonRegister,
					WorkspaceID: wsID,
					ActorType:   "system",
					Payload: map[string]any{
						"action": "stale_sweep",
					},
				})
			}
		}
	}
}
