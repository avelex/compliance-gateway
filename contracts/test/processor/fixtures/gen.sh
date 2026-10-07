#!/usr/bin/env bash
# Regenerates decision-eip712.json: one Deflow Decision per kind, signed by `cast wallet sign --data`
# with anvil key 0. cast is an EIP-712 implementation independent of the hub and of the Go backend;
# ECDSA here is RFC 6979 deterministic, so equal signatures mean equal digests.
set -euo pipefail
cd "$(dirname "$0")"

KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # anvil 0, test only
CHAIN_ID=31337
VERIFYING=0x5Abe6E7c1fE5d3F72a93c0f1Bf05cdA05F4161f6
TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e
AMOUNT=100000000
PACK=0x441bcff8a5eec272813a04f65aa31cce8ec3e34b696ad30a6c4fd326aedd865a
PAYMENT=$(cast keccak "$(cast abi-encode 'f(uint256,bytes32,uint256)' 84532 \
  0x9d3c8f0e5b2a71c4d6e8f0a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1 7)")
DEADLINE=1789999999

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

cases=()
for spec in CREDIT:1:1 HOLD:2:1 FREEZE:3:2 RETURN:4:1; do
  IFS=: read -r name kind nonce <<<"$spec"
  jq -n --arg v "$VERIFYING" --argjson c "$CHAIN_ID" --arg p "$PAYMENT" --arg k "$kind" --arg t "$TOKEN" \
    --arg a "$AMOUNT" --arg h "$PACK" --arg n "$nonce" --arg d "$DEADLINE" '{
    types: {
      EIP712Domain: [{name:"name",type:"string"},{name:"version",type:"string"},
                     {name:"chainId",type:"uint256"},{name:"verifyingContract",type:"address"}],
      Decision: [{name:"paymentId",type:"bytes32"},{name:"decision",type:"uint8"},
                 {name:"token",type:"address"},{name:"amount",type:"uint256"},
                 {name:"packHash",type:"bytes32"},{name:"nonce",type:"uint64"},{name:"deadline",type:"uint64"}]
    },
    primaryType: "Decision",
    domain: {name:"Deflow Decision", version:"1", chainId:$c, verifyingContract:$v},
    message: {paymentId:$p, decision:$k, token:$t, amount:$a, packHash:$h, nonce:$n, deadline:$d}
  }' >"$tmp/$name.json"
  sig=$(cast wallet sign --private-key "$KEY" --data --from-file "$tmp/$name.json")
  cases+=("$(jq -c --arg name "$name" --arg sig "$sig" '{name:$name, typedData:., signature:$sig}' "$tmp/$name.json")")
done

printf '%s\n' "${cases[@]}" | jq -s --arg signer "$(cast wallet address --private-key "$KEY")" \
  '{description:"Deflow Decision EIP-712 vectors (processor-decision-contracts D4). Test key only.", signer:$signer, cases:.}' \
  >decision-eip712.json
echo "wrote $(pwd)/decision-eip712.json"
