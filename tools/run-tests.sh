#!/usr/bin/env bash
# run-tests.sh — The Periodic Table Room acceptance gate.
# Starts a local static server on a free port, runs the headless browser
# suite against it, and exits non-zero on any failure. Works from the repo
# root and from taskfleet worktrees.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

readonly CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
if [ ! -f "$CHROME" ]; then
  echo "run-tests: Chrome not found at '$CHROME' — set CHROME to a Chrome/Edge binary." >&2
  exit 1
fi

PORT="$(python - <<'PY'
import socket
s = socket.socket(); s.bind(('', 0)); print(s.getsockname()[1]); s.close()
PY
)"
echo "run-tests: serving docs/ on 127.0.0.1:$PORT"
python -m http.server "$PORT" --directory docs >/tmp/pt-gate-http.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT

# Wait until the server actually answers (avoids silent nav timeouts on slow hosts).
python - "$PORT" <<'PY'
import sys, time, urllib.request
port = sys.argv[1]
for _ in range(60):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=1):
            break
    except Exception:
        time.sleep(0.25)
else:
    print('run-tests: http server did not come up', file=sys.stderr)
    sys.exit(1)
PY

export CHROME
node tools/headless_check.mjs "http://127.0.0.1:$PORT/"
