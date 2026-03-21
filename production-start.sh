#!/bin/bash
set -e

echo "=== TradingAgents Production Startup ==="

# Push DB schema in background — don't block Express startup
# Postgres may need time to become available on cold starts
(
  for attempt in 1 2 3 4 5; do
    if timeout 25 pnpm --filter @workspace/db run push-force 2>&1; then
      echo "DB schema push succeeded on attempt ${attempt}."
      break
    fi
    echo "Warning: DB schema push attempt ${attempt} failed. Retrying in 10s..."
    sleep 10
  done
) &

# Python agent always runs on port 8000 internally
export PYTHON_AGENT_PORT=8000
# Express listens on the port the artifact system expects
export EXPRESS_PORT=${PORT:-8080}

# Start Python agent in background
echo "Starting Python agent on port ${PYTHON_AGENT_PORT}..."
PORT=${PYTHON_AGENT_PORT} bash artifacts/python-agent/start.sh &
PYTHON_PID=$!

# Wait for Python agent to become ready (up to 60s)
echo "Waiting for Python agent to be ready..."
for i in $(seq 1 60); do
    if curl -sf "http://localhost:${PYTHON_AGENT_PORT}/agent/health" >/dev/null 2>&1; then
        echo "Python agent is ready (${i}s)"
        break
    fi
    sleep 1
done

# Start Express API server in foreground
echo "Starting Express API server on port ${EXPRESS_PORT}..."
PORT=${EXPRESS_PORT} PYTHON_AGENT_PORT=${PYTHON_AGENT_PORT} NODE_ENV=production \
    node artifacts/api-server/dist/index.cjs

# If Express exits, clean up Python agent
kill $PYTHON_PID 2>/dev/null || true
