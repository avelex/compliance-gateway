// Package storetest gives each test its own throwaway database on the server in DATABASE_URL.
package storetest

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/url"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"

	"compliance-backend/internal/store"
)

// URL returns DATABASE_URL or skips the test.
func URL(t testing.TB) string {
	u := os.Getenv("DATABASE_URL")
	if u == "" {
		t.Skip("DATABASE_URL not set; run `docker compose up -d` and export DATABASE_URL")
	}
	return u
}

// New creates a fresh migrated database, dropped when the test ends.
func New(t testing.TB) *store.Store {
	t.Helper()
	base := URL(t)
	ctx := context.Background()
	b := make([]byte, 6)
	rand.Read(b)
	name := "test_" + hex.EncodeToString(b)

	admin, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(base)
	u.Path = "/" + name
	s, err := store.Open(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		s.Close()
		admin.Exec(ctx, "DROP DATABASE "+name+" WITH (FORCE)")
		admin.Close(ctx)
	})
	return s
}
