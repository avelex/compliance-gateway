// Code generated — DO NOT EDIT.

//go:build !wasip1

package attestation_registry

import (
	"errors"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	evmmock "github.com/smartcontractkit/cre-sdk-go/capabilities/blockchain/evm/mock"
)

var (
	_ = errors.New
	_ = fmt.Errorf
	_ = big.NewInt
	_ = common.Big1
)

// AttestationRegistryMock is a mock implementation of AttestationRegistry for testing.
type AttestationRegistryMock struct {
	MAXSTALE                func() (uint64, error)
	AttestationOf           func(AttestationOfInput) (Attestation, error)
	GetExpectedAuthor       func() (common.Address, error)
	GetExpectedWorkflowId   func() ([32]byte, error)
	GetExpectedWorkflowName func() ([10]byte, error)
	GetForwarderAddress     func() (common.Address, error)
	IsValid                 func(IsValidInput) (bool, error)
	LastHeartbeat           func() (uint64, error)
	NullifierOf             func(NullifierOfInput) ([32]byte, error)
	Owner                   func() (common.Address, error)
	RevokedNullifier        func(RevokedNullifierInput) (bool, error)
	SupportsInterface       func(SupportsInterfaceInput) (bool, error)
}

// NewAttestationRegistryMock creates a new AttestationRegistryMock for testing.
func NewAttestationRegistryMock(address common.Address, clientMock *evmmock.ClientCapability) *AttestationRegistryMock {
	mock := &AttestationRegistryMock{}

	codec, err := NewCodec()
	if err != nil {
		panic("failed to create codec for mock: " + err.Error())
	}

	abi := codec.(*Codec).abi
	_ = abi

	funcMap := map[string]func([]byte) ([]byte, error){
		string(abi.Methods["MAX_STALE"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.MAXSTALE == nil {
				return nil, errors.New("MAX_STALE method not mocked")
			}
			result, err := mock.MAXSTALE()
			if err != nil {
				return nil, err
			}
			return abi.Methods["MAX_STALE"].Outputs.Pack(result)
		},
		string(abi.Methods["attestationOf"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.AttestationOf == nil {
				return nil, errors.New("attestationOf method not mocked")
			}
			inputs := abi.Methods["attestationOf"].Inputs

			values, err := inputs.Unpack(payload)
			if err != nil {
				return nil, errors.New("Failed to unpack payload")
			}
			if len(values) != 2 {
				return nil, errors.New("expected 2 input values")
			}

			args := AttestationOfInput{
				Gate:   values[0].(common.Address),
				Wallet: values[1].(common.Address),
			}

			result, err := mock.AttestationOf(args)
			if err != nil {
				return nil, err
			}
			return abi.Methods["attestationOf"].Outputs.Pack(result)
		},
		string(abi.Methods["getExpectedAuthor"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.GetExpectedAuthor == nil {
				return nil, errors.New("getExpectedAuthor method not mocked")
			}
			result, err := mock.GetExpectedAuthor()
			if err != nil {
				return nil, err
			}
			return abi.Methods["getExpectedAuthor"].Outputs.Pack(result)
		},
		string(abi.Methods["getExpectedWorkflowId"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.GetExpectedWorkflowId == nil {
				return nil, errors.New("getExpectedWorkflowId method not mocked")
			}
			result, err := mock.GetExpectedWorkflowId()
			if err != nil {
				return nil, err
			}
			return abi.Methods["getExpectedWorkflowId"].Outputs.Pack(result)
		},
		string(abi.Methods["getExpectedWorkflowName"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.GetExpectedWorkflowName == nil {
				return nil, errors.New("getExpectedWorkflowName method not mocked")
			}
			result, err := mock.GetExpectedWorkflowName()
			if err != nil {
				return nil, err
			}
			return abi.Methods["getExpectedWorkflowName"].Outputs.Pack(result)
		},
		string(abi.Methods["getForwarderAddress"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.GetForwarderAddress == nil {
				return nil, errors.New("getForwarderAddress method not mocked")
			}
			result, err := mock.GetForwarderAddress()
			if err != nil {
				return nil, err
			}
			return abi.Methods["getForwarderAddress"].Outputs.Pack(result)
		},
		string(abi.Methods["isValid"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.IsValid == nil {
				return nil, errors.New("isValid method not mocked")
			}
			inputs := abi.Methods["isValid"].Inputs

			values, err := inputs.Unpack(payload)
			if err != nil {
				return nil, errors.New("Failed to unpack payload")
			}
			if len(values) != 3 {
				return nil, errors.New("expected 3 input values")
			}

			args := IsValidInput{
				Gate:     values[0].(common.Address),
				Wallet:   values[1].(common.Address),
				MinLevel: values[2].(uint8),
			}

			result, err := mock.IsValid(args)
			if err != nil {
				return nil, err
			}
			return abi.Methods["isValid"].Outputs.Pack(result)
		},
		string(abi.Methods["lastHeartbeat"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.LastHeartbeat == nil {
				return nil, errors.New("lastHeartbeat method not mocked")
			}
			result, err := mock.LastHeartbeat()
			if err != nil {
				return nil, err
			}
			return abi.Methods["lastHeartbeat"].Outputs.Pack(result)
		},
		string(abi.Methods["nullifierOf"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.NullifierOf == nil {
				return nil, errors.New("nullifierOf method not mocked")
			}
			inputs := abi.Methods["nullifierOf"].Inputs

			values, err := inputs.Unpack(payload)
			if err != nil {
				return nil, errors.New("Failed to unpack payload")
			}
			if len(values) != 2 {
				return nil, errors.New("expected 2 input values")
			}

			args := NullifierOfInput{
				Gate:   values[0].(common.Address),
				Wallet: values[1].(common.Address),
			}

			result, err := mock.NullifierOf(args)
			if err != nil {
				return nil, err
			}
			return abi.Methods["nullifierOf"].Outputs.Pack(result)
		},
		string(abi.Methods["owner"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.Owner == nil {
				return nil, errors.New("owner method not mocked")
			}
			result, err := mock.Owner()
			if err != nil {
				return nil, err
			}
			return abi.Methods["owner"].Outputs.Pack(result)
		},
		string(abi.Methods["revokedNullifier"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.RevokedNullifier == nil {
				return nil, errors.New("revokedNullifier method not mocked")
			}
			inputs := abi.Methods["revokedNullifier"].Inputs

			values, err := inputs.Unpack(payload)
			if err != nil {
				return nil, errors.New("Failed to unpack payload")
			}
			if len(values) != 1 {
				return nil, errors.New("expected 1 input value")
			}

			args := RevokedNullifierInput{
				Arg0: values[0].([32]byte),
			}

			result, err := mock.RevokedNullifier(args)
			if err != nil {
				return nil, err
			}
			return abi.Methods["revokedNullifier"].Outputs.Pack(result)
		},
		string(abi.Methods["supportsInterface"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.SupportsInterface == nil {
				return nil, errors.New("supportsInterface method not mocked")
			}
			inputs := abi.Methods["supportsInterface"].Inputs

			values, err := inputs.Unpack(payload)
			if err != nil {
				return nil, errors.New("Failed to unpack payload")
			}
			if len(values) != 1 {
				return nil, errors.New("expected 1 input value")
			}

			args := SupportsInterfaceInput{
				InterfaceId: values[0].([4]byte),
			}

			result, err := mock.SupportsInterface(args)
			if err != nil {
				return nil, err
			}
			return abi.Methods["supportsInterface"].Outputs.Pack(result)
		},
	}

	evmmock.AddContractMock(address, clientMock, funcMap, nil)
	return mock
}
