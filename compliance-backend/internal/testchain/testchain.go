// Package testchain drives the dev-stack anvil for tests: places the e2e tokens at fixed addresses,
// mints, sends transfers from impersonated payers, and mines blocks.
package testchain

import (
	"context"
	"math/big"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/rpc"
)

// MUSD is where tests place MockStable; dev/eventscale/config.yaml watches this address.
var MUSD = common.HexToAddress("0x000000000000000000000000000000000000b0b5")

type Chain struct {
	t   testing.TB
	RPC *rpc.Client
	Eth *ethclient.Client
	URL string
}

// URL returns ANVIL_URL or skips.
func URL(t testing.TB) string {
	u := os.Getenv("ANVIL_URL")
	if u == "" {
		t.Skip("ANVIL_URL not set; run `docker compose up -d` and export ANVIL_URL=http://127.0.0.1:8545")
	}
	return u
}

func Dial(t testing.TB) *Chain {
	t.Helper()
	u := URL(t)
	c, err := rpc.Dial(u)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.Close)
	return &Chain{t: t, RPC: c, Eth: ethclient.NewClient(c), URL: u}
}

func (c *Chain) call(method string, args ...any) {
	c.t.Helper()
	if err := c.RPC.CallContext(context.Background(), nil, method, args...); err != nil {
		c.t.Fatalf("%s: %v", method, err)
	}
}

// PlaceToken puts the runtime code of e2e/<name>.bin at addr.
func (c *Chain) PlaceToken(addr common.Address, name string) {
	c.t.Helper()
	_, file, _, _ := runtime.Caller(0)
	raw, err := os.ReadFile(filepath.Join(filepath.Dir(file), "..", "..", "e2e", name+".bin"))
	if err != nil {
		c.t.Fatal(err)
	}
	c.call("anvil_setCode", addr, strings.TrimSpace(string(raw)))
}

// RandomAddress returns a fresh address so reruns against the same anvil do not collide.
func RandomAddress() common.Address {
	k, _ := crypto.GenerateKey()
	return crypto.PubkeyToAddress(k.PublicKey)
}

// Send executes calldata from an impersonated account and waits for the receipt; returns the tx hash.
func (c *Chain) Send(from, to common.Address, data []byte) common.Hash {
	return c.SendReceipt(from, to, data).TxHash
}

// SendReceipt is Send returning the receipt.
func (c *Chain) SendReceipt(from, to common.Address, data []byte) *types.Receipt {
	c.t.Helper()
	c.call("anvil_setBalance", from, hexutil.EncodeBig(big.NewInt(1e18)))
	c.call("anvil_impersonateAccount", from)
	var h common.Hash
	tx := map[string]any{"from": from, "to": to, "data": hexutil.Bytes(data), "gas": "0x100000"}
	if err := c.RPC.CallContext(context.Background(), &h, "eth_sendTransaction", tx); err != nil {
		c.t.Fatalf("eth_sendTransaction: %v", err)
	}
	c.call("anvil_mine", "0x1")
	for i := 0; i < 50; i++ {
		if r, err := c.Eth.TransactionReceipt(context.Background(), h); err == nil {
			if r.Status != 1 {
				c.t.Fatalf("tx %s reverted", h)
			}
			return r
		}
		time.Sleep(100 * time.Millisecond)
	}
	c.t.Fatalf("no receipt for %s", h)
	return nil
}

func word(a common.Address) []byte { return common.LeftPadBytes(a.Bytes(), 32) }

func sel(sig string) []byte { return crypto.Keccak256([]byte(sig))[:4] }

func (c *Chain) Mint(token, to common.Address, amount *big.Int) common.Hash {
	return c.Send(RandomAddress(), token, append(append(sel("mint(address,uint256)"), word(to)...), common.LeftPadBytes(amount.Bytes(), 32)...))
}

func (c *Chain) Transfer(token, from, to common.Address, amount *big.Int) common.Hash {
	return c.Send(from, token, append(append(sel("transfer(address,uint256)"), word(to)...), common.LeftPadBytes(amount.Bytes(), 32)...))
}

// TransferLog transfers and returns the tx hash and the block-level index of its Transfer log, which
// is what a paymentId is derived from.
func (c *Chain) TransferLog(token, from, to common.Address, amount *big.Int) (common.Hash, uint64) {
	r := c.SendReceipt(from, token, append(append(sel("transfer(address,uint256)"), word(to)...), common.LeftPadBytes(amount.Bytes(), 32)...))
	return r.TxHash, uint64(r.Logs[0].Index)
}

func (c *Chain) Blacklist(token, who common.Address) common.Hash {
	return c.Send(RandomAddress(), token, append(append(sel("blacklist(address,bool)"), word(who)...), common.LeftPadBytes([]byte{1}, 32)...))
}

// Mine produces n blocks now.
func (c *Chain) Mine(n int) { c.call("anvil_mine", hexutil.EncodeUint64(uint64(n))) }

func (c *Chain) Head() uint64 {
	c.t.Helper()
	n, err := c.Eth.BlockNumber(context.Background())
	if err != nil {
		c.t.Fatal(err)
	}
	return n
}
