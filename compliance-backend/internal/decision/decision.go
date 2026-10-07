// Package decision builds and verifies processor decisions: the EIP-712 Decision struct the
// processor contracts accept, ruleset approvals, keys, and the freeze-safe transition table.
package decision

import (
	"crypto/ecdsa"
	"errors"
	"fmt"
	"math/big"
	"os"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	gmath "github.com/ethereum/go-ethereum/common/math"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"
)

// Decision kinds, as in contracts/src/processor/libs/Decision.sol.
const (
	Credit uint8 = 1
	Hold   uint8 = 2
	Freeze uint8 = 3
	Return uint8 = 4
)

var names = map[uint8]string{Credit: "CREDIT", Hold: "HOLD", Freeze: "FREEZE", Return: "RETURN"}

func Name(k uint8) string { return names[k] }

// Kind parses "CREDIT" etc.
func Kind(name string) (uint8, error) {
	for k, n := range names {
		if n == name {
			return k, nil
		}
	}
	return 0, fmt.Errorf("unknown decision %q", name)
}

// Permits reports whether a signer mask (CREDIT=1 HOLD=2 FREEZE=4 RETURN=8) allows kind.
func Permits(mask, kind uint8) bool {
	return kind >= Credit && kind <= Return && mask&(1<<(kind-1)) != 0
}

// Struct is Decision(bytes32 paymentId,uint8 decision,address token,uint256 amount,bytes32 packHash,uint64 nonce,uint64 deadline).
type Struct struct {
	PaymentID common.Hash
	Decision  uint8
	Token     common.Address
	Amount    *big.Int
	PackHash  common.Hash
	Nonce     uint64
	Deadline  uint64
}

var decisionTypes = apitypes.Types{
	"EIP712Domain": {
		{Name: "name", Type: "string"}, {Name: "version", Type: "string"},
		{Name: "chainId", Type: "uint256"}, {Name: "verifyingContract", Type: "address"},
	},
	"Decision": {
		{Name: "paymentId", Type: "bytes32"}, {Name: "decision", Type: "uint8"},
		{Name: "token", Type: "address"}, {Name: "amount", Type: "uint256"},
		{Name: "packHash", Type: "bytes32"}, {Name: "nonce", Type: "uint64"}, {Name: "deadline", Type: "uint64"},
	},
}

// TypedData is the EIP-712 document for s; verifyingContract is the deposit account (mode a) or
// the deposit address (mode b).
func TypedData(chainID uint64, verifying common.Address, s Struct) apitypes.TypedData {
	return apitypes.TypedData{
		Types:       decisionTypes,
		PrimaryType: "Decision",
		Domain: apitypes.TypedDataDomain{Name: "Deflow Decision", Version: "1",
			ChainId: (*gmath.HexOrDecimal256)(new(big.Int).SetUint64(chainID)), VerifyingContract: verifying.Hex()},
		Message: apitypes.TypedDataMessage{
			"paymentId": s.PaymentID.Hex(), "decision": fmt.Sprint(s.Decision), "token": s.Token.Hex(),
			"amount": s.Amount.String(), "packHash": s.PackHash.Hex(),
			"nonce": fmt.Sprint(s.Nonce), "deadline": fmt.Sprint(s.Deadline),
		},
	}
}

// Digest is the EIP-712 hash to sign.
func Digest(td apitypes.TypedData) (common.Hash, error) {
	h, _, err := apitypes.TypedDataAndHash(td)
	if err != nil {
		return common.Hash{}, err
	}
	return common.BytesToHash(h), nil
}

// JSON renders typed data the way wallets and `cast wallet sign --data` accept it: go-ethereum's own
// encoding adds an empty "salt" that Foundry rejects (spike T1).
func JSON(td apitypes.TypedData) map[string]any {
	domain := map[string]any{"name": td.Domain.Name, "version": td.Domain.Version}
	if td.Domain.ChainId != nil {
		domain["chainId"] = (*big.Int)(td.Domain.ChainId).String()
	}
	if td.Domain.VerifyingContract != "" {
		domain["verifyingContract"] = td.Domain.VerifyingContract
	}
	types := map[string]any{}
	for name, fields := range td.Types {
		l := make([]any, len(fields))
		for i, f := range fields {
			l[i] = map[string]any{"name": f.Name, "type": f.Type}
		}
		types[name] = l
	}
	msg := map[string]any{}
	for k, v := range td.Message {
		msg[k] = v
	}
	return map[string]any{"types": types, "primaryType": td.PrimaryType, "domain": domain, "message": msg}
}

// Recover returns the address that produced a 65-byte signature over digest (v as 0/1 or 27/28).
func Recover(digest common.Hash, sig []byte) (common.Address, error) {
	if len(sig) != 65 {
		return common.Address{}, errors.New("signature must be 65 bytes")
	}
	s := append([]byte{}, sig...)
	if s[64] >= 27 {
		s[64] -= 27
	}
	pub, err := crypto.SigToPub(digest.Bytes(), s)
	if err != nil {
		return common.Address{}, err
	}
	return crypto.PubkeyToAddress(*pub), nil
}

// RulesetApproval(bytes32 rulesetHash,string version,uint64 effectiveFrom) under {name: "Deflow Ruleset", version: "1"}.
// The domain has no chainId: a ruleset applies across chains.
func RulesetApproval(rulesetHash common.Hash, version string, effectiveFrom uint64) apitypes.TypedData {
	return apitypes.TypedData{
		Types: apitypes.Types{
			"EIP712Domain":    {{Name: "name", Type: "string"}, {Name: "version", Type: "string"}},
			"RulesetApproval": {{Name: "rulesetHash", Type: "bytes32"}, {Name: "version", Type: "string"}, {Name: "effectiveFrom", Type: "uint64"}},
		},
		PrimaryType: "RulesetApproval",
		Domain:      apitypes.TypedDataDomain{Name: "Deflow Ruleset", Version: "1"},
		Message: apitypes.TypedDataMessage{"rulesetHash": rulesetHash.Hex(), "version": version,
			"effectiveFrom": fmt.Sprint(effectiveFrom)},
	}
}

// Signer signs EIP-712 digests with the processor's policy key.
type Signer interface {
	Address() common.Address
	Sign(digest common.Hash) ([]byte, error)
}

// KeySigner holds a secp256k1 key in memory.
//
// ponytail: file key; a KMS implementation of Signer is the pilot follow-up (design D6).
type KeySigner struct{ key *ecdsa.PrivateKey }

func NewKeySigner(k *ecdsa.PrivateKey) *KeySigner { return &KeySigner{k} }

func (s *KeySigner) Address() common.Address { return crypto.PubkeyToAddress(s.key.PublicKey) }

// Sign returns r||s||v with v as 27/28, the form contracts and wallets use.
func (s *KeySigner) Sign(digest common.Hash) ([]byte, error) {
	sig, err := crypto.Sign(digest.Bytes(), s.key)
	if err != nil {
		return nil, err
	}
	sig[64] += 27
	return sig, nil
}

// LoadFileSigner reads a hex private key (with or without 0x).
func LoadFileSigner(path string) (*KeySigner, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	k, err := crypto.HexToECDSA(strings.TrimPrefix(strings.TrimSpace(string(raw)), "0x"))
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return &KeySigner{k}, nil
}
