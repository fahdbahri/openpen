#!/usr/bin/env bash
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$ROOT_DIR/src/backend/.env"

cleanup() {
  echo "Cleaning up..."
  pkill -9 -f "uv run python main.py" 2>/dev/null
  pkill -9 -f "bun run dev" 2>/dev/null
  pkill -9 -f "electron" 2>/dev/null
  fuser -k 10000/tcp 2>/dev/null
  fuser -k 5173/tcp 2>/dev/null
  echo "--------------------"
  echo "Done"
  exit 0
}
trap cleanup EXIT INT TERM

echo "=== OpenPen ==="

# --- Bun ---
if ! command -v bun &>/dev/null; then
  echo "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  if ! command -v bun &>/dev/null; then
    echo "Failed to install Bun."
    exit 1
  fi
fi
echo "bun: $(bun --version)"

# --- uv ---
if ! command -v uv &>/dev/null; then
  echo "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
  if ! command -v uv &>/dev/null; then
    echo "Failed to install uv."
    exit 1
  fi
fi
echo "uv: $(uv --version)"

# --- API key ---
if ! grep -q "GROQ_API_KEY" "$ENV_FILE" 2>/dev/null; then
  echo ""
  read -r -p "Enter your Groq API key (gsk_...): " api_key
  if [ -z "$api_key" ]; then
    echo "API key is required."
    exit 1
  fi
  echo "GROQ_API_KEY=$api_key" > "$ENV_FILE"
fi

# --- Install deps ---
echo ""
echo "Installing dependencies..."
cd "$ROOT_DIR/src/backend" && uv sync
cd "$ROOT_DIR/src/frontend" && bun install

# --- Start services ---
echo ""
echo "Starting backend..."
cd "$ROOT_DIR/src/backend" && uv run python main.py &
BACKEND_PID=$!

echo "Starting frontend dev server..."
cd "$ROOT_DIR/src/frontend" && bun run dev &
FRONTEND_PID=$!

echo ""
echo "Waiting for backend..."
for i in $(seq 1 30); do
  if curl -s http://localhost:10000/health > /dev/null 2>&1; then
    echo "Backend ready."
    break
  fi
  if [ "$i" -eq 30 ]; then echo "Backend timed out."; exit 1; fi
  sleep 1
done

echo "Waiting for frontend..."
for i in $(seq 1 30); do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo "Frontend ready."
    break
  fi
  if [ "$i" -eq 30 ]; then echo "Frontend timed out."; exit 1; fi
  sleep 1
done

echo ""
echo "Launching Electron..."
cd "$ROOT_DIR/src/frontend" && bun electron .
