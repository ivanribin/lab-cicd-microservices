#!/usr/bin/env bash
#
# Runs the end-to-end scenario against the cluster.
#
# When a service name is passed, that one service is reached through its preview
# Service (the colour that has no user traffic yet) while the rest are reached
# through their live Services. That is what lets the pipeline verify a new
# version before deciding whether it deserves traffic.
#
# Usage: run-e2e.sh [service-under-test]

set -euo pipefail

TARGET_SERVICE="${1:-}"
NAMESPACE="${NAMESPACE:-lab}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

AUTH_SVC=auth-service
ORDERS_SVC=orders-service
WEB_SVC=web-client

case "$TARGET_SERVICE" in
  auth-service) AUTH_SVC=auth-service-preview ;;
  orders-service) ORDERS_SVC=orders-service-preview ;;
  web-client) WEB_SVC=web-client-preview ;;
  "") ;;
  *) echo "[e2e] unknown service: ${TARGET_SERVICE}" >&2; exit 1 ;;
esac

echo "[e2e] auth=${AUTH_SVC} orders=${ORDERS_SVC} web=${WEB_SVC}"

PIDS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

forward() {
  kubectl -n "$NAMESPACE" port-forward "svc/$1" "$2:$3" >/dev/null 2>&1 &
  PIDS+=("$!")
}

wait_for() {
  local url="$1" attempts=40
  while [ "$attempts" -gt 0 ]; do
    if curl -sf -o /dev/null "$url"; then
      return 0
    fi
    attempts=$((attempts - 1))
    sleep 1
  done
  echo "[e2e] timed out waiting for ${url}" >&2
  return 1
}

forward "$AUTH_SVC" 3001 3000
forward "$ORDERS_SVC" 3002 3000
forward "$WEB_SVC" 8081 8080

wait_for http://127.0.0.1:3001/health
wait_for http://127.0.0.1:3002/health
wait_for http://127.0.0.1:8081/health

if [ -z "${DEMO_PASSWORD:-}" ]; then
  DEMO_PASSWORD="$(kubectl -n "$NAMESPACE" get secret lab-secrets \
    -o jsonpath='{.data.DEMO_PASSWORD}' | base64 -d)"
fi

AUTH_URL=http://127.0.0.1:3001 \
ORDERS_URL=http://127.0.0.1:3002 \
WEB_URL=http://127.0.0.1:8081 \
DEMO_USER="${DEMO_USER:-demo}" \
DEMO_PASSWORD="$DEMO_PASSWORD" \
  node "${REPO_ROOT}/e2e/run.js"
