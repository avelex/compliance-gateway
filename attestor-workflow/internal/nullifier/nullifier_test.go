package nullifier

import (
	"testing"

	"github.com/ethereum/go-ethereum/common"
)

func TestDeriveDeterministic(t *testing.T) {
	docID := []byte("applicant-123")
	gate := common.HexToAddress("0x1")

	a := Derive(docID, gate)
	b := Derive(docID, gate)
	if a != b {
		t.Fatal("Derive is not deterministic")
	}
}

func TestDeriveDiffersByGate(t *testing.T) {
	docID := []byte("applicant-123")
	a := Derive(docID, common.HexToAddress("0x1"))
	b := Derive(docID, common.HexToAddress("0x2"))
	if a == b {
		t.Fatal("Derive must differ per gateway")
	}
}
