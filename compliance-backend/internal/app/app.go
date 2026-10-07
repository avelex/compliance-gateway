// Package app wires the service together; `compliance-backend serve` and the e2e test both run it.
package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ethereum/go-ethereum/ethclient"

	"compliance-backend/internal/api"
	"compliance-backend/internal/checks"
	"compliance-backend/internal/config"
	"compliance-backend/internal/decision"
	"compliance-backend/internal/evidence"
	"compliance-backend/internal/ingest"
	"compliance-backend/internal/pipeline"
	"compliance-backend/internal/store"
)

// Run serves until ctx ends. If ready is not nil it receives the listening address.
func Run(ctx context.Context, cfg *config.Config, log *slog.Logger, ready chan<- string) error {
	st, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer st.Close()
	policy, err := decision.LoadFileSigner(cfg.Keys.PolicyKeyFile)
	if err != nil {
		return err
	}
	ev, err := evidence.LoadJWSSigner(cfg.Keys.EvidenceKeyFile, cfg.Keys.EvidenceKID)
	if err != nil {
		return err
	}
	sanctions := &checks.Sanctions{}
	if err := sanctions.Load(ctx, st, cfg.Sanctions); err != nil {
		return err
	}
	go reloadOnHUP(ctx, log, st, cfg, sanctions)

	clients := map[uint64]*ethclient.Client{}
	for i := range cfg.Chains {
		ch := &cfg.Chains[i]
		eth, err := ethclient.DialContext(ctx, ch.RPC)
		if err != nil {
			return fmt.Errorf("chain %d: %w", ch.ChainID, err)
		}
		clients[ch.ChainID] = eth
		go ingest.NewReconciler(st, ch, eth, log).Run(ctx)
	}
	hint := ingest.NewHint(st, cfg, log)
	go hint.Run(ctx)

	p := &pipeline.Pipeline{St: st, Cfg: cfg, Raw: checks.RawStore{Dir: cfg.DataDir}, Policy: policy, Evidence: ev, Log: log,
		Checks: []checks.Check{
			checks.GoPlus{BaseURL: cfg.KYT.GoPlusBaseURL, Client: &http.Client{Timeout: cfg.CheckTimeout.Duration}},
			sanctions,
			checks.Structuring{St: st, Cfg: cfg},
			checks.Issuer{Clients: clients},
		}}
	go p.Run(ctx)

	ln, err := net.Listen("tcp", cfg.Listen)
	if err != nil {
		return err
	}
	srv := &http.Server{ReadHeaderTimeout: 10 * time.Second,
		Handler: (&api.Server{P: p, Token: cfg.APIToken, Health: func() map[string]any { return health(ctx, st, cfg, clients, hint) }}).Handler()}
	go func() {
		<-ctx.Done()
		shut, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		srv.Shutdown(shut)
	}()
	log.Info("compliance-backend listening", "addr", ln.Addr().String(), "policy_signer", policy.Address().Hex(), "hint", hint.Status())
	if ready != nil {
		ready <- ln.Addr().String()
	}
	if err := srv.Serve(ln); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func reloadOnHUP(ctx context.Context, log *slog.Logger, st *store.Store, cfg *config.Config, s *checks.Sanctions) {
	hup := make(chan os.Signal, 1)
	signal.Notify(hup, syscall.SIGHUP)
	for {
		select {
		case <-ctx.Done():
			return
		case <-hup:
			if err := s.Load(ctx, st, cfg.Sanctions); err != nil {
				log.Error("sanctions reload failed; previous lists stay active", "err", err)
			} else {
				log.Info("sanctions lists reloaded")
			}
		}
	}
}

func health(ctx context.Context, st *store.Store, cfg *config.Config, clients map[uint64]*ethclient.Client, hint *ingest.Hint) map[string]any {
	out := map[string]any{"db": "ok", "hint": hint.Status()}
	if err := st.Ping(ctx); err != nil {
		out["db"] = "down"
	}
	lag := map[string]any{}
	for _, ch := range cfg.Chains {
		var last uint64
		st.QueryRow(ctx, `SELECT last_reconciled FROM chain_cursor WHERE chain_id = $1`, ch.ChainID).Scan(&last)
		if head, err := clients[ch.ChainID].BlockNumber(ctx); err == nil && last > 0 {
			lag[fmt.Sprint(ch.ChainID)] = int64(head) - int64(last)
		} else {
			lag[fmt.Sprint(ch.ChainID)] = nil
		}
	}
	out["reconciler_lag_blocks"] = lag
	return out
}
