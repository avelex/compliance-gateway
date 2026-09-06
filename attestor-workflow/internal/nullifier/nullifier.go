package nullifier

import (
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

func Derive(docID []byte, gate common.Address) [32]byte {
	return crypto.Keccak256Hash(docID, gate.Bytes())
}
