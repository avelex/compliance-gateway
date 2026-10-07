// Package api is the processor-staff HTTP API (design D9), JSON over HTTPS behind a bearer token.
package api

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"

	"compliance-backend/internal/decision"
	"compliance-backend/internal/evidence"
	"compliance-backend/internal/pipeline"
)

type Server struct {
	P      *pipeline.Pipeline
	Token  string
	Health func() map[string]any
}

func (s *Server) Handler() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { write(w, http.StatusOK, s.Health()) })
	m.Handle("GET /v1/cases", s.auth(s.cases))
	m.Handle("GET /v1/payments/{ref}", s.auth(s.payment))
	m.Handle("GET /v1/payments/{ref}/typed-data", s.auth(s.typedData))
	m.Handle("POST /v1/payments/{ref}/decisions", s.auth(s.decide))
	m.Handle("POST /v1/rulesets", s.auth(s.importRuleset))
	m.Handle("POST /v1/rulesets/{version}/approve", s.auth(s.approveRuleset))
	m.Handle("POST /v1/packs/{pack_id}/projections", s.auth(s.project))
	return m
}

// ponytail: one shared bearer token; processor OIDC with officer identities from claims is the follow-up.
// Officer identity itself comes from the officer's signing key, not from this token.
func (s *Server) auth(h http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || subtle.ConstantTimeCompare([]byte(got), []byte(s.Token)) != 1 {
			fail(w, http.StatusUnauthorized, "unauthorized", "a valid bearer token is required")
			return
		}
		h(w, r)
	})
}

func write(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, code, detail string) {
	write(w, status, map[string]string{"error": code, "detail": detail})
}

func failErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, pipeline.ErrNotFound):
		fail(w, http.StatusNotFound, "not_found", err.Error())
	case errors.Is(err, pipeline.ErrConflict):
		fail(w, http.StatusConflict, "conflict", err.Error())
	case errors.Is(err, pipeline.ErrForbidden):
		fail(w, http.StatusForbidden, "forbidden", err.Error())
	case errors.Is(err, pipeline.ErrBadRequest):
		fail(w, http.StatusBadRequest, "bad_request", err.Error())
	default:
		fail(w, http.StatusInternalServerError, "internal", "internal error")
	}
}

func decodeBody(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		fail(w, http.StatusBadRequest, "bad_request", "invalid JSON body: "+err.Error())
		return false
	}
	return true
}

func paymentRef(w http.ResponseWriter, r *http.Request) (common.Hash, bool) {
	ref := r.PathValue("ref")
	b, err := hexutil.Decode(ref)
	if err != nil || len(b) != 32 {
		fail(w, http.StatusBadRequest, "bad_request", "payment ref must be a 0x-prefixed 32-byte payment id")
		return common.Hash{}, false
	}
	return common.BytesToHash(b), true
}

func (s *Server) cases(w http.ResponseWriter, r *http.Request) {
	cs, err := s.P.Cases(r.Context())
	if err != nil {
		failErr(w, err)
		return
	}
	write(w, http.StatusOK, map[string]any{"cases": cs})
}

func (s *Server) payment(w http.ResponseWriter, r *http.Request) {
	id, ok := paymentRef(w, r)
	if !ok {
		return
	}
	p, err := s.P.Payment(r.Context(), id)
	if err != nil {
		failErr(w, err)
		return
	}
	write(w, http.StatusOK, p)
}

func (s *Server) typedData(w http.ResponseWriter, r *http.Request) {
	id, ok := paymentRef(w, r)
	if !ok {
		return
	}
	kind, err := decision.Kind(r.URL.Query().Get("decision"))
	if err != nil {
		fail(w, http.StatusBadRequest, "bad_request", "decision must be CREDIT, HOLD, FREEZE or RETURN")
		return
	}
	doc, err := s.P.OfficerTypedData(r.Context(), id, kind)
	if err != nil {
		failErr(w, err)
		return
	}
	write(w, http.StatusOK, doc)
}

func (s *Server) decide(w http.ResponseWriter, r *http.Request) {
	id, ok := paymentRef(w, r)
	if !ok {
		return
	}
	var body struct {
		Decision  string        `json:"decision"`
		Signature hexutil.Bytes `json:"signature"`
		Rationale string        `json:"rationale"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	kind, err := decision.Kind(body.Decision)
	if err != nil {
		fail(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	packID, version, err := s.P.OfficerDecide(r.Context(), id, kind, body.Signature, body.Rationale)
	if err != nil {
		failErr(w, err)
		return
	}
	write(w, http.StatusCreated, map[string]any{"pack_id": packID, "pack_version": version})
}

func (s *Server) importRuleset(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		fail(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	from := time.Now().UTC()
	if q := r.URL.Query().Get("effective_from"); q != "" {
		if from, err = time.Parse(time.RFC3339, q); err != nil {
			fail(w, http.StatusBadRequest, "bad_request", "effective_from must be RFC 3339")
			return
		}
	}
	version, hash, err := s.P.ImportRuleset(r.Context(), raw)
	if err != nil {
		failErr(w, err)
		return
	}
	approval, err := s.P.ApprovalTypedData(r.Context(), version, from)
	if err != nil {
		failErr(w, err)
		return
	}
	write(w, http.StatusCreated, map[string]any{"version": version, "ruleset_hash": hash,
		"effective_from": from.Format(time.RFC3339), "approval_typed_data": approval})
}

func (s *Server) approveRuleset(w http.ResponseWriter, r *http.Request) {
	var body struct {
		EffectiveFrom time.Time     `json:"effective_from"`
		Signature     hexutil.Bytes `json:"signature"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	by, err := s.P.ApproveRuleset(r.Context(), r.PathValue("version"), body.EffectiveFrom, body.Signature)
	if err != nil {
		failErr(w, err)
		return
	}
	write(w, http.StatusOK, map[string]any{"version": r.PathValue("version"), "approved_by": by.Hex()})
}

func (s *Server) project(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Profile     string `json:"profile"`
		PreparedFor string `json:"prepared_for"`
		Purpose     string `json:"purpose"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	copy, err := s.P.Project(r.Context(), r.PathValue("pack_id"), evidence.Recipient{Profile: body.Profile, PreparedFor: body.PreparedFor, Purpose: body.Purpose})
	if err != nil {
		failErr(w, err)
		return
	}
	// Canonical bytes, so a recipient's file hashes exactly as the verifier expects.
	b, err := evidence.Canon(copy)
	if err != nil {
		failErr(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	w.Write(b)
}
