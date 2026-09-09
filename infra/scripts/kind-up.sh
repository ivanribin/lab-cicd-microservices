#!/usr/bin/env bash
#
# Brings the whole stack up on a local kind cluster: cluster, secrets, database,
# monitoring, then a blue-green release of every service.
#
# Requires: docker, kind, helm, kubectl, node.
# Reads secrets from .env in the repository root (see .env.example).

set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-lab}"
NAMESPACE="${NAMESPACE:-lab}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
REGISTRY="${REGISTRY:-ghcr.io/ivanribin}"

log() { echo "[kind-up] $*"; }

for tool in docker kind helm kubectl node; do
  command -v "$tool" >/dev/null 2>&1 || { echo "missing required tool: ${tool}" >&2; exit 1; }
done

if [ ! -f "${REPO_ROOT}/.env" ]; then
  echo "missing ${REPO_ROOT}/.env, copy .env.example and fill in real values" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "${REPO_ROOT}/.env"
set +a

TAG="local-$(git -C "$REPO_ROOT" rev-parse --short=7 HEAD 2>/dev/null || echo manual)"

if ! kind get clusters 2>/dev/null | grep -qx "$CLUSTER_NAME"; then
  log "creating kind cluster ${CLUSTER_NAME}"
  kind create cluster --name "$CLUSTER_NAME" --config "${REPO_ROOT}/infra/kind-config.yaml"
else
  log "kind cluster ${CLUSTER_NAME} already exists"
fi

kubectl config use-context "kind-${CLUSTER_NAME}"

log "applying namespace and RBAC"
kubectl apply -f "${REPO_ROOT}/infra/k8s/namespace.yaml"
kubectl apply -f "${REPO_ROOT}/infra/k8s/rbac.yaml"

log "creating lab-secrets"
kubectl -n "$NAMESPACE" create secret generic lab-secrets \
  --from-literal=JWT_SECRET="$JWT_SECRET" \
  --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  --from-literal=DEMO_USER="${DEMO_USER:-demo}" \
  --from-literal=DEMO_PASSWORD="$DEMO_PASSWORD" \
  --from-literal=GRAFANA_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD:-$DEMO_PASSWORD}" \
  --from-literal=DATABASE_URL="postgres://lab:${POSTGRES_PASSWORD}@postgresql:5432/lab" \
  --dry-run=client -o yaml | kubectl apply -f -

log "building images with tag ${TAG}"
for service in auth-service orders-service web-client; do
  docker build -t "${REGISTRY}/${service}:${TAG}" "${REPO_ROOT}/${service}"
  kind load docker-image "${REGISTRY}/${service}:${TAG}" --name "$CLUSTER_NAME"
done

log "installing PostgreSQL"
helm upgrade --install postgresql "${REPO_ROOT}/infra/helm/postgresql" \
  --namespace "$NAMESPACE" --wait --timeout 5m

log "installing monitoring"
helm upgrade --install monitoring "${REPO_ROOT}/infra/helm/monitoring" \
  --namespace "$NAMESPACE" --wait --timeout 5m

for service in auth-service orders-service web-client; do
  log "deploying ${service}"
  bash "${SCRIPT_DIR}/deploy.sh" "$service" "$TAG"
done

log "stack is up"
echo
echo "  application:  http://localhost:8080"
echo "  grafana:      http://localhost:3000  (anonymous viewer access is enabled)"
echo "  prometheus:   http://localhost:9090"
echo
echo "  active colours:"
for service in auth-service orders-service web-client; do
  color="$(kubectl -n "$NAMESPACE" get svc "$service" -o jsonpath='{.spec.selector.color}')"
  echo "    ${service}: ${color}"
done
