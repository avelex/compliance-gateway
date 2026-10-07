// Spike T2 subscriber: prints every Transfer eventscale publishes, with its block location.
package main

import (
	"context"
	"fmt"
	"math/big"
	"os"
	"os/signal"

	"github.com/ethereum/go-ethereum/common"
	eventscale "github.com/eventscale/eventscale/pkg/sdk-go"
)

type transfer struct {
	From  common.Address `json:"from"`
	To    common.Address `json:"to"`
	Value *big.Int       `json:"value"`
}

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()

	ectx, err := eventscale.Connect(ctx, os.Args[1])
	if err != nil {
		panic(err)
	}
	sub, err := eventscale.SubscribeEvent(ectx, func(_ context.Context, e eventscale.Event) error {
		var t transfer
		if err := e.Decode(&t); err != nil {
			return err
		}
		m := e.MetaData
		fmt.Printf("EVENT block=%d hash=%s tx=%s log=%d value=%s\n", m.BlockNumber, m.BlockHash.Hex(), m.TxHash.Hex(), m.LogIndex, t.Value)
		return nil
	}, eventscale.WithNetwork("anvil"), eventscale.WithContract("TOK"), eventscale.WithEvent("Transfer"))
	if err != nil {
		panic(err)
	}
	fmt.Println("SUBSCRIBED")
	sub.Start(ctx)
}
