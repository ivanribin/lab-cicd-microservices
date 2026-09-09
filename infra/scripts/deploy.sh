#!/usr/bin/env bash
#
# Blue-green deployment for one service.
#
#   1. read the colour the main Service currently points at
#   2. roll out the opposite colour with the new image, traffic untouched
#   3. run e2e tests against the preview Service
#   4. switch the main Service only if those tests pass
#   5. otherwise disable the new colour and exit non-zero
#
# Usage: deploy.sh <service> <image-tag>

set -euo pipefail

SERVICE="${1:?usage: deploy.sh <service> <image-tag>}"
TAG="${2:?usage: deploy.sh <service> <image-tag>}"

NAMESPACE="${NAMESPACE:-lab}"
TIMEOUT="${HELM_TIMEOUT:-5m}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CHART_DIR="${REPO_ROOT}/infra/helm/microservice"
VALUES_FILE="${REPO_ROOT}/infra/helm/values/${SERVICE}.yaml"

log() { echo "[deploy][${SERVICE}] $*"; }

if [ "$TAG" = "latest" ]; then
  log "refusing to deploy the 'latest' tag"
  exit 1
fi

active_color() {
  kubectl -n "$NAMESPACE" get svc "$SERVICE" \
    -o jsonpath='{.spec.selector.color}' 2>/dev/null || true
}

tag_of_color() {
  kubectl -n "$NAMESPACE" get deploy "${SERVICE}-$1" \
    -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null \
    | awk -F: '{ print $NF }'
}

opposite_of() {
  if [ "$1" = "blue" ]; then echo green; else echo blue; fi
}

release_service() {
  local traffic_color="$1" blue_tag="$2" green_tag="$3" blue_on="$4" green_on="$5"

  helm upgrade --install "$SERVICE" "$CHART_DIR" \
    --namespace "$NAMESPACE" \
    --values "$VALUES_FILE" \
    --set "activeColor=${traffic_color}" \
    --set "colors.blue.enabled=${blue_on}" \
    --set "colors.blue.tag=${blue_tag}" \
    --set "colors.green.enabled=${green_on}" \
    --set "colors.green.tag=${green_tag}" \
    --set "migrations.tag=${TAG}" \
    --atomic --timeout "$TIMEOUT"
}

ACTIVE="$(active_color)"

if [ -z "$ACTIVE" ]; then
  log "no running colour detected, performing the initial blue release with tag ${TAG}"
  release_service blue "$TAG" "$TAG" true false
  kubectl -n "$NAMESPACE" rollout status "deploy/${SERVICE}-blue" --timeout="$TIMEOUT"
  log "initial release complete, traffic is served by blue"
  exit 0
fi

TARGET="$(opposite_of "$ACTIVE")"
ACTIVE_TAG="$(tag_of_color "$ACTIVE")"

log "active colour ${ACTIVE} runs ${ACTIVE_TAG}, rolling out ${TARGET} with ${TAG}"

if [ "$ACTIVE" = "blue" ]; then
  release_service "$ACTIVE" "$ACTIVE_TAG" "$TAG" true true
else
  release_service "$ACTIVE" "$TAG" "$ACTIVE_TAG" true true
fi

kubectl -n "$NAMESPACE" rollout status "deploy/${SERVICE}-${TARGET}" --timeout="$TIMEOUT"
log "${TARGET} is ready but receives no user traffic yet"

if bash "${SCRIPT_DIR}/run-e2e.sh" "$SERVICE"; then
  log "e2e passed against the preview Service, switching traffic to ${TARGET}"

  if [ "$ACTIVE" = "blue" ]; then
    release_service "$TARGET" "$ACTIVE_TAG" "$TAG" true true
  else
    release_service "$TARGET" "$TAG" "$ACTIVE_TAG" true true
  fi

  log "traffic now served by ${TARGET} (${TAG}); ${ACTIVE} stays warm for a fast rollback"
  exit 0
fi

log "e2e FAILED against ${TARGET}, user traffic never left ${ACTIVE}"
bash "${SCRIPT_DIR}/rollback.sh" "$SERVICE" "$ACTIVE" "$ACTIVE_TAG"
exit 1
