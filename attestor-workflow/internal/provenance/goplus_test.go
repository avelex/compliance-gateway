package provenance

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ethereum/go-ethereum/common"
)

func TestGoPlusScreenerScoresHighestMatchingFlag(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"code":1,"result":{"mixer":"1","phishing_activities":"1","fake_kyc":"0"}}`))
	}))
	defer server.Close()

	s := &GoPlusScreener{BaseURL: server.URL, Client: server.Client()}
	score, err := s.Score(context.Background(), common.HexToAddress("0x1"))
	if err != nil {
		t.Fatal(err)
	}
	if score != 80 {
		t.Fatalf("score = %d, want 80 (mixer)", score)
	}
}

func TestGoPlusScreenerCleanAddressScoresZero(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"code":1,"result":{}}`))
	}))
	defer server.Close()

	s := &GoPlusScreener{BaseURL: server.URL, Client: server.Client()}
	score, err := s.Score(context.Background(), common.HexToAddress("0x1"))
	if err != nil {
		t.Fatal(err)
	}
	if score != 0 {
		t.Fatalf("score = %d, want 0", score)
	}
}

func TestGoPlusScreenerFailsClosedOnErrorCode(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"code":0}`))
	}))
	defer server.Close()

	s := &GoPlusScreener{BaseURL: server.URL, Client: server.Client()}
	score, err := s.Score(context.Background(), common.HexToAddress("0x1"))
	if err != nil {
		t.Fatal(err)
	}
	if score != 100 {
		t.Fatalf("score = %d, want 100 (fail closed)", score)
	}
}

func TestGoPlusScreenerFailsClosedOnTransportError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	server.Close() // closed before use: Do() must fail with a connection error

	s := &GoPlusScreener{BaseURL: server.URL, Client: server.Client()}
	score, err := s.Score(context.Background(), common.HexToAddress("0x1"))
	if err != nil {
		t.Fatal(err)
	}
	if score != 100 {
		t.Fatalf("score = %d, want 100 (fail closed)", score)
	}
}
