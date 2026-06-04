#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
trap 'kill $BACKEND_PID 2>/dev/null' EXIT
if ! curl -s http://localhost:11434 >/dev/null 2>&1; then
  echo "Starting Ollama ..."
  OLLAMA="$LOCALAPPDATA/Programs/Ollama/ollama.exe"
  if [ -f "$OLLAMA" ]; then
    "$OLLAMA" serve &
    sleep 2
  else
    echo "WARNING: Ollama not found at $OLLAMA — start it manually if needed."
  fi
else
  echo "Ollama already running."
fi
echo "Starting backend ..."
cd "$SCRIPT_DIR/backend"
if [ -f ".venv/Scripts/python.exe" ]; then
  PYTHON=".venv/Scripts/python.exe"
elif [ -f ".venv/Scripts/python" ]; then
  PYTHON=".venv/Scripts/python"
elif [ -f ".venv/bin/python" ]; then
  PYTHON=".venv/bin/python"
else
  echo "ERROR: venv Python not found. Run: python -m venv .venv && pip install -r requirements.txt"
  exit 1
fi
echo "Using: $PYTHON"
$PYTHON main.py &
BACKEND_PID=$!
echo "Starting frontend ..."
cd "$SCRIPT_DIR/frontend"
npm run dev
