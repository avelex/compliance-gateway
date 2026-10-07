package pipeline

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/jackc/pgx/v5"

	"compliance-backend/internal/decision"
	"compliance-backend/internal/evidence"
)

// Case is a payment waiting for an officer.
type Case struct {
	PaymentRef     string    `json:"payment_ref"`
	ChainID        uint64    `json:"chain_id"`
	Payer          string    `json:"payer"`
	Deposit        string    `json:"deposit"`
	Amount         string    `json:"amount"`
	Recommendation string    `json:"recommendation"`
	Reasons        []string  `json:"reason_codes"`
	PolicyRef      string    `json:"policy_ref"`
	LastDecision   *string   `json:"last_decision"`
	BlockTime      time.Time `json:"block_time"`
}

func (p *Pipeline) Cases(ctx context.Context) ([]Case, error) {
	rows, err := p.St.Query(ctx, `
		SELECT p.id, p.chain_id, p.payer, p.deposit, p.amount::text, r.recommendation, r.reason_codes, r.policy_ref, p.block_time,
		       (SELECT d.decision FROM decision d WHERE d.payment_id = p.id ORDER BY d.nonce DESC LIMIT 1)
		FROM payment p JOIN recommendation r ON r.payment_id = p.id
		WHERE p.stage = 'in_review' AND p.ingest = 'confirmed' ORDER BY p.block_time`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Case{}
	for rows.Next() {
		var c Case
		var id, payer, dep []byte
		var last *int16
		if err := rows.Scan(&id, &c.ChainID, &payer, &dep, &c.Amount, &c.Recommendation, &c.Reasons, &c.PolicyRef, &c.BlockTime, &last); err != nil {
			return nil, err
		}
		c.PaymentRef, c.Payer, c.Deposit = common.BytesToHash(id).Hex(), common.BytesToAddress(payer).Hex(), common.BytesToAddress(dep).Hex()
		if last != nil {
			n := decision.Name(uint8(*last))
			c.LastDecision = &n
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// Payment returns everything stored about one payment, as JSON-ready maps.
func (p *Pipeline) Payment(ctx context.Context, id common.Hash) (map[string]any, error) {
	var ingest, stage, amount string
	var chainID, block uint64
	var payer, dep, token, txh []byte
	var reconstruction bool
	err := p.St.QueryRow(ctx, `SELECT ingest, stage, chain_id, block_number, payer, deposit, token, tx_hash, amount::text, reconstruction
		FROM payment WHERE id = $1`, id.Bytes()).Scan(&ingest, &stage, &chainID, &block, &payer, &dep, &token, &txh, &amount, &reconstruction)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("%w: payment %s", ErrNotFound, id.Hex())
	}
	if err != nil {
		return nil, err
	}
	out := map[string]any{
		"payment_ref": id.Hex(), "ingest": ingest, "stage": stage, "chain_id": chainID, "block_number": block,
		"payer": common.BytesToAddress(payer).Hex(), "deposit": common.BytesToAddress(dep).Hex(),
		"token": common.BytesToAddress(token).Hex(), "tx_hash": common.BytesToHash(txh).Hex(), "amount": amount,
		"reconstruction": reconstruction,
	}
	checks := []any{}
	rows, err := p.St.Query(ctx, `SELECT kind, provider, product, outcome, result, raw_sha256, performed_at FROM check_result WHERE payment_id = $1 ORDER BY kind`, id.Bytes())
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var kind, provider, product, outcome string
		var result json.RawMessage
		var raw *string
		var at time.Time
		if err := rows.Scan(&kind, &provider, &product, &outcome, &result, &raw, &at); err != nil {
			rows.Close()
			return nil, err
		}
		checks = append(checks, map[string]any{"kind": kind, "provider": provider, "product": product, "outcome": outcome,
			"result": result, "raw_sha256": raw, "performed_at": at})
	}
	rows.Close()
	out["checks"] = checks

	var rec, ref string
	var reasons []string
	var auto bool
	var inputsHash string
	if err := p.St.QueryRow(ctx, `SELECT recommendation, reason_codes, policy_ref, auto, inputs_hash FROM recommendation WHERE payment_id = $1`,
		id.Bytes()).Scan(&rec, &reasons, &ref, &auto, &inputsHash); err == nil {
		out["recommendation"] = map[string]any{"recommendation": rec, "reason_codes": reasons, "policy_ref": ref, "auto": auto, "inputs_hash": inputsHash}
	}
	decisions := []any{}
	drows, err := p.St.Query(ctx, `SELECT decision, nonce, mode, policy_ref, officer_id, signer, pack_hash, decided_at FROM decision WHERE payment_id = $1 ORDER BY nonce`, id.Bytes())
	if err != nil {
		return nil, err
	}
	for drows.Next() {
		var kind int16
		var nonce uint64
		var mode, pref, packHash string
		var officer *string
		var signer []byte
		var at time.Time
		if err := drows.Scan(&kind, &nonce, &mode, &pref, &officer, &signer, &packHash, &at); err != nil {
			drows.Close()
			return nil, err
		}
		decisions = append(decisions, map[string]any{"decision": decision.Name(uint8(kind)), "nonce": nonce, "mode": mode,
			"policy_ref": pref, "officer_id": officer, "signer": common.BytesToAddress(signer).Hex(), "pack_hash": packHash, "decided_at": at})
	}
	drows.Close()
	out["decisions"] = decisions
	packs := []any{}
	prows, err := p.St.Query(ctx, `SELECT pack_id::text, pack_version, master_root, evidence_root FROM pack WHERE payment_id = $1 ORDER BY pack_version`, id.Bytes())
	if err != nil {
		return nil, err
	}
	for prows.Next() {
		var pid, m, e string
		var v int
		if err := prows.Scan(&pid, &v, &m, &e); err != nil {
			prows.Close()
			return nil, err
		}
		packs = append(packs, map[string]any{"pack_id": pid, "pack_version": v, "master_root": m, "evidence_root": e})
	}
	prows.Close()
	out["packs"] = packs
	return out, nil
}

var uuidRE = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// LoadPack reads a stored pack version; version 0 means the latest.
func (p *Pipeline) LoadPack(ctx context.Context, packID string, version int) (*evidence.Pack, error) {
	if !uuidRE.MatchString(packID) {
		return nil, fmt.Errorf("%w: pack %q", ErrNotFound, packID)
	}
	q := `SELECT pack_version, data, salts, master_root, evidence_root, jws, prev_pack_hash, pack_hash FROM pack WHERE pack_id = $1::uuid`
	args := []any{packID}
	if version > 0 {
		q += ` AND pack_version = $2`
		args = append(args, version)
	}
	q += ` ORDER BY pack_version DESC LIMIT 1`
	pk := &evidence.Pack{PackID: packID, KID: p.Evidence.KID}
	var data, salts []byte
	err := p.St.QueryRow(ctx, q, args...).Scan(&pk.Version, &data, &salts, &pk.MasterRoot, &pk.EvidenceRoot, &pk.JWS, &pk.PrevPackHash, &pk.PackHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("%w: pack %s", ErrNotFound, packID)
	}
	if err != nil {
		return nil, err
	}
	if err := evidence.Decode(data, &pk.Data); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(salts, &pk.Salts); err != nil {
		return nil, err
	}
	return pk, nil
}

// Project issues a recipient's copy of the latest pack version and logs the disclosure.
func (p *Pipeline) Project(ctx context.Context, packID string, r evidence.Recipient) (map[string]any, error) {
	if _, ok := evidence.Profiles[r.Profile]; !ok {
		return nil, fmt.Errorf("%w: unknown profile %q", ErrBadRequest, r.Profile)
	}
	pk, err := p.LoadPack(ctx, packID, 0)
	if err != nil {
		return nil, err
	}
	copy, err := evidence.Project(pk, r, p.now())
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrBadRequest, err)
	}
	ph := copy["integrity"].(map[string]any)["projection_hash"]
	if _, err := p.St.Exec(ctx, `INSERT INTO projection (pack_id, pack_version, profile, prepared_for, purpose, projection_hash)
		VALUES ($1::uuid, $2, $3, $4, $5, $6)`, packID, pk.Version, r.Profile, r.PreparedFor, r.Purpose, ph); err != nil {
		return nil, err
	}
	return copy, nil
}
