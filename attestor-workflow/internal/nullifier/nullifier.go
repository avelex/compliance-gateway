package nullifier

import (
	"crypto/hmac"
	"crypto/sha256"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

func Derive(docID []byte, gate common.Address) [32]byte {
	return crypto.Keccak256Hash(docID, gate.Bytes())
}

func DeriveFromDoc(enclaveSecret []byte, docNumber, docCountry string, gate common.Address) [32]byte {
	m := hmac.New(sha256.New, enclaveSecret)
	m.Write([]byte(docNumber + docCountry + strings.ToLower(gate.Hex())))
	var out [32]byte
	copy(out[:], m.Sum(nil))
	return out
}
