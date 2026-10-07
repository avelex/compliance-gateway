package pipeline

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/jackc/pgx/v5"

	"compliance-backend/internal/decision"
)

const officerRequestTTL = 15 * time.Minute

func (p *Pipeline) lockPayment(ctx context.Context, tx pgx.Tx, id common.Hash) (row, error) {
	r, err := scanRow(tx.QueryRow(ctx, `SELECT `+rowCols+` FROM payment WHERE id = $1 FOR UPDATE`, id.Bytes()))
	if errors.Is(err, pgx.ErrNoRows) {
		return r, fmt.Errorf("%w: payment %s", ErrNotFound, id.Hex())
	}
	return r, err
}

// OfficerTypedData returns the EIP-712 document an officer signs for kind, and keeps it pending so the
// signature can only be over exactly this document.
func (p *Pipeline) OfficerTypedData(ctx context.Context, id common.Hash, kind uint8) (map[string]any, error) {
	tx, err := p.St.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	r, err := p.lockPayment(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	s, td, err := p.prepare(ctx, tx, r, kind)
	if err != nil {
		return nil, err
	}
	doc := decision.JSON(td)
	raw, _ := json.Marshal(doc)
	if _, err := tx.Exec(ctx, `INSERT INTO pending_officer_request (payment_id, decision, nonce, deadline, typed_data, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (payment_id, decision) DO UPDATE SET nonce = EXCLUDED.nonce,
		deadline = EXCLUDED.deadline, typed_data = EXCLUDED.typed_data, expires_at = EXCLUDED.expires_at`,
		id.Bytes(), kind, s.Nonce, s.Deadline, raw, p.now().Add(officerRequestTTL)); err != nil {
		return nil, err
	}
	return doc, tx.Commit(ctx)
}

// OfficerDecide records an officer's signature over the pending typed data and issues the next pack.
// The service never holds the officer's key.
func (p *Pipeline) OfficerDecide(ctx context.Context, id common.Hash, kind uint8, sig []byte, rationale string) (string, int, error) {
	if strings.TrimSpace(rationale) == "" {
		return "", 0, fmt.Errorf("%w: a rationale is required", ErrBadRequest)
	}
	tx, err := p.St.Begin(ctx)
	if err != nil {
		return "", 0, err
	}
	defer tx.Rollback(ctx)
	r, err := p.lockPayment(ctx, tx, id)
	if err != nil {
		return "", 0, err
	}
	var nonce, deadline uint64
	var expires time.Time
	err = tx.QueryRow(ctx, `SELECT nonce, deadline, expires_at FROM pending_officer_request WHERE payment_id = $1 AND decision = $2`,
		id.Bytes(), kind).Scan(&nonce, &deadline, &expires)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && p.now().After(expires)) {
		return "", 0, fmt.Errorf("%w: request the typed data first; pending requests expire after %s", ErrConflict, officerRequestTTL)
	}
	if err != nil {
		return "", 0, err
	}
	s, _, err := p.prepare(ctx, tx, r, kind)
	if err != nil {
		return "", 0, err
	}
	if s.Nonce != nonce {
		return "", 0, fmt.Errorf("%w: another decision was recorded since the typed data was issued", ErrConflict)
	}
	s.Deadline = deadline
	td := decision.TypedData(r.ChainID, r.Deposit, s)
	officer, err := decision.VerifyOfficer(td, sig, kind, p.Cfg.Officers)
	if err != nil {
		return "", 0, fmt.Errorf("%w: %v", ErrForbidden, err)
	}
	reasons, ref, err := p.recommendationReasons(ctx, tx, id)
	if err != nil {
		return "", 0, err
	}
	officerID := officer.OfficerID
	packID, version, err := p.record(ctx, tx, r, s, td, recordInput{mode: "OFFICER_REVIEW", policyRef: ref, reasons: reasons,
		rationale: rationale, officerID: &officerID, signer: officer.Address, sig: sig})
	if err != nil {
		return "", 0, err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM pending_officer_request WHERE payment_id = $1`, id.Bytes()); err != nil {
		return "", 0, err
	}
	return packID, version, tx.Commit(ctx)
}

func (p *Pipeline) recommendationReasons(ctx context.Context, tx pgx.Tx, id common.Hash) ([]string, string, error) {
	var reasons []string
	var ref string
	err := tx.QueryRow(ctx, `SELECT reason_codes, policy_ref FROM recommendation WHERE payment_id = $1`, id.Bytes()).Scan(&reasons, &ref)
	return reasons, ref, err
}

var (
	ErrBadRequest = errors.New("bad request")
	ErrForbidden  = errors.New("forbidden")
)
