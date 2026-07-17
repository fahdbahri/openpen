#!/usr/bin/env bash
set -e

echo "Starting Vite dev server..."
bun run dev &
VITE_PID=$!

# Wait for Vite to be ready
for i in $(seq 1 30); do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo "Vite ready, launching Electron..."
    break
  fi
  sleep 0.5
done

NODE_ENV=development bun electron .

kill $VITE_PID 2>/dev/null
