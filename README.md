# Multica

AI-native task management platform — like Linear, but with AI agents as first-class citizens.

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/) (v10.28+)
- [Go](https://go.dev/) (v1.26+)
- [Docker](https://www.docker.com/)

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment variables for the shared main environment
cp .env.example .env

# 3. One-time setup: start DB and run migrations
make setup

# 4. Optional: load example data
make seed

# 5. Start backend + frontend
make start
```

Open your configured `FRONTEND_ORIGIN` in the browser. By default that is [http://localhost:3000](http://localhost:3000).

Default behavior now prefers the shared main environment in `.env`. If you want an isolated environment for a Git worktree, generate `.env.worktree` and use the explicit worktree targets:

```bash
make worktree-env
make setup-worktree
make start-worktree
```

This lets you keep `.env` connected to your main database while using `.env.worktree` only for isolated feature testing.

## Project Structure

```
├── server/             # Go backend (Chi + sqlc + gorilla/websocket)
│   ├── cmd/            # server, daemon, migrate, seed
│   ├── internal/       # Core business logic
│   ├── migrations/     # SQL migrations
│   └── sqlc.yaml       # sqlc config
├── apps/
│   └── web/            # Next.js 16 frontend
├── packages/           # Shared TypeScript packages
│   ├── ui/             # Component library (shadcn/ui + Radix)
│   ├── types/          # Shared type definitions
│   ├── sdk/            # API client SDK
│   ├── store/          # State management
│   ├── hooks/          # Shared React hooks
│   └── utils/          # Utility functions
├── Makefile            # Backend commands
├── docker-compose.yml  # PostgreSQL + pgvector
└── .env.example        # Environment variable template
```

## Commands

### Frontend

| Command | Description |
|---------|-------------|
| `pnpm dev:web` | Start Next.js dev server (uses `FRONTEND_PORT`, default `3000`) |
| `pnpm build` | Build all TypeScript packages |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm test` | Run TypeScript tests |

### Backend

| Command | Description |
|---------|-------------|
| `make dev` | Run Go server (uses `PORT`, default `8080`) |
| `make daemon` | Run local agent daemon |
| `make test` | Run Go tests |
| `make build` | Build server & daemon binaries |
| `make sqlc` | Regenerate sqlc code from SQL |

### Database

| Command | Description |
|---------|-------------|
| `docker compose up -d` | Start PostgreSQL |
| `docker compose down` | Stop PostgreSQL |
| `make migrate-up` | Run database migrations |
| `make migrate-down` | Rollback database migrations |
| `make seed` | Seed example data |
| `make worktree-env` | Generate an isolated `.env.worktree` for the current worktree |
| `make setup-main` / `make start-main` | Force use of the shared main `.env` |
| `make setup-worktree` / `make start-worktree` | Force use of isolated `.env.worktree` |

## Environment Variables

See [`.env.example`](.env.example) for all available variables:

- `DATABASE_URL` — PostgreSQL connection string
- `COMPOSE_PROJECT_NAME` — Docker Compose project name
- `POSTGRES_DB` / `POSTGRES_PORT` — Per-worktree PostgreSQL database and host port
- `PORT` — Backend server port (default: 8080)
- `FRONTEND_PORT` / `FRONTEND_ORIGIN` — Frontend port and browser origin
- `JWT_SECRET` — JWT signing secret
- `MULTICA_APP_URL` — Browser origin used when generating local runtime pairing links
- `MULTICA_DAEMON_CONFIG` — Optional path for the daemon's persisted local config
- `MULTICA_WORKSPACE_ID` — Optional dev override for the workspace id; normal usage should rely on browser pairing instead
- `MULTICA_DAEMON_ID` / `MULTICA_DAEMON_DEVICE_NAME` — Stable daemon identity for local runtime registration
- `MULTICA_CODEX_PATH` / `MULTICA_CODEX_MODEL` — Codex executable and optional model override for local task execution
- `MULTICA_CODEX_WORKDIR` — Default working directory used by the local Codex runtime
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth (optional)
- `NEXT_PUBLIC_API_URL` — Frontend → backend API URL
- `NEXT_PUBLIC_WS_URL` — Frontend → backend WebSocket URL

## Local Codex Daemon

The local daemon currently supports one local runtime type: `codex`.

1. Start the daemon with `make daemon`.
2. If the daemon does not already know its workspace, it prints a pairing link in the terminal.
3. Open that link in the browser, sign in, and choose the workspace that should own the local Codex runtime.
4. The daemon stores the approved workspace locally in `MULTICA_DAEMON_CONFIG` or `~/.multica/daemon.json`.
5. The daemon registers the local Codex runtime via `/api/daemon/register`.
6. Create an agent in Multica and bind it to that runtime.
7. Assign an issue to the agent and move the issue to `todo`.
8. The daemon claims the task, runs `codex exec`, and reports the final comment back to the issue.

For local development you can still set `MULTICA_WORKSPACE_ID` directly to skip pairing, but that should be treated as a debug shortcut rather than the normal flow.
