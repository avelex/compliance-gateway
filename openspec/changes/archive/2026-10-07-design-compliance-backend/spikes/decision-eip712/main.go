// Spike T1: EIP-712 test vector for the Deflow Decision struct (design.md D7).
// Prints spikes/decision-eip712.json to stdout and writes one typed-data file per case
// for cross-checking with `cast wallet sign --data --from-file`.
package main

import (
	"encoding/json"
	"fmt"
	"math/big"
	"os"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/common/math"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"
)

// Anvil account #0. Public test key, never use outside tests.
const testKey = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

const (
	chainID           = 84532
	verifyingContract = "0x5Abe6E7c1fE5d3F72a93c0f1Bf05cdA05F4161f6"
	// evidence_root of Payment_Passport_Specimen_B_Frozen_FIU.pdf
	packHash = "0x441bcff8a5eec272813a04f65aa31cce8ec3e34b696ad30a6c4fd326aedd865a"
	txHash   = "0xb41875ee16d70f08ac302433f1735f2f303f103cab3847e3606c78e3ee191000"
	logIndex = 212
	deadline = 1789999999
)

var types = apitypes.Types{
	"EIP712Domain": {
		{Name: "name", Type: "string"},
		{Name: "version", Type: "string"},
		{Name: "chainId", Type: "uint256"},
		{Name: "verifyingContract", Type: "address"},
	},
	"Decision": {
		{Name: "paymentId", Type: "bytes32"},
		{Name: "decision", Type: "uint8"},
		{Name: "packHash", Type: "bytes32"},
		{Name: "nonce", Type: "uint64"},
		{Name: "deadline", Type: "uint64"},
	},
}

type vectorCase struct {
	Name       string                 `json:"name"`
	Message    map[string]interface{} `json:"message"`
	StructHash string                 `json:"structHash"`
	Digest     string                 `json:"digest"`
	Signature  string                 `json:"signature"`
}

func main() {
	key, _ := crypto.HexToECDSA(testKey)
	// paymentId = keccak256(abi.encode(uint256 chainId, bytes32 txHash, uint256 logIndex))
	paymentID := crypto.Keccak256Hash(
		common.LeftPadBytes(big.NewInt(chainID).Bytes(), 32),
		common.HexToHash(txHash).Bytes(),
		common.LeftPadBytes(big.NewInt(logIndex).Bytes(), 32),
	)

	domain := apitypes.TypedDataDomain{
		Name: "Deflow Decision", Version: "1",
		ChainId:           math.NewHexOrDecimal256(chainID),
		VerifyingContract: verifyingContract,
	}

	var cases []vectorCase
	// HOLD (auto, nonce 1), then FREEZE (officer, nonce 2) mirror specimen B; CREDIT and RETURN complete the set.
	for i, c := range []struct {
		name     string
		decision int
		nonce    int
	}{{"CREDIT", 1, 1}, {"HOLD", 2, 1}, {"FREEZE", 3, 2}, {"RETURN", 4, 1}} {
		msg := apitypes.TypedDataMessage{
			"paymentId": paymentID.Hex(),
			"decision":  fmt.Sprint(c.decision),
			"packHash":  packHash,
			"nonce":     fmt.Sprint(c.nonce),
			"deadline":  fmt.Sprint(deadline),
		}
		td := apitypes.TypedData{Types: types, PrimaryType: "Decision", Domain: domain, Message: msg}
		digest, _, err := apitypes.TypedDataAndHash(td)
		check(err)
		structHash, err := td.HashStruct("Decision", msg)
		check(err)
		sig, err := crypto.Sign(digest, key)
		check(err)
		sig[64] += 27

		// Written by hand rather than marshalling td: go-ethereum emits `"salt": ""`, which other
		// EIP-712 tooling (cast) rejects. The domain here has exactly the four typed fields.
		raw, _ := json.MarshalIndent(map[string]interface{}{
			"types": types, "primaryType": "Decision", "message": msg,
			"domain": map[string]interface{}{"name": domain.Name, "version": domain.Version, "chainId": chainID, "verifyingContract": verifyingContract},
		}, "", "  ")
		check(os.WriteFile(fmt.Sprintf("typed-%d-%s.json", i, c.name), raw, 0o644))
		cases = append(cases, vectorCase{c.name, msg, structHash.String(), hexutil.Encode(digest), hexutil.Encode(sig)})
	}

	out := map[string]interface{}{
		"description": "Deflow Decision EIP-712 test vector (design-compliance-backend D7). Test key only.",
		"signer":      crypto.PubkeyToAddress(key.PublicKey).Hex(),
		"paymentIdRule": "keccak256(abi.encode(uint256 chainId, bytes32 txHash, uint256 logIndex))",
		"paymentIdInputs": map[string]interface{}{"chainId": chainID, "txHash": txHash, "logIndex": logIndex},
		"domain":  domain,
		"types":   types,
		"cases":   cases,
	}
	raw, _ := json.MarshalIndent(out, "", "  ")
	fmt.Println(string(raw))
}

func check(err error) {
	if err != nil {
		panic(err)
	}
}
