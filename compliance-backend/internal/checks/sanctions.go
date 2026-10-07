package checks

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"compliance-backend/internal/config"
	"compliance-backend/internal/evidence"
	"compliance-backend/internal/store"
)

type loadedList struct {
	id       int64
	name     string
	version  string
	sha256   string
	loadedAt time.Time
	entries  map[string]bool // lowercase 0x addresses
}

// Sanctions screens the payer address against versioned address lists. Lists load at start and on
// reload (SIGHUP); every result names the exact list versions it used.
type Sanctions struct {
	mu    sync.RWMutex
	lists []loadedList
}

func (*Sanctions) Kind() string { return "sanctions" }

// Load (re)reads every configured list and records its version row.
func (s *Sanctions) Load(ctx context.Context, st *store.Store, cfgs []config.SanctionsList) error {
	lists := make([]loadedList, 0, len(cfgs))
	for _, c := range cfgs {
		raw, err := os.ReadFile(c.Path)
		if err != nil {
			return fmt.Errorf("sanctions list %s: %w", c.Name, err)
		}
		l := loadedList{name: c.Name, version: c.Version, sha256: evidence.SHA(raw), entries: map[string]bool{}}
		sc := bufio.NewScanner(bytes.NewReader(raw))
		for sc.Scan() {
			line := strings.TrimSpace(strings.SplitN(sc.Text(), "#", 2)[0])
			if line != "" {
				l.entries[strings.ToLower(line)] = true
			}
		}
		err = st.QueryRow(ctx, `
			INSERT INTO sanctions_list_version (name, version, sha256, entries) VALUES ($1, $2, $3, $4)
			ON CONFLICT (name, version, sha256) DO UPDATE SET entries = EXCLUDED.entries
			RETURNING id, loaded_at`, l.name, l.version, l.sha256, len(l.entries)).Scan(&l.id, &l.loadedAt)
		if err != nil {
			return err
		}
		lists = append(lists, l)
	}
	s.mu.Lock()
	s.lists = lists
	s.mu.Unlock()
	return nil
}

func (s *Sanctions) Run(_ context.Context, p Payment) (Result, []byte, error) {
	s.mu.RLock()
	lists := s.lists
	s.mu.RUnlock()
	res := Result{Provider: "Deflow", Product: "address list screening"}
	if len(lists) == 0 {
		return res, nil, fmt.Errorf("no sanctions list loaded")
	}
	payer := strings.ToLower(p.Payer.Hex())
	used := []any{}
	matched := []any{}
	for _, l := range lists {
		used = append(used, map[string]any{"name": l.name, "version": l.version, "sha256": l.sha256,
			"loaded_at": l.loadedAt.UTC().Format(time.RFC3339), "version_id": l.id})
		if l.entries[payer] {
			matched = append(matched, map[string]any{"field": "payer_address", "value": p.Payer.Hex(), "list": l.name, "list_version": l.version})
		}
	}
	res.Outcome = "NO_MATCH"
	var matchedOn any = "No match on the payer address. Direct counterparties are not screened in this version."
	if len(matched) > 0 {
		res.Outcome = "TRUE_MATCH"
		matchedOn = matched
	}
	now := time.Now().UTC()
	res.PerformedAt = now
	res.Section = map[string]any{
		"fields_screened":     "Payer address",
		"name_screening":      "NOT_PERFORMED",
		"algorithm":           "exact address match, case-insensitive",
		"threshold":           "exact",
		"calibration_version": "n/a",
		"lists":               used,
		"screened_at":         now.Format(time.RFC3339),
		"result":              res.Outcome,
		"matched_on":          matchedOn,
		"alert_analysis":      nil,
		"reviewer":            nil,
		"second_reviewer":     nil,
	}
	return res, nil, nil
}
