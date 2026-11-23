#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
REPO_KEY="$(printf '%s' "$REPO_ROOT" | cksum | awk '{print $1}')"
LATEST_FILE="/tmp/flipwise-verify-latest-${REPO_KEY}"

if [[ $# -lt 1 ]]; then
  echo "Usage: verify-drive.sh <study-session|scheduling|navigation|import|offline|audit> [--run-id <id>] [--browser chromium|webkit] [--strict]" >&2
  exit 2
fi

SCENARIO="$1"
shift

RUN_ID=""
BROWSER="chromium"
STRICT="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-id) RUN_ID="${2:-}"; shift 2 ;;
    --browser) BROWSER="${2:-}"; shift 2 ;;
    --strict) STRICT="1"; shift ;;
    -h|--help)
      echo "Usage: verify-drive.sh <study-session|scheduling|navigation|import|offline|audit> [--run-id <id>] [--browser chromium|webkit] [--strict]"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$RUN_ID" ]]; then
  if [[ -f "$LATEST_FILE" ]]; then
    RUN_ID="$(cat "$LATEST_FILE")"
  else
    echo "ERROR: No active verification run found. Launch one with verify-launch.sh." >&2
    exit 1
  fi
fi

STATE_FILE="/tmp/flipwise-verify-${RUN_ID}/state.env"
if [[ ! -f "$STATE_FILE" ]]; then
  echo "ERROR: State file not found: $STATE_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$STATE_FILE"

export VERIFY_SCENARIO="$SCENARIO"
export VERIFY_BROWSER="$BROWSER"
export VERIFY_STRICT="$STRICT"
export VERIFY_MODE="$MODE"
export VERIFY_URL="$URL"
export VERIFY_PROFILE_DIR="$PROFILE_DIR"
export VERIFY_ARTIFACTS_DIR="$ARTIFACTS_DIR"
export VERIFY_REPO_ROOT="$REPO_ROOT"
export VERIFY_RUN_ID="$RUN_ID"

exec npx --yes -p playwright sh -c '
  PW_ROOT="$(dirname "$(dirname "$(command -v playwright)")")"
  NODE_PATH="$PW_ROOT" exec node "$1"
' _ "$SCRIPT_DIR/drive.mjs"
