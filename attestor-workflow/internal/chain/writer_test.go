package chain

import (
	"testing"

	"github.com/ethereum/go-ethereum/common"

	"attestor-workflow/contracts/evm/src/generated/attestation_registry"
	"attestor-workflow/internal/domain"
)

func TestAttestationReportRoundTrip(t *testing.T) {
	args, err := attestationReportArgs()
	if err != nil {
		t.Fatal(err)
	}

	heartbeat := uint64(1234)
	batch := []domain.Entry{
		{
			Kind:   domain.Attest,
			Gate:   common.HexToAddress("0x1"),
			Wallet: common.HexToAddress("0x2"),
			Att: attestation_registry.Attestation{
				Nullifier: [32]byte{1},
				Level:     2,
				Expiry:    999,
			},
			Nullifier: [32]byte{},
		},
	}

	encoded, err := args.Pack(heartbeat, batch)
	if err != nil {
		t.Fatal(err)
	}

	decoded, err := args.Unpack(encoded)
	if err != nil {
		t.Fatal(err)
	}

	gotHeartbeat := decoded[0].(uint64)
	if gotHeartbeat != heartbeat {
		t.Fatalf("heartbeat = %d, want %d", gotHeartbeat, heartbeat)
	}
}

func TestSettlementReportRoundTrip(t *testing.T) {
	args, err := settlementReportArgs()
	if err != nil {
		t.Fatal(err)
	}

	id := [32]byte{9}
	encoded, err := args.Pack(id, true)
	if err != nil {
		t.Fatal(err)
	}

	decoded, err := args.Unpack(encoded)
	if err != nil {
		t.Fatal(err)
	}

	if decoded[1].(bool) != true {
		t.Fatal("ok flag round-trip mismatch")
	}
}
