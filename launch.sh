#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
# LinguaPlay Launcher (Linux / macOS)
# ══════════════════════════════════════════════════════════════════

# Resolve script directory dynamically
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# Check for Python 3
if ! command -v python3 &>/dev/null; then
  echo "❌ Error: python3 is not installed or not in PATH."
  exit 1
fi

# Terminate existing server instance running from this folder
pkill -f "python3.*Server.py" 2>/dev/null || true

echo "🚀 Starting LinguaPlay Multithreaded Server..."
python3 Server.py --open &
SERVER_PID=$!

# Wait briefly for server startup
sleep 0.6

# Verify server PID is running
if ! ps -p "$SERVER_PID" > /dev/null; then
  echo "⚠️ Server exited prematurely. Check logs above."
  exit 1
fi

echo "✅ LinguaPlay running at http://127.0.0.1:8000/ (PID: $SERVER_PID)"
