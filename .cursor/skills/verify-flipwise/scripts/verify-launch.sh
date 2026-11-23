#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
REPO_KEY="$(printf '%s' "$REPO_ROOT" | cksum | awk '{print $1}')"
LATEST_FILE="/tmp/flipwise-verify-latest-${REPO_KEY}"

MODE="dev"
PORT="${FLIPWISE_VERIFY_PORT:-4391}"
RUN_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --run-id) RUN_ID="${2:-}"; shift 2 ;;
    -h|--help)
      echo "Usage: verify-launch.sh [--mode dev|preview|mockup] [--port 4391] [--run-id <id>]"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

case "$MODE" in
  dev|preview|mockup) ;;
  *) echo "Invalid --mode '$MODE'. Expected dev, preview, or mockup." >&2; exit 2 ;;
esac

if [[ -z "$RUN_ID" ]]; then
  RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
fi

# Never collide with or double-drive an already running server on this port.
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "ERROR: Port $PORT is already in use. Refusing to double-drive." >&2
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >&2
  exit 1
fi

STATE_DIR="/tmp/flipwise-verify-${RUN_ID}"
PROFILE_DIR="${STATE_DIR}/profile"
ARTIFACTS_DIR="${REPO_ROOT}/.verify-artifacts/flipwise/${RUN_ID}"
LOG_FILE="${STATE_DIR}/server.log"

mkdir -p "$PROFILE_DIR" "$ARTIFACTS_DIR"

URL="http://127.0.0.1:${PORT}/"
SERVER_PID=""

fail_launch() {
  echo "ERROR: $1" >&2
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    sleep 0.5
    kill -9 "$SERVER_PID" 2>/dev/null || true
  fi
  if [[ -f "$LOG_FILE" ]]; then
    echo "--- server.log ---" >&2
    cat "$LOG_FILE" >&2
  fi
  rm -rf "$STATE_DIR"
  exit 1
}

case "$MODE" in
  dev)
    [[ -f "$REPO_ROOT/package.json" ]] || fail_launch "No package.json in $REPO_ROOT. App code does not exist yet; use --mode mockup for the design stand-in."
    (
      cd "$REPO_ROOT"
      exec npx vite --host 127.0.0.1 --port "$PORT" --strictPort
    ) >"$LOG_FILE" 2>&1 &
    SERVER_PID=$!
    ;;
  preview)
    [[ -f "$REPO_ROOT/package.json" ]] || fail_launch "No package.json in $REPO_ROOT. App code does not exist yet; use --mode mockup for the design stand-in."
    (cd "$REPO_ROOT" && npx vite build) >"$LOG_FILE" 2>&1 || fail_launch "vite build failed."
    (
      cd "$REPO_ROOT"
      exec npx vite preview --host 127.0.0.1 --port "$PORT" --strictPort
    ) >>"$LOG_FILE" 2>&1 &
    SERVER_PID=$!
    ;;
  mockup)
    [[ -f "$REPO_ROOT/docs/design/flipwise-mockup.html" ]] || fail_launch "Missing docs/design/flipwise-mockup.html."
    [[ -f "$REPO_ROOT/docs/design/deck.json" ]] || fail_launch "Missing docs/design/deck.json."
    URL="http://127.0.0.1:${PORT}/flipwise-mockup.html"
    node "$SCRIPT_DIR/serve-mockup.mjs" "$REPO_ROOT/docs/design" "$PORT" >"$LOG_FILE" 2>&1 &
    SERVER_PID=$!
    ;;
esac

# Wait until the page returns HTTP 200 and usable Flipwise markup.
READY=0
for _ in $(seq 1 40); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    fail_launch "Server process exited before becoming ready."
  fi
  BODY="$(curl -fsS --max-time 2 "$URL" 2>/dev/null || true)"
  if [[ -n "$BODY" && "$BODY" == *"Flipwise"* ]]; then
    if [[ "$MODE" == "mockup" ]]; then
      DECK_BODY="$(curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/deck.json" 2>/dev/null || true)"
      if [[ "$DECK_BODY" == *'"intro-to-robotics"'* ]]; then
        READY=1
        break
      fi
    else
      READY=1
      break
    fi
  fi
  sleep 0.5
done

if [[ "$READY" -ne 1 ]]; then
  fail_launch "Timed out waiting for Flipwise at $URL to become usable."
fi

cat >"${STATE_DIR}/state.env" <<EOF
RUN_ID='${RUN_ID}'
MODE='${MODE}'
PORT='${PORT}'
URL='${URL}'
SERVER_PID='${SERVER_PID}'
STATE_DIR='${STATE_DIR}'
PROFILE_DIR='${PROFILE_DIR}'
ARTIFACTS_DIR='${ARTIFACTS_DIR}'
REPO_ROOT='${REPO_ROOT}'
STARTED_AT='$(date -u +%Y-%m-%dT%H:%M:%SZ)'
EOF

printf '%s\n' "$RUN_ID" >"$LATEST_FILE"

echo "Launched Flipwise verification instance:"
echo "  RUN_ID:        $RUN_ID"
echo "  MODE:          $MODE"
echo "  URL:           $URL"
echo "  SERVER_PID:    $SERVER_PID"
echo "  PROFILE_DIR:   $PROFILE_DIR"
echo "  ARTIFACTS_DIR: $ARTIFACTS_DIR"
