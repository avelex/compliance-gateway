package decision

import (
	"bytes"
	"encoding/json"
	"math/big"
	"os"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"

	"compliance-backend/internal/config"
)

const anvilKey0 = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

// The contracts' cast fixture is the cross-implementation source of truth (processor-decision-contracts D9).
func TestDigestReproducesContractFixture(t *testing.T) {
	raw, err := os.ReadFile("../../../contracts/test/processor/fixtures/decision-eip712.json")
	if err != nil {
		t.Fatal(err)
	}
	var fx struct {
		Signer common.Address
		Cases  []struct {
			Name      string
			Signature hexutil.Bytes
			TypedData struct {
				Domain struct {
					ChainID           uint64         `json:"chainId"`
					VerifyingContract common.Address `json:"verifyingContract"`
				}
				Message map[string]string
			} `json:"typedData"`
		}
	}
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatal(err)
	}
	key, _ := crypto.HexToECDSA(anvilKey0)
	signer := NewKeySigner(key)
	if signer.Address() != fx.Signer {
		t.Fatal("fixture signer is not anvil key 0")
	}
	for _, c := range fx.Cases {
		m := c.TypedData.Message
		var kind, nonce, deadline uint64
		json.Unmarshal([]byte(m["decision"]), &kind)
		json.Unmarshal([]byte(m["nonce"]), &nonce)
		json.Unmarshal([]byte(m["deadline"]), &deadline)
		amount, _ := new(big.Int).SetString(m["amount"], 10)
		s := Struct{PaymentID: common.HexToHash(m["paymentId"]), Decision: uint8(kind), Token: common.HexToAddress(m["token"]),
			Amount: amount, PackHash: common.HexToHash(m["packHash"]), Nonce: nonce, Deadline: deadline}
		digest, err := Digest(TypedData(c.TypedData.Domain.ChainID, c.TypedData.Domain.VerifyingContract, s))
		if err != nil {
			t.Fatal(err)
		}
		sig, _ := signer.Sign(digest)
		if !bytes.Equal(sig, c.Signature) {
			t.Errorf("%s: service signature differs from cast's, so the digests differ", c.Name)
		}
		if a, _ := Recover(digest, c.Signature); a != fx.Signer {
			t.Errorf("%s: cast signature recovers to %s", c.Name, a)
		}
	}
}

func TestTransitionsMirrorProcessorHub(t *testing.T) {
	if _, err := Replay([]uint8{Freeze, Return}); err != ErrFrozen {
		t.Fatalf("RETURN after FREEZE: %v", err)
	}
	if _, err := Replay([]uint8{Freeze, Hold}); err != ErrFrozen {
		t.Fatalf("HOLD after FREEZE: %v", err)
	}
	if s, err := Replay([]uint8{Hold, Freeze, Freeze, Credit}); err != nil || s.Status != Credited {
		t.Fatalf("freeze then credit: %+v %v", s, err)
	}
	for _, k := range []uint8{Credit, Hold, Freeze, Return} {
		if _, err := Replay([]uint8{Credit, k}); err != ErrTerminal {
			t.Errorf("%s after CREDIT: %v", Name(k), err)
		}
		if _, err := Replay([]uint8{Return, k}); err != ErrTerminal {
			t.Errorf("%s after RETURN: %v", Name(k), err)
		}
	}
	if s, err := Replay([]uint8{Hold, Return}); err != nil || s.Status != Returned {
		t.Fatalf("hold then return: %+v %v", s, err)
	}
}

func TestApprovalAndOfficerVerification(t *testing.T) {
	mlroKey, _ := crypto.GenerateKey()
	otherKey, _ := crypto.GenerateKey()
	mlro := NewKeySigner(mlroKey)
	td := RulesetApproval(common.HexToHash("0x01"), "2026.10-1", 1790000000)
	d, _ := Digest(td)
	good, _ := mlro.Sign(d)
	bad, _ := NewKeySigner(otherKey).Sign(d)
	if _, err := VerifyApproval(td, good, []common.Address{mlro.Address()}); err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyApproval(td, bad, []common.Address{mlro.Address()}); err == nil {
		t.Fatal("non-MLRO approval accepted")
	}

	officer := NewKeySigner(otherKey)
	officers := []config.Officer{{Address: officer.Address(), OfficerID: "officer-01", Mask: 0x03}}
	dtd := TypedData(1, common.HexToAddress("0xdead"), Struct{Amount: big.NewInt(1), Decision: Freeze})
	dd, _ := Digest(dtd)
	sig, _ := officer.Sign(dd)
	if _, err := VerifyOfficer(dtd, sig, Freeze, officers); err == nil {
		t.Fatal("officer without FREEZE permission accepted")
	}
	officers[0].Mask = 0x0F
	if o, err := VerifyOfficer(dtd, sig, Freeze, officers); err != nil || o.OfficerID != "officer-01" {
		t.Fatalf("authorised officer: %v", err)
	}
	if _, err := VerifyOfficer(dtd, good, Freeze, officers); err == nil {
		t.Fatal("signature by a non-officer accepted")
	}
}

func TestTypedDataJSONHasNoSalt(t *testing.T) {
	j := JSON(TypedData(1, common.HexToAddress("0x01"), Struct{Amount: big.NewInt(1)}))
	if _, ok := j["domain"].(map[string]any)["salt"]; ok {
		t.Fatal("salt present; Foundry rejects it")
	}
}
