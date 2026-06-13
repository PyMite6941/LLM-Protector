#!/usr/bin/env bash
echo "Starting LLM Protector ..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
trap 'kill $BACKEND_PID 2>/dev/null' EXIT

# --- OS detection ---
IS_WIN=false; IS_MAC=false; IS_LINUX=false; IS_WSL=false
case "$(uname -s)" in
  MINGW* | CYGWIN* | MSYS*) IS_WIN=true ;;
  Darwin*) IS_MAC=true ;;
  Linux*)
    if grep -qi microsoft /proc/version 2>/dev/null; then
      IS_WSL=true
    else
      IS_LINUX=true
    fi
    ;;
  *)
    echo "Unsupported OS, cannot start. Check the README.md for more information."
    exit 1
    ;;
esac

# --- Tool checks ---
PY=python3
command -v python3 >/dev/null 2>&1 || PY=python
if ! command -v "$PY" >/dev/null 2>&1; then
  echo "ERROR: Python not found."
  if $IS_WIN; then
    echo "Install it with 'winget install Python.Python.3.12' or from https://www.python.org/downloads/"
  elif $IS_MAC; then
    echo "Install it with 'brew install python3'"
  else
    echo "Install it with 'sudo apt install python3 python3-venv' or 'sudo dnf install python3'"
  fi
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm not found."
  if $IS_WIN || $IS_WSL; then
    echo "Install Node.js on Windows with 'winget install OpenJS.NodeJS.LTS' or from https://nodejs.org/"
  elif $IS_MAC; then
    echo "Install it with 'brew install node'"
  else
    echo "Install it with 'sudo apt install nodejs npm' or 'sudo dnf install nodejs'"
  fi
  exit 1
fi

# --- Ollama ---
ollama_up() { curl -s --max-time 2 "$1" >/dev/null 2>&1; }
if $IS_WSL; then
  # In WSL2, the Windows host is reachable at the default gateway IP
  WIN_HOST="$(ip route show default 2>/dev/null | awk '{print $3; exit}')"
fi
if ollama_up "http://localhost:11434" || { $IS_WSL && [ -n "$WIN_HOST" ] && ollama_up "http://$WIN_HOST:11434"; }; then
  echo "Ollama already running."
else
  echo "Starting Ollama ..."
  if $IS_WIN; then
    OLLAMA="$LOCALAPPDATA/Programs/Ollama/ollama.exe"
    if [ -f "$OLLAMA" ]; then
      OLLAMA_NUM_PARALLEL=3 "$OLLAMA" serve &
      sleep 2
    else
      echo "WARNING: Ollama not found at $OLLAMA — start it manually if needed."
    fi
  elif $IS_WSL; then
    # Ollama lives on the Windows side; bind to 0.0.0.0 so WSL can reach it
    powershell.exe -NoProfile -Command "\$env:OLLAMA_HOST='0.0.0.0'; \$env:OLLAMA_NUM_PARALLEL='3'; Start-Process -WindowStyle Hidden \"\$env:LOCALAPPDATA\Programs\Ollama\ollama.exe\" serve" 2>/dev/null
    sleep 3
  elif $IS_MAC; then
    if [ -d "/Applications/Ollama.app" ]; then
      open -a Ollama
      sleep 2
    else
      echo "WARNING: Ollama.app not found in /Applications — start it manually if needed."
    fi
  else
    if command -v ollama >/dev/null 2>&1; then
      OLLAMA_NUM_PARALLEL=3 ollama serve &
      sleep 2
    else
      echo "WARNING: ollama not found on PATH — start it manually if needed."
    fi
  fi
fi
echo "Starting backend ..."
cd "$SCRIPT_DIR/backend"
if $IS_WIN; then
  VENV_DIR=".venv";       VENV_PY="$VENV_DIR/Scripts/python.exe"
elif $IS_WSL; then
  VENV_DIR=".venv-linux"; VENV_PY="$VENV_DIR/bin/python"
else
  VENV_DIR=".venv";       VENV_PY="$VENV_DIR/bin/python"
fi
if [ ! -f "$VENV_PY" ]; then
  echo "Building venv at backend/$VENV_DIR ..."
  "$PY" -m venv "$VENV_DIR"
  "$VENV_PY" -m pip install -r requirements.txt
fi
"$VENV_PY" main.py &
BACKEND_PID=$!
echo "Starting frontend ..."
cd "$SCRIPT_DIR/frontend"
if $IS_WSL; then
  # Run the frontend on the Windows side so npm and the browser match
  WIN_FRONTEND="$(wslpath -w "$SCRIPT_DIR/frontend")"
  powershell.exe -NoProfile -Command "Start-Process powershell -WorkingDirectory '$WIN_FRONTEND' -ArgumentList '-NoExit','-Command','if (-not (Test-Path node_modules)) { npm install }; npm run dev'"
  echo "Frontend opened in a new PowerShell window — go to http://localhost:5173"
  echo "Press Ctrl+C here to stop the backend."
  wait $BACKEND_PID
else
  [ -d node_modules ] || npm install
  npm run dev
fi
