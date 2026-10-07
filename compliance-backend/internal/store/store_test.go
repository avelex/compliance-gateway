package store_test

import (
	"context"
	"strings"
	"testing"

	"compliance-backend/internal/store/storetest"
)

func TestMigrateIsIdempotentAndEvidenceIsAppendOnly(t *testing.T) {
	s := storetest.New(t)
	ctx := context.Background()
	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("second migrate: %v", err)
	}

	_, err := s.Exec(ctx, `INSERT INTO payment (id, chain_id, tx_hash, log_index, block_number, block_hash, block_time, token, payer, deposit, amount, ingest)
		VALUES ('\x01', 1, '\x02', 0, 1, '\x03', now(), '\x04', '\x05', '\x06', 100, 'confirmed')`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.Exec(ctx, `INSERT INTO pack (pack_id, pack_version, payment_id, seq, data, salts, master_root, evidence_root, jws, prev_pack_hash, pack_hash)
		VALUES (gen_random_uuid(), 1, '\x01', 1, '{}', '{}', 'm', 'e', 'j', 'p', 'h')`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.Exec(ctx, `UPDATE pack SET jws = 'tampered'`)
	if err == nil || !strings.Contains(err.Error(), "pack is append-only") {
		t.Fatalf("update on pack: want append-only error, got %v", err)
	}
	_, err = s.Exec(ctx, `DELETE FROM pack`)
	if err == nil {
		t.Fatal("delete on pack succeeded")
	}
}

func TestApprovedRulesetIsImmutable(t *testing.T) {
	s := storetest.New(t)
	ctx := context.Background()
	if _, err := s.Exec(ctx, `INSERT INTO ruleset (version, canonical, ruleset_hash) VALUES ('v1', '{}', 'h1')`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Exec(ctx, `UPDATE ruleset SET approved_at = now(), effective_from = now() WHERE version = 'v1'`); err != nil {
		t.Fatalf("approving a draft: %v", err)
	}
	_, err := s.Exec(ctx, `UPDATE ruleset SET canonical = '{"x":1}' WHERE version = 'v1'`)
	if err == nil || !strings.Contains(err.Error(), "approved and immutable") {
		t.Fatalf("want immutable error, got %v", err)
	}
}
