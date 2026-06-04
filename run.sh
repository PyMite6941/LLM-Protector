#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
trap 'kill $BACKEND_PID 2>/dev/null' EXIT
echo "Starting backend..."
cd "$SCRIPT_DIR/backend"
source .venv/Scripts/activate 2>/dev/null || source .venv/bin/activate
python main.py &
BACKEND_PID=$!
echo "Starting frontend..."
cd "$SCRIPT_DIR/frontend"
npm run dev