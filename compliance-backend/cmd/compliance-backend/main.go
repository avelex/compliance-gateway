// Command compliance-backend is Deflow's single-tenant recommendations and Payment Passport service.
//
//	compliance-backend serve        -c config.json
//	compliance-backend backfill     -c config.json -chain 84532 -from-block 123456
//	compliance-backend ruleset-hash rulesets/2026.10-1.json
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/ethereum/go-ethereum/ethclient"

	"compliance-backend/internal/app"
	"compliance-backend/internal/config"
	"compliance-backend/internal/ingest"
	"compliance-backend/internal/rules"
	"compliance-backend/internal/store"
)

func main() {
	if len(os.Args) < 2 {
		usage()
	}
	log := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	var err error
	switch os.Args[1] {
	case "serve":
		err = serve(log, os.Args[2:])
	case "backfill":
		err = backfill(os.Args[2:])
	case "ruleset-hash":
		err = rulesetHash(os.Args[2:])
	default:
		usage()
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: compliance-backend serve|backfill|ruleset-hash [flags]")
	os.Exit(2)
}

func loadConfig(fs *flag.FlagSet, args []string) (*config.Config, error) {
	path := fs.String("c", "config.json", "config file")
	if err := fs.Parse(args); err != nil {
		return nil, err
	}
	return config.Load(*path)
}

func serve(log *slog.Logger, args []string) error {
	cfg, err := loadConfig(flag.NewFlagSet("serve", flag.ExitOnError), args)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return app.Run(ctx, cfg, log, nil)
}

func backfill(args []string) error {
	fs := flag.NewFlagSet("backfill", flag.ExitOnError)
	chainID := fs.Uint64("chain", 0, "chain id")
	from := fs.Uint64("from-block", 0, "first block to reconcile")
	cfg, err := loadConfig(fs, args)
	if err != nil {
		return err
	}
	ch, ok := cfg.Chain(*chainID)
	if !ok {
		return fmt.Errorf("chain %d is not configured", *chainID)
	}
	ctx := context.Background()
	st, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer st.Close()
	eth, err := ethclient.DialContext(ctx, ch.RPC)
	if err != nil {
		return err
	}
	until, err := ingest.Backfill(ctx, st, eth, ch, *from)
	if err != nil {
		return err
	}
	fmt.Printf("backfill set: chain %d reconciles from block %d; payments up to block %d are marked reconstruction. Run `serve` to process.\n", ch.ChainID, *from, until)
	return nil
}

func rulesetHash(args []string) error {
	if len(args) != 1 {
		return errors.New("usage: compliance-backend ruleset-hash FILE")
	}
	raw, err := os.ReadFile(args[0])
	if err != nil {
		return err
	}
	rs, _, hash, err := rules.Parse(raw)
	if err != nil {
		return err
	}
	fmt.Printf("%s %s\n", rs.Version, hash)
	return nil
}
