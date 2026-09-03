#!/usr/bin/env bash
# run-tests.sh — The Periodic Table Room acceptance gate.
# Starts a local static server on a free port, runs the headless browser
# suite against it, and exits non-zero on any failure. Works from the repo
# root and from taskfleet worktrees.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

PORT="$(python - <<'PY'
import socket
s = socket.socket(); s.bind(('', 0)); print(s.getsockname()[1]); s.close()
PY
)"
echo "run-tests: serving docs/ on 127.0.0.1:$PORT"
python -m http.server "$PORT" --directory docs >/tmp/pt-gate-http.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
sleep 2

export CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
node tools/headless_check.mjs "http://127.0.0.1:$PORT/"
