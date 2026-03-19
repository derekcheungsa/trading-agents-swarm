#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "=== TradingAgents Python Service ==="
echo "Python version: $(python3 --version 2>&1)"
echo "Checking Python dependencies..."

if ! python3 -c "import tradingagents" 2>/dev/null; then
    echo "Installing TradingAgents and dependencies (this may take a few minutes on first run)..."
    pip install -r requirements.txt --quiet
    echo "Dependencies installed."
else
    echo "Dependencies already installed."
fi

echo "Starting FastAPI server on port ${PORT:-8000}..."
exec python3 main.py
