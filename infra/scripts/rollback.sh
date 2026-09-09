#!/usr/bin/env bash
#
# Rollback for a blue-green release.
#
# Called automatically by deploy.sh when e2e tests fail, and usable by hand to
# undo a switch that already happened. Both cases end the same way: the main
# Service points at <keep-colour> and the other colour is scaled away.
#
# Usage: rollback.sh <service> <keep-colour> [keep-tag]

set -euo pipefail

SERVICE="${1:?usage: rollback.sh <service> <keep-colour> [keep-tag]}"
KEEP_COLOR="${2:?usage: rollback.sh <service> <keep-colour> [keep-tag]}"
KEEP_TAG="${3:-}"

NAMESPACE="${NAMESPACE:-lab}"
TIMEOUT="${HELM_TIMEOUT:-5m}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CHART_DIR="${REPO_ROOT}/infra/helm/microservice"
VALUES_FILE="${REPO_ROOT}/infra/helm/values/${SERVICE}.yaml"

log() { echo "[rollback][${SERVICE}] $*"; }

if [ -z "$KEEP_TAG" ]; then
  KEEP_TAG="$(kubectl -n "$NAMESPACE" get deploy "${SERVICE}-${KEEP_COLOR}" \
    -o jsonpath='{.spec.template.spec.containers[0].image}' | awk -F: '{ print $NF }')"
fi

log "restoring ${KEEP_COLOR} (${KEEP_TAG}) as the only serving colour"

if [ "$KEEP_COLOR" = "blue" ]; then
  BLUE_ENABLED=true
  GREEN_ENABLED=false
  BLUE_TAG="$KEEP_TAG"
  GREEN_TAG="$KEEP_TAG"
else
  BLUE_ENABLED=false
  GREEN_ENABLED=true
  BLUE_TAG="$KEEP_TAG"
  GREEN_TAG="$KEEP_TAG"
fi

if ! helm upgrade --install "$SERVICE" "$CHART_DIR" \
  --namespace "$NAMESPACE" \
  --values "$VALUES_FILE" \
  --set "activeColor=${KEEP_COLOR}" \
  --set "colors.blue.enabled=${BLUE_ENABLED}" \
  --set "colors.blue.tag=${BLUE_TAG}" \
  --set "colors.green.enabled=${GREEN_ENABLED}" \
  --set "colors.green.tag=${GREEN_TAG}" \
  --set "migrations.enabled=false" \
  --atomic --timeout "$TIMEOUT"; then

  log "helm upgrade failed, falling back to 'helm rollback' on the previous revision"
  helm rollback "$SERVICE" --namespace "$NAMESPACE" --wait --timeout "$TIMEOUT"
fi

kubectl -n "$NAMESPACE" rollout status "deploy/${SERVICE}-${KEEP_COLOR}" --timeout="$TIMEOUT"

RESTORED="$(kubectl -n "$NAMESPACE" get svc "$SERVICE" -o jsonpath='{.spec.selector.color}')"
log "done, Service now selects colour: ${RESTORED}"
