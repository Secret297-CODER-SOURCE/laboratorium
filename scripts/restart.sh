#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"
PID=$(lsof -ti ":$PORT" 2>/dev/null || true)

if [ -n "$PID" ]; then
  echo "Зупиняю старий сервер на порту $PORT (PID: $PID)..."
  kill -9 $PID 2>/dev/null || true
  sleep 1
fi

if lsof -ti ":$PORT" >/dev/null 2>&1; then
  echo "Помилка: порт $PORT зайнятий. Зупиніть процес вручну:"
  echo "  lsof -ti :$PORT | xargs kill -9"
  exit 1
fi

echo "Запуск laboratorium на http://localhost:$PORT"
exec npm start
