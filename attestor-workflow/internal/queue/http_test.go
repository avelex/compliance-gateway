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
		if r.URL.Path != "/api/relay/queue" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Fatalf("unexpected authorization header: %s", r.Header.Get("Authorization"))
		}
		if r.URL.Query().Get("minute") != "29290500" {
			t.Fatalf("unexpected minute: %s", r.URL.Query().Get("minute"))
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"minute":29290500,"items":[{"gate":"0x0000000000000000000000000000000000000001","wallet":"0x0000000000000000000000000000000000000002","level":2}]}`))
	}))
	defer server.Close()

	q := NewClient(server.URL, "test-token", server.Client())
	got, err := q.Pending(context.Background(), 29290500)
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

	q := NewClient(server.URL, "test-token", server.Client())
	if _, err := q.Pending(context.Background(), 0); err == nil {
		t.Fatal("expected error on non-200 status")
	}
}
