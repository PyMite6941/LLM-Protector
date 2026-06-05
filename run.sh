#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
trap 'kill $BACKEND_PID $OLLAMA_PID 2>/dev/null' EXIT

# --- Detect OS ---
OS="$(uname -s)"
IS_WSL=false
grep -qi microsoft /proc/version 2>/dev/null && IS_WSL=true

if [[ "$OS" == MINGW* || "$OS" == MSYS* || "$OS" == CYGWIN* ]]; then
  VENV_DIR="$SCRIPT_DIR/backend/.venv"
  PYTHON="$VENV_DIR/Scripts/python.exe"
elif $IS_WSL; then
  VENV_DIR="$SCRIPT_DIR/backend/.venv-linux"
  PYTHON="$VENV_DIR/bin/python"
else
  VENV_DIR="$SCRIPT_DIR/backend/.venv"
  PYTHON="$VENV_DIR/bin/python"
fi

# --- Build venv if missing ---
needs_install=false
if ! "$PYTHON" --version >/dev/null 2>&1; then
  echo "Building venv ..."
  SYS_PYTHON=$(command -v python3 2>/dev/null || command -v python 2>/dev/null)
  [ -z "$SYS_PYTHON" ] && { echo "ERROR: Python not found."; exit 1; }
  "$SYS_PYTHON" -m venv "$VENV_DIR"
  needs_install=true
fi

# Install deps if any package is missing
if ! "$PYTHON" -c "import httpx, fastapi, yaml, dotenv, pydantic" >/dev/null 2>&1; then
  needs_install=true
fi

if $needs_install; then
  echo "Installing dependencies ..."
  "$PYTHON" -m pip install -q -r "$SCRIPT_DIR/backend/requirements.txt" \
    || { echo "ERROR: pip install failed."; exit 1; }
  echo "Dependencies ready."
fi

# --- Clear caches ---
"$PYTHON" "$SCRIPT_DIR/backend/remove_cache.py"

# --- Port check ---
port_open() { (: < /dev/tcp/127.0.0.1/$1) 2>/dev/null; }

# Git Bash lacks /dev/tcp, fall back to Python socket
if ! (: < /dev/tcp/127.0.0.1/1) 2>/dev/null; then
  port_open() {
    "$PYTHON" -c "import socket,sys;s=socket.socket();s.settimeout(0.5);sys.exit(0 if s.connect_ex(('127.0.0.1',$1))==0 else 1)" 2>/dev/null
  }
fi

wait_for_port() {
  local port=$1 label=$2 i=0
  echo "Waiting for $label ..."
  while (( i++ < 30 )); do
    port_open "$port" && echo "$label ready." && return 0
    sleep 1
  done
  echo "ERROR: $label did not start in time."; return 1
}

# --- Ollama ---
if $IS_WSL; then
  # In WSL, Ollama is a Windows process -- can't start it here
  if port_open 11434; then
    echo "Ollama detected (Windows host)."
  else
    echo "WARNING: Ollama not running. Open Ollama Desktop on Windows first."
  fi
else
  if ! port_open 11434; then
    OLLAMA=$(command -v ollama 2>/dev/null || echo "$USERPROFILE/AppData/Local/Programs/Ollama/ollama.exe")
    if [ -f "$OLLAMA" ]; then
      echo "Starting Ollama ..."
      "$OLLAMA" serve 2>/dev/null & OLLAMA_PID=$!
      wait_for_port 11434 "Ollama" || echo "WARNING: Ollama unreachable."
    else
      echo "WARNING: Ollama not found -- start it manually."
    fi
  else
    echo "Ollama already running."
  fi
fi

# --- Backend ---
echo "Starting backend ..."
cd "$SCRIPT_DIR/backend"
DEV_RELOAD=false "$PYTHON" main.py &
BACKEND_PID=$!
sleep 2
if ! kill -0 $BACKEND_PID 2>/dev/null; then
  echo "ERROR: Backend crashed on startup. Check the output above."
  exit 1
fi
wait_for_port 8000 "backend" || exit 1

# --- Frontend ---
echo "Starting frontend ..."
if $IS_WSL; then
  WIN_FRONTEND="$(wslpath -w "$SCRIPT_DIR/frontend")"
  cmd.exe /c "cd /d \"$WIN_FRONTEND\" && npm run dev"
else
  cd "$SCRIPT_DIR/frontend"
  npm run dev
fi
