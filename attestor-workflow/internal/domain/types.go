package domain

import (
	"github.com/ethereum/go-ethereum/common"

	"attestor-workflow/contracts/evm/src/generated/attestation_registry"
)

type EntryKind uint8

const (
	Attest EntryKind = iota
	Revoke
	Unrevoke
)

type Entry struct {
	Kind      EntryKind
	Gate      common.Address
	Wallet    common.Address
	Att       attestation_registry.Attestation
	Nullifier [32]byte
}

type VerificationRequest struct {
	Gate    common.Address
	Wallet  common.Address
	Level   uint8
	WorldID *WorldIDProof
}

type WorldIDProof struct {
	MerkleRoot        string
	NullifierHash     string
	Proof             string
	VerificationLevel string
	Action            string
}

type RevocationEvent struct {
	Nullifier [32]byte
}
