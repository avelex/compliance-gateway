package pipeline

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"
	"github.com/jackc/pgx/v5"

	"compliance-backend/internal/decision"
	"compliance-backend/internal/evidence"
	"compliance-backend/internal/rules"
)

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict")
)

type pastDecision struct {
	kind              uint8
	nonce             uint64
	mode, policyRef   string
	reasons           []string
	rationale         string
	officerID         *string
	signer, signature []byte
	packHash          string
	decidedAt         time.Time
}

func loadDecisions(ctx context.Context, q pgx.Tx, id common.Hash) ([]pastDecision, error) {
	rows, err := q.Query(ctx, `SELECT decision, nonce, mode, policy_ref, reason_codes, rationale, officer_id, signer, signature, pack_hash, decided_at
		FROM decision WHERE payment_id = $1 ORDER BY nonce`, id.Bytes())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []pastDecision
	for rows.Next() {
		var d pastDecision
		var kind int16
		if err := rows.Scan(&kind, &d.nonce, &d.mode, &d.policyRef, &d.reasons, &d.rationale, &d.officerID, &d.signer, &d.signature, &d.packHash, &d.decidedAt); err != nil {
			return nil, err
		}
		d.kind = uint8(kind)
		out = append(out, d)
	}
	return out, rows.Err()
}

// prepare builds the next Decision struct for a payment and rejects a forbidden transition.
func (p *Pipeline) prepare(ctx context.Context, tx pgx.Tx, r row, kind uint8) (decision.Struct, apitypes.TypedData, error) {
	var root string
	if err := tx.QueryRow(ctx, `SELECT evidence_root FROM evidence_snapshot WHERE payment_id = $1`, r.ID.Bytes()).Scan(&root); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return decision.Struct{}, apitypes.TypedData{}, fmt.Errorf("%w: payment has no evidence snapshot yet", ErrConflict)
		}
		return decision.Struct{}, apitypes.TypedData{}, err
	}
	past, err := loadDecisions(ctx, tx, r.ID)
	if err != nil {
		return decision.Struct{}, apitypes.TypedData{}, err
	}
	kinds := make([]uint8, len(past))
	var nonce uint64
	for i, d := range past {
		kinds[i] = d.kind
		nonce = max(nonce, d.nonce)
	}
	state, _ := decision.Replay(kinds)
	if _, err := decision.Next(state, kind); err != nil {
		return decision.Struct{}, apitypes.TypedData{}, fmt.Errorf("%w: %v", ErrConflict, err)
	}
	s := decision.Struct{PaymentID: r.ID, Decision: kind, Token: r.Token, Amount: r.Amount,
		PackHash: common.HexToHash(root), Nonce: nonce + 1, Deadline: uint64(p.now().Add(p.Cfg.DecisionTTL.Duration).Unix())}
	return s, decision.TypedData(r.ChainID, r.Deposit, s), nil
}

func (p *Pipeline) decideAuto(ctx context.Context, tx pgx.Tx, r row, kind uint8, rec rules.Recommendation) error {
	s, td, err := p.prepare(ctx, tx, r, kind)
	if err != nil {
		return err
	}
	digest, err := decision.Digest(td)
	if err != nil {
		return err
	}
	sig, err := p.Policy.Sign(digest)
	if err != nil {
		return err
	}
	_, _, err = p.record(ctx, tx, r, s, td, recordInput{mode: "AUTO_BY_POLICY", policyRef: rec.PolicyRef, reasons: rec.Reasons,
		rationale: "Automatic under policy " + rec.PolicyRef, signer: p.Policy.Address(), sig: sig})
	return err
}

type recordInput struct {
	mode, policyRef string
	reasons         []string
	rationale       string
	officerID       *string
	signer          common.Address
	sig             []byte
}

// record stores a signed decision and issues the next pack version for it.
func (p *Pipeline) record(ctx context.Context, tx pgx.Tx, r row, s decision.Struct, td apitypes.TypedData, in recordInput) (string, int, error) {
	now := p.now()
	tdJSON, _ := json.Marshal(decision.JSON(td))
	if _, err := tx.Exec(ctx, `INSERT INTO decision (payment_id, nonce, decision, mode, policy_ref, reason_codes, rationale, officer_id,
		signer, signature, pack_hash, deadline, typed_data, decided_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		r.ID.Bytes(), s.Nonce, s.Decision, in.mode, in.policyRef, in.reasons, in.rationale, in.officerID,
		in.signer.Bytes(), in.sig, hexNo0x(s.PackHash), s.Deadline, tdJSON, now); err != nil {
		return "", 0, err
	}
	packID, version, err := p.issuePack(ctx, tx, r)
	if err != nil {
		return "", 0, err
	}
	stage := "decided"
	if s.Decision == decision.Hold {
		stage = "in_review" // a hold waits for an officer
	}
	if _, err := tx.Exec(ctx, `UPDATE payment SET stage = $2 WHERE id = $1`, r.ID.Bytes(), stage); err != nil {
		return "", 0, err
	}
	return packID, version, nil
}

func hexNo0x(h common.Hash) string { return common.Bytes2Hex(h.Bytes()) }

// issuePack builds pack version n+1 from the snapshot and the decision history, and appends it to the journal.
func (p *Pipeline) issuePack(ctx context.Context, tx pgx.Tx, r row) (string, int, error) {
	var packID string
	var dataRaw, saltsRaw []byte
	var root string
	if err := tx.QueryRow(ctx, `SELECT pack_id::text, data, salts, evidence_root FROM evidence_snapshot WHERE payment_id = $1`,
		r.ID.Bytes()).Scan(&packID, &dataRaw, &saltsRaw, &root); err != nil {
		return "", 0, err
	}
	snap := &evidence.Snapshot{EvidenceRoot: root}
	if err := evidence.Decode(dataRaw, &snap.Data); err != nil {
		return "", 0, err
	}
	if err := json.Unmarshal(saltsRaw, &snap.Salts); err != nil {
		return "", 0, err
	}

	version := 1
	prevSalts := map[string]string{}
	var prevVersion int
	var prevSaltsRaw []byte
	err := tx.QueryRow(ctx, `SELECT pack_version, salts FROM pack WHERE pack_id = $1 ORDER BY pack_version DESC LIMIT 1`, packID).
		Scan(&prevVersion, &prevSaltsRaw)
	switch {
	case err == nil:
		version = prevVersion + 1
		if err := json.Unmarshal(prevSaltsRaw, &prevSalts); err != nil {
			return "", 0, err
		}
	case !errors.Is(err, pgx.ErrNoRows):
		return "", 0, err
	}

	rest, err := p.rest(ctx, tx, r)
	if err != nil {
		return "", 0, err
	}
	// The journal head row serialises pack issuance, so prev_pack_hash forms one chain.
	var seq int64
	var head string
	if err := tx.QueryRow(ctx, `SELECT seq, pack_hash FROM journal_head WHERE id = 1 FOR UPDATE`).Scan(&seq, &head); err != nil {
		return "", 0, err
	}
	pk, err := evidence.BuildPack(snap, version, rest, prevSalts, head, p.Evidence)
	if err != nil {
		return "", 0, err
	}
	data, _ := json.Marshal(pk.Data)
	salts, _ := json.Marshal(pk.Salts)
	if _, err := tx.Exec(ctx, `INSERT INTO pack (pack_id, pack_version, payment_id, seq, data, salts, master_root, evidence_root, jws, prev_pack_hash, pack_hash)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, packID, version, r.ID.Bytes(), seq+1, data, salts,
		pk.MasterRoot, pk.EvidenceRoot, pk.JWS, pk.PrevPackHash, pk.PackHash); err != nil {
		return "", 0, err
	}
	if _, err := tx.Exec(ctx, `UPDATE journal_head SET seq = $1, pack_hash = $2 WHERE id = 1`, seq+1, pk.PackHash); err != nil {
		return "", 0, err
	}
	return packID, version, nil
}

// rest holds the sections outside the evidence root: header, timeline, the latest decision, retention.
func (p *Pipeline) rest(ctx context.Context, tx pgx.Tx, r row) (map[string]any, error) {
	ch, _, err := p.token(r)
	if err != nil {
		return nil, err
	}
	dep, _ := ch.Deposit(r.Deposit)
	merchant := ""
	if dep != nil {
		merchant = dep.MerchantID
	}
	past, err := loadDecisions(ctx, tx, r.ID)
	if err != nil {
		return nil, err
	}
	if len(past) == 0 {
		return nil, errors.New("pack without a decision")
	}
	var checksAt time.Time
	tx.QueryRow(ctx, `SELECT max(performed_at) FROM check_result WHERE payment_id = $1`, r.ID.Bytes()).Scan(&checksAt)
	var recAt time.Time
	var recName, recRef string
	if err := tx.QueryRow(ctx, `SELECT created_at, recommendation, policy_ref FROM recommendation WHERE payment_id = $1`, r.ID.Bytes()).
		Scan(&recAt, &recName, &recRef); err != nil {
		return nil, err
	}

	ts := func(t time.Time) string { return t.UTC().Format(time.RFC3339) }
	offchain := []any{
		map[string]any{"at": ts(checksAt), "event": "Checks completed: KYT, sanctions, structuring, issuer", "ref": nil, "source": "DEFLOW"},
		map[string]any{"at": ts(recAt), "event": "Recommendation " + recName, "ref": recRef, "source": "DEFLOW"},
	}
	kinds := make([]uint8, len(past))
	for i, d := range past {
		kinds[i] = d.kind
		offchain = append(offchain, map[string]any{"at": ts(d.decidedAt),
			"event": fmt.Sprintf("Decision %s (%s), nonce %d", decision.Name(d.kind), d.mode, d.nonce), "ref": d.policyRef, "source": "PROCESSOR"})
	}
	state, _ := decision.Replay(kinds)
	last := past[len(past)-1]
	var officer any
	if last.officerID != nil {
		officer = *last.officerID
	}
	reasons := make([]any, len(last.reasons))
	for i, s := range last.reasons {
		reasons[i] = s
	}
	out := map[string]any{
		"created_at":  ts(p.now()),
		"merchant_id": merchant,
		"processor": map[string]any{"legal_name": p.Cfg.Processor.LegalName, "lei": p.Cfg.Processor.LEI,
			"casp_id": p.Cfg.Processor.CASPID, "nca": p.Cfg.Processor.NCA, "rfi_channel": p.Cfg.Processor.RFIChannel,
			"cert_url": p.Cfg.Processor.CertURL},
		"timeline": map[string]any{
			// Configuration (b): no contract, so the timeline has no on-chain statuses (design-compliance-backend D10).
			"onchain":  []any{map[string]any{"at": ts(r.BlockTime), "event": "Transfer to deposit address", "ref": r.TxHash.Hex(), "source": "CHAIN"}},
			"offchain": offchain,
		},
		"decision": map[string]any{
			"decision": decision.Name(last.kind), "mode": last.mode, "policy_ref": last.policyRef, "reason_codes": reasons,
			"rationale": last.rationale, "officer_id": officer, "second_reviewer": nil, "decided_at": ts(last.decidedAt),
			"nonce": last.nonce, "pack_hash": last.packHash,
			"signer_address": common.BytesToAddress(last.signer).Hex(), "signature": "0x" + common.Bytes2Hex(last.signature),
			"execution_tx":   "n/a, executed by the processor outside Deflow",
			"return_blocked": state.Frozen,
		},
		"retention":      map[string]any{"until": r.BlockTime.AddDate(p.Cfg.RetentionYears, 0, 0).Format("2006-01-02"), "legal_hold": false},
		"reconstruction": r.Reconstruction,
	}
	return out, nil
}
