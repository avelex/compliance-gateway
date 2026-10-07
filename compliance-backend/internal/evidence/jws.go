package evidence

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"os"
	"strings"
)

var b64 = base64.RawURLEncoding

// JWSSigner signs canonical pack data as a detached JWS (RFC 7515 appendix F) with ES256.
//
// ponytail: key from a PEM file; a KMS-backed signer is the follow-up (design D6).
type JWSSigner struct {
	KID string
	key *ecdsa.PrivateKey
}

// LoadJWSSigner reads a P-256 private key in PKCS#8 or SEC 1 PEM form.
func LoadJWSSigner(path, kid string) (*JWSSigner, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	blk, _ := pem.Decode(raw)
	if blk == nil {
		return nil, fmt.Errorf("%s: no PEM block", path)
	}
	var key *ecdsa.PrivateKey
	if k, err := x509.ParsePKCS8PrivateKey(blk.Bytes); err == nil {
		ek, ok := k.(*ecdsa.PrivateKey)
		if !ok {
			return nil, fmt.Errorf("%s: not an ECDSA key", path)
		}
		key = ek
	} else if key, err = x509.ParseECPrivateKey(blk.Bytes); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if key.Curve != elliptic.P256() {
		return nil, fmt.Errorf("%s: ES256 needs a P-256 key", path)
	}
	return &JWSSigner{KID: kid, key: key}, nil
}

// NewJWSSigner wraps an in-memory key (tests).
func NewJWSSigner(key *ecdsa.PrivateKey, kid string) *JWSSigner {
	return &JWSSigner{KID: kid, key: key}
}

func (s *JWSSigner) Public() *ecdsa.PublicKey { return &s.key.PublicKey }

func (s *JWSSigner) header() string {
	return b64.EncodeToString(mustCanon(map[string]any{"alg": "ES256", "kid": s.KID}))
}

// Sign returns "<b64url header>..<b64url r||s>" over payload.
func (s *JWSSigner) Sign(payload []byte) (string, error) {
	h := s.header()
	digest := sha256.Sum256([]byte(h + "." + b64.EncodeToString(payload)))
	r, ss, err := ecdsa.Sign(rand.Reader, s.key, digest[:])
	if err != nil {
		return "", err
	}
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	ss.FillBytes(sig[32:])
	return h + ".." + b64.EncodeToString(sig), nil
}

// VerifyJWS checks a detached ES256 JWS over payload.
func VerifyJWS(pub *ecdsa.PublicKey, jws string, payload []byte) error {
	parts := strings.Split(jws, ".")
	if len(parts) != 3 || parts[1] != "" {
		return errors.New("not a detached JWS")
	}
	sig, err := b64.DecodeString(parts[2])
	if err != nil || len(sig) != 64 {
		return errors.New("bad ES256 signature encoding")
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + b64.EncodeToString(payload)))
	if !ecdsa.Verify(pub, digest[:], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:])) {
		return errors.New("JWS signature does not verify")
	}
	return nil
}
