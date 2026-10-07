package pipeline

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/jackc/pgx/v5"

	"compliance-backend/internal/decision"
	"compliance-backend/internal/rules"
)

// ImportRuleset stores a draft ruleset. Re-importing the same content is a no-op; a different body
// under an existing version is a conflict, since approved rulesets are immutable.
func (p *Pipeline) ImportRuleset(ctx context.Context, raw []byte) (version, hash string, err error) {
	rs, canon, hash, err := rules.Parse(raw)
	if err != nil {
		return "", "", fmt.Errorf("%w: %v", ErrBadRequest, err)
	}
	var existing string
	err = p.St.QueryRow(ctx, `INSERT INTO ruleset (version, canonical, ruleset_hash) VALUES ($1, $2, $3)
		ON CONFLICT (version) DO UPDATE SET version = ruleset.version RETURNING ruleset_hash`, rs.Version, string(canon), hash).Scan(&existing)
	if err != nil {
		return "", "", err
	}
	if existing != hash {
		return "", "", fmt.Errorf("%w: version %s already exists with a different body", ErrConflict, rs.Version)
	}
	return rs.Version, hash, nil
}

// ApprovalTypedData is what the MLRO signs to approve version from effectiveFrom.
func (p *Pipeline) ApprovalTypedData(ctx context.Context, version string, effectiveFrom time.Time) (map[string]any, error) {
	var hash string
	if err := p.St.QueryRow(ctx, `SELECT ruleset_hash FROM ruleset WHERE version = $1`, version).Scan(&hash); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("%w: ruleset %s", ErrNotFound, version)
		}
		return nil, err
	}
	return decision.JSON(decision.RulesetApproval(common.HexToHash(hash), version, uint64(effectiveFrom.Unix()))), nil
}

// ApproveRuleset records the MLRO's signature; from then on the ruleset is immutable and may run.
func (p *Pipeline) ApproveRuleset(ctx context.Context, version string, effectiveFrom time.Time, sig []byte) (common.Address, error) {
	var hash string
	var approvedAt *time.Time
	if err := p.St.QueryRow(ctx, `SELECT ruleset_hash, approved_at FROM ruleset WHERE version = $1`, version).Scan(&hash, &approvedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return common.Address{}, fmt.Errorf("%w: ruleset %s", ErrNotFound, version)
		}
		return common.Address{}, err
	}
	if approvedAt != nil {
		return common.Address{}, fmt.Errorf("%w: ruleset %s is already approved", ErrConflict, version)
	}
	td := decision.RulesetApproval(common.HexToHash(hash), version, uint64(effectiveFrom.Unix()))
	by, err := decision.VerifyApproval(td, sig, p.Cfg.MLRO)
	if err != nil {
		return common.Address{}, fmt.Errorf("%w: %v", ErrForbidden, err)
	}
	_, err = p.St.Exec(ctx, `UPDATE ruleset SET approved_by = $2, approval_sig = $3, effective_from = $4, approved_at = now() WHERE version = $1`,
		version, by.Bytes(), sig, time.Unix(effectiveFrom.Unix(), 0).UTC())
	return by, err
}
