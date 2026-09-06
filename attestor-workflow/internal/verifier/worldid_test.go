package verifier

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"

	"attestor-workflow/internal/domain"
)

func TestWorldIDProviderVerifySuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2/verify/app_123" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Write([]byte(`{"success":true}`))
	}))
	defer server.Close()

	p := &WorldIDProvider{BaseURL: server.URL, AppID: "app_123", HTTPClient: server.Client(), TTL: time.Hour}

	req := domain.VerificationRequest{
		Gate:   common.HexToAddress("0x1"),
		Wallet: common.HexToAddress("0x2"),
		Level:  WorldIDLevel,
		WorldID: &domain.WorldIDProof{
			MerkleRoot:        "root",
			NullifierHash:     "hash",
			Proof:             "proof",
			VerificationLevel: "orb",
			Action:            "verify",
		},
	}

	att, err := p.Verify(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if att.Level != WorldIDLevel {
		t.Fatalf("level = %d, want %d", att.Level, WorldIDLevel)
	}
}

func TestWorldIDProviderVerifyMissingProof(t *testing.T) {
	p := &WorldIDProvider{BaseURL: "http://unused", AppID: "app_123", HTTPClient: http.DefaultClient, TTL: time.Hour}
	req := domain.VerificationRequest{Gate: common.HexToAddress("0x1"), Wallet: common.HexToAddress("0x2"), Level: WorldIDLevel}
	if _, err := p.Verify(context.Background(), req); err == nil {
		t.Fatal("expected error for missing proof")
	}
}

func TestWorldIDProviderVerifyFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"success":false,"code":"invalid_proof","detail":"bad proof"}`))
	}))
	defer server.Close()

	p := &WorldIDProvider{BaseURL: server.URL, AppID: "app_123", HTTPClient: server.Client(), TTL: time.Hour}
	req := domain.VerificationRequest{
		Gate:    common.HexToAddress("0x1"),
		Wallet:  common.HexToAddress("0x2"),
		Level:   WorldIDLevel,
		WorldID: &domain.WorldIDProof{NullifierHash: "hash"},
	}
	if _, err := p.Verify(context.Background(), req); err == nil {
		t.Fatal("expected error for failed verification")
	}
}
