package verifier

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"

	"attestor-workflow/internal/domain"
	"attestor-workflow/internal/sumsubapi"
)

func TestSumsubProviderVerifyApproved(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"id":"applicant-1","review":{"reviewStatus":"completed","reviewResult":{"reviewAnswer":"GREEN"}}}`))
	}))
	defer server.Close()

	p := &SumsubProvider{
		Client: &sumsubapi.Client{BaseURL: server.URL, AppToken: "t", SecretKey: "s", HTTPClient: server.Client()},
		TTL:    24 * time.Hour,
	}

	req := domain.VerificationRequest{Gate: common.HexToAddress("0x1"), Wallet: common.HexToAddress("0x2"), Level: SumsubLevel}
	att, err := p.Verify(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if att.Level != SumsubLevel {
		t.Fatalf("level = %d, want %d", att.Level, SumsubLevel)
	}
	if att.Nullifier == ([32]byte{}) {
		t.Fatal("nullifier must not be zero")
	}
}

func TestSumsubProviderVerifyRejected(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"id":"applicant-1","review":{"reviewStatus":"completed","reviewResult":{"reviewAnswer":"RED"}}}`))
	}))
	defer server.Close()

	p := &SumsubProvider{
		Client: &sumsubapi.Client{BaseURL: server.URL, AppToken: "t", SecretKey: "s", HTTPClient: server.Client()},
		TTL:    24 * time.Hour,
	}

	req := domain.VerificationRequest{Gate: common.HexToAddress("0x1"), Wallet: common.HexToAddress("0x2"), Level: SumsubLevel}
	if _, err := p.Verify(context.Background(), req); err == nil {
		t.Fatal("expected error for rejected applicant")
	}
}
