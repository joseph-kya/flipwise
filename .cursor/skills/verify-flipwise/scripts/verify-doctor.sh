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
      echo "Usage: verify-doctor.sh [--run-id <id>]"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$RUN_ID" ]]; then
  if [[ -f "$LATEST_FILE" ]]; then
    RUN_ID="$(cat "$LATEST_FILE")"
  else
    echo "FAIL: No active verification run found. Launch one with verify-launch.sh." >&2
    exit 1
  fi
fi

STATE_FILE="/tmp/flipwise-verify-${RUN_ID}/state.env"
if [[ ! -f "$STATE_FILE" ]]; then
  echo "FAIL: State file not found: $STATE_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$STATE_FILE"

FAILURES=0
ok() { echo "  [OK]   $1"; }
fail() { echo "  [FAIL] $1" >&2; FAILURES=$((FAILURES + 1)); }

echo "Flipwise doctor (run=$RUN_ID mode=$MODE url=$URL)"

# 1. Server PID alive
if kill -0 "$SERVER_PID" 2>/dev/null; then
  ok "Server process $SERVER_PID is running"
else
  fail "Server process $SERVER_PID is not running"
fi

# 2. Port owned by SERVER_PID or one of its children
LISTEN_PIDS="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)"
OWNED=0
for lp in $LISTEN_PIDS; do
  if [[ "$lp" == "$SERVER_PID" ]]; then
    OWNED=1
    break
  fi
  PARENT_PID="$(ps -o ppid= -p "$lp" 2>/dev/null | tr -d ' ' || true)"
  if [[ "$PARENT_PID" == "$SERVER_PID" ]]; then
    OWNED=1
    break
  fi
done
if [[ "$OWNED" -eq 1 ]]; then
  ok "Port $PORT is owned by run PID $SERVER_PID"
else
  fail "Port $PORT is NOT owned by run PID $SERVER_PID (listeners: ${LISTEN_PIDS:-none})"
fi

# 3. Disposable profile dir isolation
if [[ "$PROFILE_DIR" == /tmp/flipwise-verify-* && -d "$PROFILE_DIR" ]]; then
  ok "Disposable browser profile isolated at $PROFILE_DIR"
else
  fail "Browser profile is missing or not isolated under /tmp/flipwise-verify-*: $PROFILE_DIR"
fi

# 4. Page responds with Flipwise markup
BODY="$(curl -fsS --max-time 3 "$URL" 2>/dev/null || true)"
if [[ -n "$BODY" && "$BODY" == *"Flipwise"* ]]; then
  ok "App entry $URL returns HTTP 200 with Flipwise content"
else
  fail "App entry $URL did not return expected Flipwise HTML"
fi

# 5. Mode-specific health
if [[ "$MODE" == "mockup" ]]; then
  PING="$(curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/.verify-ping" 2>/dev/null || true)"
  if [[ "$PING" == *"\"pid\":${SERVER_PID}"* ]]; then
    ok "Mockup server identity matches PID $SERVER_PID"
  else
    fail "Mockup server identity check failed: $PING"
  fi
  DECK_BODY="$(curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/deck.json" 2>/dev/null || true)"
  if [[ "$DECK_BODY" == *'"ir-l01-001"'* ]]; then
    ok "Seed deck.json reachable with intro-to-robotics cards"
  else
    fail "Seed deck.json missing or unreadable at http://127.0.0.1:${PORT}/deck.json"
  fi
elif [[ "$MODE" == "preview" ]]; then
  if curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/manifest.webmanifest" >/dev/null 2>&1 || \
     curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/manifest.json" >/dev/null 2>&1; then
    ok "PWA web manifest is reachable"
  else
    fail "PWA manifest not found at /manifest.webmanifest or /manifest.json"
  fi
fi

# 6. Playwright + cached browsers reachable via npx (no repo deps)
PW_CHECK="$(npx --yes -p playwright sh -c '
  PW_ROOT="$(dirname "$(dirname "$(command -v playwright)")")"
  NODE_PATH="$PW_ROOT" node -e "
    const fs = require(\"fs\");
    const { chromium, webkit } = require(\"playwright\");
    const c = fs.existsSync(chromium.executablePath());
    const w = fs.existsSync(webkit.executablePath());
    console.log(JSON.stringify({ chromium: c, webkit: w }));
  "
' 2>/dev/null || true)"

if [[ "$PW_CHECK" == *'"chromium":true'* ]]; then
  ok "Playwright Chromium available via npx ($PW_CHECK)"
else
  fail "Playwright Chromium not available via npx ($PW_CHECK)"
fi

# 7. Seed deck present in repo
if [[ -f "$REPO_ROOT/decks/intro-to-robotics.flipwise.json" ]]; then
  ok "Seed deck present at decks/intro-to-robotics.flipwise.json"
else
  fail "Missing seed deck decks/intro-to-robotics.flipwise.json"
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "Doctor FAILED ($FAILURES issue(s))." >&2
  exit 1
fi

echo "Doctor PASSED."
