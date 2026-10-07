# Spike T2: eventscale under a reorg

- **eventscale commit:** `748a8ef11e66322d0999a89da6d77bedb2118aac` (2025-12-18, `main`)
- **Chain:** local `anvil` (Foundry 1.5.1), auto-mining
- **Date:** 2026-10-07

## Result

| # | Finding | Evidence | Impact on design |
|---|---|---|---|
| 1 | **Orphaned logs are emitted and never retracted.** eventscale processes every block once, at the chain head (`BlockListener.calculateBlockRange` goes up to `currentBlock`). It has no confirmation depth and never looks at `removed`. | `Transfer 111` in block 2, hash `0xd90c…a101`, was published. After the reorg, block 2 is `0x5e6d…8eb1` and no longer contains it. eventscale published nothing to undo it. | Expected. D4's finaliser (re-read the receipt at `head - N` and compare the block hash) catches this. |
| 2 | **Logs in replacement blocks are dropped.** After a reorg, the replaced heights count as already processed, so logs in the new canonical blocks are never published. | The canonical chain now has `Transfer 222` in block 2. The subscriber never received it, even after two more blocks. | **D4 alone is not enough.** A finaliser can only recheck logs it has seen, and this log never arrives. |
| 3 | **A restart with persisted state panics.** The cursor is written as raw bytes (`fmt.Sprintf("%d")`) but read with `json.Unmarshal` into a `string`. | Second start: `failed to unmarshal started block: json: cannot unmarshal number into Go value of type string`, then `panic: netrunner anvil failed`. | eventscale cannot resume after a restart today. Production use needs this fixed. |
| 4 | **SDK subscribers start at the last message.** `SubscribeEvent` creates its consumer with `DeliverPolicy: DeliverLastPolicy` and no durable name. A subscriber that restarts or connects late gets only the newest event, not the backlog. | Code: `pkg/sdk-go/event.go:83-89`. Seen in the run: a subscriber connected after `Transfer 333` received only that event. | The backend must use its own durable JetStream consumer with `DeliverAll` or by-start-sequence, not `SubscribeEvent` as is. |
| 5 | Minor: an idle chain logs `[ERR] ... waiting for new blocks` every interval. | `es.log` | Alerting noise. |

## Conclusion for D4

Treat eventscale as a **low-latency hint, not the source of truth for deposits**. Two changes are needed:

1. **In eventscale** (upstream fixes; the user owns the project):
   - add a per-network `confirmations` setting so the listener processes only up to `head - confirmations`;
   - fix the cursor encoding (finding 3);
   - let SDK callers choose a durable consumer and its deliver policy (finding 4).
   With `confirmations` set at or above the chain's practical reorg depth, findings 1 and 2 do not occur.
2. **In compliance-backend**, as a safety net that does not depend on eventscale:
   - a **reconciler** runs `eth_getLogs` for the processor's deposit addresses or contracts over `[last_reconciled + 1, head - N]` on a schedule;
   - it upserts by `(chain_id, tx_hash, log_index)`;
   - it marks rows whose block hash no longer matches as `orphaned`.
   This closes finding 2 even if eventscale misses a log. It also covers the 90-day retro backfill in mode (b) with the same code.

## Reproduce

```sh
# 1. eventscale at the tested commit
git clone https://github.com/eventscale/eventscale && git -C eventscale checkout 748a8ef11e66322d0999a89da6d77bedb2118aac
(cd eventscale && go build -o ../eventscale-bin ./cmd)

# 2. chain and token (files in spikes/eventscale-reorg/)
anvil --port 8645 --silent &
K=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil test key
(cd tok && forge create src/Tok.sol:Tok --rpc-url http://127.0.0.1:8645 --private-key $K --broadcast)
TOK=<deployed address>

# 3. eventscale config: NATS on 4322, network "anvil", Transfer on $TOK aliased "TOK",
#    blocks_proc {batch_limit: 10, interval: 1s}; then
./eventscale-bin -c config.yaml &
# subscriber: spikes/eventscale-reorg/sub; its go.mod replaces eventscale with ../eventscale, so clone it into spikes/eventscale-reorg/
(cd sub && go run . nats://127.0.0.1:4322) &

# 4. emit, then replace the block with a different transfer
R=http://127.0.0.1:8645; TO=0x000000000000000000000000000000000000dEaD
cast send $TOK "t(address,uint256)" $TO 111 --rpc-url $R --private-key $K
cast rpc anvil_mine 2 --rpc-url $R
DATA=$(cast calldata "t(address,uint256)" $TO 222)
cast rpc anvil_reorg --raw "[3, [[{\"from\":\"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\",\"to\":\"$TOK\",\"data\":\"$DATA\",\"gas\":\"0x30000\"},0]]]" --rpc-url $R
cast rpc anvil_mine 2 --rpc-url $R
# subscriber printed value=111 only; `cast logs --address $TOK --from-block 0` shows value=222 only.

# 5. restart eventscale with the same NATS store_dir -> panic (finding 3)
```
