// Code generated — DO NOT EDIT.

//go:build !wasip1

package gateway_factory

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

// GatewayFactoryMock is a mock implementation of GatewayFactory for testing.
type GatewayFactoryMock struct {
	Forwarder     func() (common.Address, error)
	Registry      func() (common.Address, error)
	WorkflowName  func() ([10]byte, error)
	WorkflowOwner func() (common.Address, error)
}

// NewGatewayFactoryMock creates a new GatewayFactoryMock for testing.
func NewGatewayFactoryMock(address common.Address, clientMock *evmmock.ClientCapability) *GatewayFactoryMock {
	mock := &GatewayFactoryMock{}

	codec, err := NewCodec()
	if err != nil {
		panic("failed to create codec for mock: " + err.Error())
	}

	abi := codec.(*Codec).abi
	_ = abi

	funcMap := map[string]func([]byte) ([]byte, error){
		string(abi.Methods["forwarder"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.Forwarder == nil {
				return nil, errors.New("forwarder method not mocked")
			}
			result, err := mock.Forwarder()
			if err != nil {
				return nil, err
			}
			return abi.Methods["forwarder"].Outputs.Pack(result)
		},
		string(abi.Methods["registry"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.Registry == nil {
				return nil, errors.New("registry method not mocked")
			}
			result, err := mock.Registry()
			if err != nil {
				return nil, err
			}
			return abi.Methods["registry"].Outputs.Pack(result)
		},
		string(abi.Methods["workflowName"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.WorkflowName == nil {
				return nil, errors.New("workflowName method not mocked")
			}
			result, err := mock.WorkflowName()
			if err != nil {
				return nil, err
			}
			return abi.Methods["workflowName"].Outputs.Pack(result)
		},
		string(abi.Methods["workflowOwner"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.WorkflowOwner == nil {
				return nil, errors.New("workflowOwner method not mocked")
			}
			result, err := mock.WorkflowOwner()
			if err != nil {
				return nil, err
			}
			return abi.Methods["workflowOwner"].Outputs.Pack(result)
		},
	}

	evmmock.AddContractMock(address, clientMock, funcMap, nil)
	return mock
}
