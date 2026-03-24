package handler

import (
	"encoding/json"
	"net/http"

	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

type AgentRuntimeResponse struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspace_id"`
	DaemonID    *string `json:"daemon_id"`
	Name        string  `json:"name"`
	RuntimeMode string  `json:"runtime_mode"`
	Provider    string  `json:"provider"`
	Status      string  `json:"status"`
	DeviceInfo  string  `json:"device_info"`
	Metadata    any     `json:"metadata"`
	LastSeenAt  *string `json:"last_seen_at"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

func runtimeToResponse(rt db.AgentRuntime) AgentRuntimeResponse {
	var metadata any
	if rt.Metadata != nil {
		json.Unmarshal(rt.Metadata, &metadata)
	}
	if metadata == nil {
		metadata = map[string]any{}
	}

	return AgentRuntimeResponse{
		ID:          uuidToString(rt.ID),
		WorkspaceID: uuidToString(rt.WorkspaceID),
		DaemonID:    textToPtr(rt.DaemonID),
		Name:        rt.Name,
		RuntimeMode: rt.RuntimeMode,
		Provider:    rt.Provider,
		Status:      rt.Status,
		DeviceInfo:  rt.DeviceInfo,
		Metadata:    metadata,
		LastSeenAt:  timestampToPtr(rt.LastSeenAt),
		CreatedAt:   timestampToString(rt.CreatedAt),
		UpdatedAt:   timestampToString(rt.UpdatedAt),
	}
}

func (h *Handler) ListAgentRuntimes(w http.ResponseWriter, r *http.Request) {
	workspaceID := resolveWorkspaceID(r)
	if _, ok := h.requireWorkspaceMember(w, r, workspaceID, "workspace not found"); !ok {
		return
	}

	runtimes, err := h.Queries.ListAgentRuntimes(r.Context(), parseUUID(workspaceID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list runtimes")
		return
	}

	resp := make([]AgentRuntimeResponse, len(runtimes))
	for i, rt := range runtimes {
		resp[i] = runtimeToResponse(rt)
	}

	writeJSON(w, http.StatusOK, resp)
}
