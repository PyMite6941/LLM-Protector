#!/usr/bin/env bash
echo "Starting LLM Protector ..."
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
case "$(uname -s)" in
    MINGW* | CYGWIN* | MSYS*)
        .venv/Scripts/activate.ps1
        python main.py &
        ;;
    Linux* | Darwin*)
        source .venv/bin/activate
        python main.py &
        ;;
    *)
        echo "Unsupported OS, cannot start backend. Check the README.md for more information."
        exit 1
        ;;
esac
BACKEND_PID=$!
echo "Starting frontend ..."
cd "$SCRIPT_DIR/frontend"
npm run dev
