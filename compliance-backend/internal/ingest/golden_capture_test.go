package ingest

import (
	"context"
	"math/big"
	"os"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"

	"compliance-backend/internal/testchain"
)

// TestCaptureGolden re-records testdata/eventscale-transfer.json from the dev stack. Run it when the
// eventscale pin in dev/eventscale/Dockerfile changes:
//
//	CAPTURE_GOLDEN=1 ANVIL_URL=http://127.0.0.1:8545 NATS_URL=nats://127.0.0.1:4222 go test ./internal/ingest -run CaptureGolden
func TestCaptureGolden(t *testing.T) {
	if os.Getenv("CAPTURE_GOLDEN") == "" {
		t.Skip("set CAPTURE_GOLDEN=1 to re-record the eventscale envelope")
	}
	c := testchain.Dial(t)
	c.PlaceToken(testchain.MUSD, "MockStable")
	payer := testchain.RandomAddress()
	c.Mint(testchain.MUSD, payer, big.NewInt(5_000_000))
	c.Transfer(testchain.MUSD, payer, goldenDeposit, big.NewInt(1_234_567))

	nc, err := nats.Connect(os.Getenv("NATS_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer nc.Close()
	js, _ := jetstream.New(nc)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cons, err := js.OrderedConsumer(ctx, "eventscale", jetstream.OrderedConsumerConfig{
		FilterSubjects: []string{"eventscale.events.anvil.MUSD.Transfer"}, DeliverPolicy: jetstream.DeliverLastPolicy})
	if err != nil {
		t.Fatal(err)
	}
	for ctx.Err() == nil {
		msg, err := cons.Next(jetstream.FetchMaxWait(5 * time.Second))
		if err != nil {
			continue
		}
		env, err := decodeEnvelope(msg.Data())
		if err == nil && env.To == goldenDeposit {
			if err := os.WriteFile("testdata/eventscale-transfer.json", msg.Data(), 0o644); err != nil {
				t.Fatal(err)
			}
			t.Logf("recorded %s", msg.Subject())
			return
		}
	}
	t.Fatal("no transfer to the golden deposit address arrived")
}

var goldenDeposit = common.HexToAddress("0x000000000000000000000000000000000000dEaD")
