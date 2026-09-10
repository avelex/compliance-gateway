#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKFLOW="$ROOT/attestor-workflow"
CONTRACTS="$ROOT/contracts"
ABI_DIR="$WORKFLOW/contracts/abi"

CONTRACT_NAMES=(AttestationRegistry GatewayFactory MerchantGateway)

(cd "$CONTRACTS" && forge build)

rm -rf "$ABI_DIR"
mkdir -p "$ABI_DIR"
for name in "${CONTRACT_NAMES[@]}"; do
	cp "$CONTRACTS/out/$name.sol/$name.json" "$ABI_DIR/$name.json"
done

rm -rf "$WORKFLOW/contracts/evm"

(cd "$WORKFLOW" && cre generate-bindings evm -a ./contracts/abi -p . -k bindings -l go --non-interactive)
