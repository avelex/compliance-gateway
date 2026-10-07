package decision

import (
	"fmt"
	"slices"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"

	"compliance-backend/internal/config"
)

// VerifyOfficer recovers the signer of td and requires an officer whose mask permits kind.
func VerifyOfficer(td apitypes.TypedData, sig []byte, kind uint8, officers []config.Officer) (config.Officer, error) {
	digest, err := Digest(td)
	if err != nil {
		return config.Officer{}, err
	}
	addr, err := Recover(digest, sig)
	if err != nil {
		return config.Officer{}, err
	}
	for _, o := range officers {
		if o.Address == addr {
			if !Permits(o.Mask, kind) {
				return config.Officer{}, fmt.Errorf("officer %s may not sign %s", o.OfficerID, Name(kind))
			}
			return o, nil
		}
	}
	return config.Officer{}, fmt.Errorf("signature recovers to %s, which is not an authorised officer", addr.Hex())
}

// VerifyApproval recovers the signer of a ruleset approval and requires an MLRO.
func VerifyApproval(td apitypes.TypedData, sig []byte, mlro []common.Address) (common.Address, error) {
	digest, err := Digest(td)
	if err != nil {
		return common.Address{}, err
	}
	addr, err := Recover(digest, sig)
	if err != nil {
		return common.Address{}, err
	}
	if !slices.Contains(mlro, addr) {
		return common.Address{}, fmt.Errorf("approval signed by %s, which is not in the MLRO set", addr.Hex())
	}
	return addr, nil
}
