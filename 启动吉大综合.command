#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ -x ".venv/bin/python" ]; then
  exec ".venv/bin/python" "app.py" "$@"
elif [ -x ".venv/bin/python3" ]; then
  exec ".venv/bin/python3" "app.py" "$@"
elif command -v python3 >/dev/null 2>&1; then
  exec python3 "app.py" "$@"
else
  exec python "app.py" "$@"
fi
