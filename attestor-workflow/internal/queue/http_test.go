package queue

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ethereum/go-ethereum/common"
)

func TestHTTPQueuePending(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/verify/queue" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[{"gate":"0x0000000000000000000000000000000000000001","wallet":"0x0000000000000000000000000000000000000002","level":2}]`))
	}))
	defer server.Close()

	q := NewHTTPQueue(server.URL, server.Client())
	got, err := q.Pending(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("len(got) = %d, want 1", len(got))
	}
	if got[0].Gate != common.HexToAddress("0x1") {
		t.Fatalf("gate = %s, want 0x1", got[0].Gate)
	}
	if got[0].Level != 2 {
		t.Fatalf("level = %d, want 2", got[0].Level)
	}
}

func TestHTTPQueuePendingErrorStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	q := NewHTTPQueue(server.URL, server.Client())
	if _, err := q.Pending(context.Background()); err == nil {
		t.Fatal("expected error on non-200 status")
	}
}
