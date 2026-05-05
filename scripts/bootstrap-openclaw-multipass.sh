#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

OPENCLAW_AZURE_REPO="${OPENCLAW_AZURE_REPO:-$HOME/.openclaw/workspaces/openclaw-on-azure/repo}"
OPENCLAW_DEPLOYMENT_PLAN="${OPENCLAW_DEPLOYMENT_PLAN:-deployments/stotz-corp-sales.json}"
VM_NAME="${VM_NAME:-trade-in-agent-dev}"
OPENCLAW_STRICT_QA="${OPENCLAW_STRICT_QA:-0}"

if [[ ! -d "$OPENCLAW_AZURE_REPO" ]]; then
  echo "ERROR: OPENCLAW_AZURE_REPO does not exist: $OPENCLAW_AZURE_REPO"
  exit 1
fi

if [[ ! -f "$OPENCLAW_AZURE_REPO/$OPENCLAW_DEPLOYMENT_PLAN" && ! -f "$OPENCLAW_DEPLOYMENT_PLAN" ]]; then
  echo "ERROR: OpenClaw deployment plan not found: $OPENCLAW_DEPLOYMENT_PLAN"
  echo "       Looked relative to: $OPENCLAW_AZURE_REPO"
  exit 1
fi

if [[ ! -x "$OPENCLAW_AZURE_REPO/scripts/local/qa.sh" ]]; then
  echo "ERROR: OpenClaw local QA script is not executable: $OPENCLAW_AZURE_REPO/scripts/local/qa.sh"
  exit 1
fi

echo "Bootstrapping OpenClaw deployment into Multipass VM '$VM_NAME'..."
echo "  OpenClaw Azure repo: $OPENCLAW_AZURE_REPO"
echo "  Deployment plan: $OPENCLAW_DEPLOYMENT_PLAN"

if ! (
  cd "$OPENCLAW_AZURE_REPO"
  KEEP_VM="${KEEP_VM:-1}" \
  PUBLIC_FQDN="${PUBLIC_FQDN:-localhost}" \
  TIMEOUT_SECS="${TIMEOUT_SECS:-600}" \
  ./scripts/local/qa.sh "$VM_NAME" --plan "$OPENCLAW_DEPLOYMENT_PLAN"
); then
  if [[ "$OPENCLAW_STRICT_QA" == "1" ]]; then
    echo "ERROR: OpenClaw local QA failed and OPENCLAW_STRICT_QA=1."
    exit 1
  fi

  echo "WARNING: OpenClaw local QA returned nonzero."
  echo "         Continuing because OPENCLAW_STRICT_QA is not set."
  echo "         Verifying the gateway is active before installing the sidecar..."
  multipass exec "$VM_NAME" -- sudo systemctl is-active --quiet openclaw-gateway
fi

echo "OpenClaw local deployment is ready. Installing trade-in sidecar onto the same VM..."
VM_NAME="$VM_NAME" "$ROOT/scripts/bootstrap-multipass.sh"

echo "OpenClaw + trade-in sidecar bootstrap complete for $VM_NAME."
echo "Validate OpenClaw:"
echo "  multipass exec $VM_NAME -- sudo systemctl is-active openclaw-gateway"
echo "Validate sidecar:"
echo "  multipass exec $VM_NAME -- sudo systemctl is-active trade-in-agent-sidecar.service"
echo "Run sidecar smoke test:"
echo "  multipass exec $VM_NAME -- bash -lc 'cd /home/ubuntu/trade-in-agent && ./scripts/smoke-test.sh'"
