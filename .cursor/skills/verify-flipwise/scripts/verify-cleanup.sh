#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
REPO_KEY="$(printf '%s' "$REPO_ROOT" | cksum | awk '{print $1}')"
LATEST_FILE="/tmp/flipwise-verify-latest-${REPO_KEY}"

RUN_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-id) RUN_ID="${2:-}"; shift 2 ;;
    -h|--help)
      echo "Usage: verify-cleanup.sh [--run-id <id>]"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$RUN_ID" ]]; then
  if [[ -f "$LATEST_FILE" ]]; then
    RUN_ID="$(cat "$LATEST_FILE")"
  else
    echo "Nothing to clean up (no active run pointer)."
    exit 0
  fi
fi

STATE_DIR="/tmp/flipwise-verify-${RUN_ID}"
STATE_FILE="${STATE_DIR}/state.env"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "State file not found ($STATE_FILE); removing residual state dir if present."
  rm -rf "$STATE_DIR"
  exit 0
fi

# shellcheck disable=SC1090
source "$STATE_FILE"

# Kill only the PID we started and its direct children (never pkill by name).
CHILD_PIDS="$(pgrep -P "$SERVER_PID" 2>/dev/null || true)"
TARGETS="$CHILD_PIDS $SERVER_PID"

for pid in $TARGETS; do
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
  fi
done

for _ in $(seq 1 20); do
  ALIVE=0
  for pid in $TARGETS; do
    if kill -0 "$pid" 2>/dev/null; then
      ALIVE=1
    fi
  done
  [[ "$ALIVE" -eq 0 ]] && break
  sleep 0.25
done

for pid in $TARGETS; do
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL "$pid" 2>/dev/null || true
  fi
done

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "WARNING: Port $PORT still has a listener after cleanup:" >&2
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >&2
  exit 1
fi

# Remove disposable profile and state dir only; NEVER remove ARTIFACTS_DIR.
rm -rf "$STATE_DIR"

if [[ -f "$LATEST_FILE" && "$(cat "$LATEST_FILE")" == "$RUN_ID" ]]; then
  rm -f "$LATEST_FILE"
fi

echo "Cleanup complete (run=$RUN_ID, port $PORT free, disposable profile removed)."
echo "Evidence preserved at: $ARTIFACTS_DIR"
