package sumsubapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDoSignsRequest(t *testing.T) {
	secret := "s3cr3t"
	var gotTS, gotSig string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotTS = r.Header.Get("X-App-Access-Ts")
		gotSig = r.Header.Get("X-App-Access-Sig")
		if r.Header.Get("X-App-Token") != "token" {
			t.Fatalf("missing app token header")
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	c := &Client{BaseURL: server.URL, AppToken: "token", SecretKey: secret, HTTPClient: server.Client()}
	resp, err := c.Do(context.Background(), http.MethodGet, "/resources/applicants/-;externalUserId=0x1/one", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(gotTS + http.MethodGet + "/resources/applicants/-;externalUserId=0x1/one"))
	want := hex.EncodeToString(mac.Sum(nil))

	if gotSig != want {
		t.Fatalf("sig = %s, want %s", gotSig, want)
	}
}

func TestDoJSONOKErrorsOnNon200(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer server.Close()

	c := &Client{BaseURL: server.URL, AppToken: "t", SecretKey: "s", HTTPClient: server.Client()}
	if _, err := c.DoJSONOK(context.Background(), http.MethodGet, "/x", nil); err == nil {
		t.Fatal("expected error")
	}
}
