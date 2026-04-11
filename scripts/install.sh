#!/usr/bin/env bash
# Multica installer — one command to set up everything.
#
# Self-host (default): starts a local Multica server + installs CLI + configures
#   curl -fsSL https://raw.githubusercontent.com/multica-ai/multica/main/scripts/install.sh | bash
#
# Cloud only: installs CLI to connect to multica.ai (no Docker needed)
#   curl -fsSL https://raw.githubusercontent.com/multica-ai/multica/main/scripts/install.sh | bash -s -- --cloud
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
REPO_URL="https://github.com/multica-ai/multica.git"
INSTALL_DIR="${MULTICA_INSTALL_DIR:-$HOME/.multica/server}"
BREW_PACKAGE="multica-ai/tap/multica"

# Colors (disabled when not a terminal)
if [ -t 1 ] || [ -t 2 ]; then
  BOLD='\033[1m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  RED='\033[0;31m'
  CYAN='\033[0;36m'
  RESET='\033[0m'
else
  BOLD='' GREEN='' YELLOW='' RED='' CYAN='' RESET=''
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()  { printf "${BOLD}${CYAN}==> %s${RESET}\n" "$*"; }
ok()    { printf "${BOLD}${GREEN}✓ %s${RESET}\n" "$*"; }
warn()  { printf "${BOLD}${YELLOW}⚠ %s${RESET}\n" "$*" >&2; }
fail()  { printf "${BOLD}${RED}✗ %s${RESET}\n" "$*" >&2; exit 1; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

detect_os() {
  case "$(uname -s)" in
    Darwin) OS="darwin" ;;
    Linux)  OS="linux" ;;
    *)      fail "Unsupported operating system: $(uname -s). Multica supports macOS and Linux." ;;
  esac

  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64)  ARCH="amd64" ;;
    aarch64) ARCH="arm64" ;;
    arm64)   ARCH="arm64" ;;
    *)       fail "Unsupported architecture: $ARCH" ;;
  esac
}

# ---------------------------------------------------------------------------
# CLI Installation
# ---------------------------------------------------------------------------
install_cli_brew() {
  info "Installing Multica CLI via Homebrew..."
  if ! brew tap multica-ai/tap 2>/dev/null; then
    fail "Failed to add Homebrew tap. Check your network connection."
  fi
  if ! brew install multica 2>/dev/null; then
    fail "Failed to install multica via Homebrew."
  fi
  ok "Multica CLI installed via Homebrew"
}

install_cli_binary() {
  info "Installing Multica CLI from GitHub Releases..."

  # Get latest release tag
  local latest
  latest=$(curl -sI "$REPO_URL/releases/latest" | grep -i '^location:' | sed 's/.*tag\///' | tr -d '\r\n')
  if [ -z "$latest" ]; then
    fail "Could not determine latest release. Check your network connection."
  fi

  local url="https://github.com/multica-ai/multica/releases/download/${latest}/multica_${OS}_${ARCH}.tar.gz"
  local tmp_dir
  tmp_dir=$(mktemp -d)

  info "Downloading $url ..."
  if ! curl -fsSL "$url" -o "$tmp_dir/multica.tar.gz"; then
    rm -rf "$tmp_dir"
    fail "Failed to download CLI binary."
  fi

  tar -xzf "$tmp_dir/multica.tar.gz" -C "$tmp_dir" multica

  # Try /usr/local/bin first, fall back to ~/.local/bin
  local bin_dir="/usr/local/bin"
  if [ -w "$bin_dir" ]; then
    mv "$tmp_dir/multica" "$bin_dir/multica"
  elif command_exists sudo; then
    sudo mv "$tmp_dir/multica" "$bin_dir/multica"
  else
    bin_dir="$HOME/.local/bin"
    mkdir -p "$bin_dir"
    mv "$tmp_dir/multica" "$bin_dir/multica"
    chmod +x "$bin_dir/multica"
    # Add to PATH if not already there
    if ! echo "$PATH" | tr ':' '\n' | grep -q "^$bin_dir$"; then
      export PATH="$bin_dir:$PATH"
      add_to_path "$bin_dir"
    fi
  fi

  rm -rf "$tmp_dir"
  ok "Multica CLI installed to $bin_dir/multica"
}

add_to_path() {
  local dir="$1"
  local line="export PATH=\"$dir:\$PATH\""
  for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
    if [ -f "$rc" ] && ! grep -qF "$dir" "$rc"; then
      printf '\n# Added by Multica installer\n%s\n' "$line" >> "$rc"
    fi
  done
}

install_cli() {
  # Skip if already installed
  if command_exists multica; then
    local ver
    ver=$(multica version 2>/dev/null || echo "unknown")
    ok "Multica CLI already installed ($ver)"
    return 0
  fi

  if command_exists brew; then
    install_cli_brew
  else
    install_cli_binary
  fi

  # Verify
  if ! command_exists multica; then
    fail "CLI installed but 'multica' not found on PATH. You may need to restart your shell."
  fi
}

# ---------------------------------------------------------------------------
# Docker check
# ---------------------------------------------------------------------------
check_docker() {
  if ! command_exists docker; then
    printf "\n"
    fail "Docker is not installed. Multica self-hosting requires Docker and Docker Compose.

Install Docker:
  macOS:  https://docs.docker.com/desktop/install/mac-install/
  Linux:  https://docs.docker.com/engine/install/

After installing Docker, re-run this script."
  fi

  if ! docker info >/dev/null 2>&1; then
    fail "Docker is installed but not running. Please start Docker and re-run this script."
  fi

  ok "Docker is available"
}

# ---------------------------------------------------------------------------
# Server setup (self-host)
# ---------------------------------------------------------------------------
setup_server() {
  info "Setting up Multica server..."

  if [ -d "$INSTALL_DIR/.git" ]; then
    info "Updating existing installation at $INSTALL_DIR..."
    cd "$INSTALL_DIR"
    git fetch origin main --depth 1 2>/dev/null || true
    git reset --hard origin/main 2>/dev/null || true
  else
    info "Cloning Multica repository..."
    if ! command_exists git; then
      fail "Git is not installed. Please install git and re-run."
    fi
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
  fi

  ok "Repository ready at $INSTALL_DIR"

  # Generate .env if needed
  if [ ! -f .env ]; then
    info "Creating .env with random JWT_SECRET..."
    cp .env.example .env
    local jwt
    jwt=$(openssl rand -hex 32)
    if [ "$(uname -s)" = "Darwin" ]; then
      sed -i '' "s/^JWT_SECRET=.*/JWT_SECRET=$jwt/" .env
    else
      sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$jwt/" .env
    fi
    ok "Generated .env with random JWT_SECRET"
  else
    ok "Using existing .env"
  fi

  # Start Docker Compose
  info "Starting Multica services (this may take a few minutes on first run)..."
  docker compose -f docker-compose.selfhost.yml up -d --build

  # Wait for health check
  info "Waiting for backend to be ready..."
  local ready=false
  for i in $(seq 1 45); do
    if curl -sf http://localhost:8080/health >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 2
  done

  if [ "$ready" = true ]; then
    ok "Multica server is running"
  else
    warn "Server is still starting. You can check logs with:"
    echo "  cd $INSTALL_DIR && docker compose -f docker-compose.selfhost.yml logs"
    echo ""
  fi
}

# ---------------------------------------------------------------------------
# Configure CLI
# ---------------------------------------------------------------------------
configure_local() {
  info "Configuring CLI for local server..."
  multica config local 2>/dev/null || {
    # Fallback if config local doesn't exist in installed version
    multica config set app_url http://localhost:3000 2>/dev/null || true
    multica config set server_url http://localhost:8080 2>/dev/null || true
  }
  ok "CLI configured for localhost (backend :8080, frontend :3000)"
}

# ---------------------------------------------------------------------------
# Main: Self-host mode
# ---------------------------------------------------------------------------
run_selfhost() {
  printf "\n"
  printf "${BOLD}  Multica — Self-Host Installer${RESET}\n"
  printf "  Setting up a local Multica server + CLI\n"
  printf "\n"

  detect_os
  check_docker
  setup_server
  install_cli
  configure_local

  printf "\n"
  printf "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
  printf "${BOLD}${GREEN}  ✓ Multica is installed and running!${RESET}\n"
  printf "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
  printf "\n"
  printf "  ${BOLD}Frontend:${RESET}  http://localhost:3000\n"
  printf "  ${BOLD}Backend:${RESET}   http://localhost:8080\n"
  printf "  ${BOLD}Server at:${RESET} %s\n" "$INSTALL_DIR"
  printf "\n"
  printf "  ${BOLD}Next steps:${RESET}\n"
  printf "  1. Open ${CYAN}http://localhost:3000${RESET} in your browser\n"
  printf "  2. Log in with any email + verification code: ${BOLD}888888${RESET}\n"
  printf "  3. Then run:\n"
  printf "\n"
  printf "     ${CYAN}multica login${RESET}          # Authenticate (opens browser)\n"
  printf "     ${CYAN}multica daemon start${RESET}   # Start the agent daemon\n"
  printf "\n"
  printf "  ${BOLD}To stop:${RESET}\n"
  printf "     cd %s && make selfhost-stop\n" "$INSTALL_DIR"
  printf "     multica daemon stop\n"
  printf "\n"
}

# ---------------------------------------------------------------------------
# Main: Cloud mode
# ---------------------------------------------------------------------------
run_cloud() {
  printf "\n"
  printf "${BOLD}  Multica — CLI Installer${RESET}\n"
  printf "  Installing the CLI to connect to multica.ai\n"
  printf "\n"

  detect_os
  install_cli

  printf "\n"
  printf "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
  printf "${BOLD}${GREEN}  ✓ Multica CLI is installed!${RESET}\n"
  printf "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
  printf "\n"
  printf "  ${BOLD}Next steps:${RESET}\n"
  printf "\n"
  printf "     ${CYAN}multica login${RESET}          # Authenticate with multica.ai\n"
  printf "     ${CYAN}multica daemon start${RESET}   # Start the agent daemon\n"
  printf "\n"
  printf "  Or do it all in one command:\n"
  printf "\n"
  printf "     ${CYAN}multica setup${RESET}\n"
  printf "\n"
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
main() {
  local mode="selfhost"

  while [ $# -gt 0 ]; do
    case "$1" in
      --cloud)    mode="cloud" ;;
      --selfhost) mode="selfhost" ;;
      --help|-h)
        echo "Usage: install.sh [--selfhost | --cloud]"
        echo ""
        echo "  --selfhost  (default) Set up a local Multica server + CLI"
        echo "  --cloud     Install CLI only, to connect to multica.ai"
        exit 0
        ;;
      *) warn "Unknown option: $1" ;;
    esac
    shift
  done

  case "$mode" in
    selfhost) run_selfhost ;;
    cloud)    run_cloud ;;
  esac
}

main "$@"
