package main

import (
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/multica-ai/multica/server/internal/handler"
	"github.com/multica-ai/multica/server/internal/middleware"
	"github.com/multica-ai/multica/server/internal/realtime"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

func allowedOrigins() []string {
	raw := strings.TrimSpace(os.Getenv("CORS_ALLOWED_ORIGINS"))
	if raw == "" {
		raw = strings.TrimSpace(os.Getenv("FRONTEND_ORIGIN"))
	}
	if raw == "" {
		return []string{"http://localhost:3000"}
	}

	parts := strings.Split(raw, ",")
	origins := make([]string, 0, len(parts))
	for _, part := range parts {
		origin := strings.TrimSpace(part)
		if origin != "" {
			origins = append(origins, origin)
		}
	}
	if len(origins) == 0 {
		return []string{"http://localhost:3000"}
	}
	return origins
}

// NewRouter creates the fully-configured Chi router with all middleware and routes.
func NewRouter(pool *pgxpool.Pool, hub *realtime.Hub) chi.Router {
	queries := db.New(pool)
	h := handler.New(queries, pool, hub)

	r := chi.NewRouter()

	// Global middleware
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RequestID)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins(),
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Workspace-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// WebSocket
	r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
		realtime.HandleWebSocket(hub, w, r)
	})

	// Auth (public)
	r.Post("/auth/login", h.Login)

	// Daemon API routes (no user auth; daemon auth deferred to later)
	r.Route("/api/daemon", func(r chi.Router) {
		r.Post("/pairing-sessions", h.CreateDaemonPairingSession)
		r.Get("/pairing-sessions/{token}", h.GetDaemonPairingSession)
		r.Post("/pairing-sessions/{token}/claim", h.ClaimDaemonPairingSession)

		r.Post("/register", h.DaemonRegister)
		r.Post("/heartbeat", h.DaemonHeartbeat)

		r.Post("/runtimes/{runtimeId}/tasks/claim", h.ClaimTaskByRuntime)
		r.Get("/runtimes/{runtimeId}/tasks/pending", h.ListPendingTasksByRuntime)

		r.Post("/tasks/{taskId}/start", h.StartTask)
		r.Post("/tasks/{taskId}/progress", h.ReportTaskProgress)
		r.Post("/tasks/{taskId}/complete", h.CompleteTask)
		r.Post("/tasks/{taskId}/fail", h.FailTask)
	})

	// Protected API routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth)

		// Auth
		r.Get("/api/me", h.GetMe)
		r.Patch("/api/me", h.UpdateMe)

		// Issues
		r.Route("/api/issues", func(r chi.Router) {
			r.Get("/", h.ListIssues)
			r.Post("/", h.CreateIssue)
			r.Route("/{id}", func(r chi.Router) {
				r.Get("/", h.GetIssue)
				r.Put("/", h.UpdateIssue)
				r.Delete("/", h.DeleteIssue)
				r.Post("/comments", h.CreateComment)
				r.Get("/comments", h.ListComments)
			})
		})

		// Comments
		r.Route("/api/comments/{commentId}", func(r chi.Router) {
			r.Put("/", h.UpdateComment)
			r.Delete("/", h.DeleteComment)
		})

		// Agents
		r.Route("/api/agents", func(r chi.Router) {
			r.Get("/", h.ListAgents)
			r.Post("/", h.CreateAgent)
			r.Route("/{id}", func(r chi.Router) {
				r.Get("/", h.GetAgent)
				r.Put("/", h.UpdateAgent)
				r.Delete("/", h.DeleteAgent)
				r.Get("/tasks", h.ListAgentTasks)
			})
		})

		r.Route("/api/runtimes", func(r chi.Router) {
			r.Get("/", h.ListAgentRuntimes)
		})

		r.Post("/api/daemon/pairing-sessions/{token}/approve", h.ApproveDaemonPairingSession)

		// Inbox
		r.Route("/api/inbox", func(r chi.Router) {
			r.Get("/", h.ListInbox)
			r.Post("/{id}/read", h.MarkInboxRead)
			r.Post("/{id}/archive", h.ArchiveInboxItem)
		})

		// Workspaces
		r.Route("/api/workspaces", func(r chi.Router) {
			r.Get("/", h.ListWorkspaces)
			r.Post("/", h.CreateWorkspace)
			r.Route("/{id}", func(r chi.Router) {
				r.Get("/", h.GetWorkspace)
				r.Put("/", h.UpdateWorkspace)
				r.Patch("/", h.UpdateWorkspace)
				r.Delete("/", h.DeleteWorkspace)
				r.Get("/members", h.ListMembersWithUser)
				r.Post("/members", h.CreateMember)
				r.Post("/leave", h.LeaveWorkspace)
				r.Route("/members/{memberId}", func(r chi.Router) {
					r.Patch("/", h.UpdateMember)
					r.Delete("/", h.DeleteMember)
				})
			})
		})
	})

	return r
}
