#!/usr/bin/env bash
# Compiles the e2e test tokens and writes their runtime bytecode, so tests need no Foundry at run time.
set -euo pipefail
cd "$(dirname "$0")"
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
forge build --root . --contracts src --out "$out" --cache-path "$out/cache" --use 0.8.30 >/dev/null
for c in MockStable PlainToken; do
  jq -r '.deployedBytecode.object' "$out/MockStable.sol/$c.json" >"$c.bin"
done
echo "wrote MockStable.bin PlainToken.bin"
