package ingest

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"sync/atomic"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"

	"compliance-backend/internal/config"
	"compliance-backend/internal/store"
)

// HintStatus values reported on /healthz.
const (
	HintDisabled = "disabled"
	HintDegraded = "degraded"
	HintOK       = "ok"
)

// envelope is eventscale's message at 748a8ef (internal/types.Event); data is base64 of the decoded event.
// The service decodes it itself rather than importing eventscale's internal package.
type envelope struct {
	Meta struct {
		ChainID     uint64         `json:"chain_id"`
		Contract    common.Address `json:"contract"`
		Name        string         `json:"name"`
		BlockNumber uint64         `json:"block_number"`
		BlockHash   common.Hash    `json:"block_hash"`
		TxHash      common.Hash    `json:"tx_hash"`
		LogIndex    uint64         `json:"log_index"`
		Timestamp   int64          `json:"timestamp"`
	} `json:"meta"`
	Data []byte `json:"data"`
}

func decodeEnvelope(raw []byte) (Deposit, error) {
	var e envelope
	if err := json.Unmarshal(raw, &e); err != nil {
		return Deposit{}, err
	}
	if e.Meta.Name != "Transfer" {
		return Deposit{}, fmt.Errorf("not a Transfer: %q", e.Meta.Name)
	}
	var t struct {
		From  common.Address `json:"from"`
		To    common.Address `json:"to"`
		Value json.Number    `json:"value"`
	}
	if err := json.Unmarshal(e.Data, &t); err != nil {
		return Deposit{}, fmt.Errorf("event data: %w", err)
	}
	amount, ok := new(big.Int).SetString(t.Value.String(), 10)
	if !ok || amount.Sign() < 0 {
		return Deposit{}, fmt.Errorf("bad value %q", t.Value)
	}
	return Deposit{
		ChainID: e.Meta.ChainID, TxHash: e.Meta.TxHash, LogIndex: e.Meta.LogIndex,
		BlockNumber: e.Meta.BlockNumber, BlockHash: e.Meta.BlockHash, BlockTime: time.Unix(e.Meta.Timestamp, 0).UTC(),
		Token: e.Meta.Contract, Payer: t.From, To: t.To, Amount: amount,
	}, nil
}

// Hint consumes eventscale through durable JetStream consumers (deliver-all, explicit ack), one per
// chain and token. It is optional: the reconciler never waits for it.
type Hint struct {
	st     *store.Store
	cfg    *config.Config
	log    *slog.Logger
	status atomic.Value
}

func NewHint(st *store.Store, cfg *config.Config, log *slog.Logger) *Hint {
	h := &Hint{st: st, cfg: cfg, log: log.With("component", "hint")}
	if cfg.NATSURL == "" {
		h.status.Store(HintDisabled)
	} else {
		h.status.Store(HintDegraded)
	}
	return h
}

func (h *Hint) Status() string { return h.status.Load().(string) }

// ConsumerName is the durable consumer for one chain's token.
func ConsumerName(chainID uint64, alias string) string {
	return fmt.Sprintf("compliance-backend-%d-%s", chainID, alias)
}

// Run connects and consumes until ctx ends, reconnecting with backoff while NATS or the stream is missing.
func (h *Hint) Run(ctx context.Context) {
	if h.cfg.NATSURL == "" {
		return
	}
	backoff := time.Second
	for ctx.Err() == nil {
		err := h.consume(ctx)
		h.status.Store(HintDegraded)
		if ctx.Err() != nil {
			return
		}
		h.log.Warn("eventscale hint unavailable; reconciler continues", "err", err, "retry_in", backoff)
		select {
		case <-ctx.Done():
		case <-time.After(backoff):
		}
		backoff = min(backoff*2, 30*time.Second)
	}
}

func (h *Hint) consume(ctx context.Context) error {
	nc, err := nats.Connect(h.cfg.NATSURL, nats.MaxReconnects(0))
	if err != nil {
		return err
	}
	defer nc.Close()
	closed := make(chan struct{})
	nc.SetClosedHandler(func(*nats.Conn) { close(closed) })
	js, err := jetstream.New(nc)
	if err != nil {
		return err
	}
	var running []jetstream.ConsumeContext
	defer func() {
		for _, r := range running {
			r.Stop()
		}
	}()
	for i := range h.cfg.Chains {
		ch := &h.cfg.Chains[i]
		if ch.EventscaleNetwork == "" {
			continue
		}
		for _, t := range ch.Tokens {
			if t.EventscaleAlias == "" {
				continue
			}
			cons, err := js.CreateOrUpdateConsumer(ctx, "eventscale", jetstream.ConsumerConfig{
				Durable:       ConsumerName(ch.ChainID, t.EventscaleAlias),
				FilterSubject: fmt.Sprintf("eventscale.events.%s.%s.Transfer", ch.EventscaleNetwork, t.EventscaleAlias),
				DeliverPolicy: jetstream.DeliverAllPolicy,
				AckPolicy:     jetstream.AckExplicitPolicy,
				AckWait:       30 * time.Second,
			})
			if err != nil {
				return err
			}
			cc, err := cons.Consume(func(m jetstream.Msg) { h.handle(ctx, ch, m) })
			if err != nil {
				return err
			}
			running = append(running, cc)
		}
	}
	if len(running) == 0 {
		return errors.New("no chain has an eventscale network and token alias configured")
	}
	h.status.Store(HintOK)
	select {
	case <-ctx.Done():
		return nil
	case <-closed:
		return errors.New("nats connection closed")
	}
}

func (h *Hint) handle(ctx context.Context, ch *config.Chain, m jetstream.Msg) {
	d, err := decodeEnvelope(m.Data())
	if err != nil {
		h.log.Error("undecodable eventscale message; dropped", "subject", m.Subject(), "err", err)
		m.Term()
		return
	}
	_, watched := ch.Deposit(d.To)
	_, known := ch.Token(d.Token)
	if !watched || !known || d.ChainID != ch.ChainID {
		m.Ack()
		return
	}
	if err := upsertSeen(ctx, h.st, d); err != nil {
		h.log.Error("store hint", "err", err)
		m.Nak()
		return
	}
	m.Ack() // only after the row is stored
}
