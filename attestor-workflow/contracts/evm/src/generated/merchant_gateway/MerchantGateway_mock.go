// Code generated — DO NOT EDIT.

//go:build !wasip1

package merchant_gateway

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

// MerchantGatewayMock is a mock implementation of MerchantGateway for testing.
type MerchantGatewayMock struct {
	MAXRISK                 func() (uint8, error)
	MAXTHRESHOLD            func() (*big.Int, error)
	SPENDWINDOW             func() (uint64, error)
	TIMEOUT                 func() (uint64, error)
	Factory                 func() (common.Address, error)
	GetExpectedAuthor       func() (common.Address, error)
	GetExpectedWorkflowId   func() ([32]byte, error)
	GetExpectedWorkflowName func() ([10]byte, error)
	GetForwarderAddress     func() (common.Address, error)
	Owner                   func() (common.Address, error)
	Payments                func(PaymentsInput) (PaymentsOutput, error)
	PayoutTo                func() (common.Address, error)
	Policy                  func() (PolicyOutput, error)
	Registry                func() (common.Address, error)
	Spent                   func(SpentInput) (SpentOutput, error)
	SupportsInterface       func(SupportsInterfaceInput) (bool, error)
	Token                   func() (common.Address, error)
}

// NewMerchantGatewayMock creates a new MerchantGatewayMock for testing.
func NewMerchantGatewayMock(address common.Address, clientMock *evmmock.ClientCapability) *MerchantGatewayMock {
	mock := &MerchantGatewayMock{}

	codec, err := NewCodec()
	if err != nil {
		panic("failed to create codec for mock: " + err.Error())
	}

	abi := codec.(*Codec).abi
	_ = abi

	funcMap := map[string]func([]byte) ([]byte, error){
		string(abi.Methods["MAX_RISK"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.MAXRISK == nil {
				return nil, errors.New("MAX_RISK method not mocked")
			}
			result, err := mock.MAXRISK()
			if err != nil {
				return nil, err
			}
			return abi.Methods["MAX_RISK"].Outputs.Pack(result)
		},
		string(abi.Methods["MAX_THRESHOLD"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.MAXTHRESHOLD == nil {
				return nil, errors.New("MAX_THRESHOLD method not mocked")
			}
			result, err := mock.MAXTHRESHOLD()
			if err != nil {
				return nil, err
			}
			return abi.Methods["MAX_THRESHOLD"].Outputs.Pack(result)
		},
		string(abi.Methods["SPEND_WINDOW"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.SPENDWINDOW == nil {
				return nil, errors.New("SPEND_WINDOW method not mocked")
			}
			result, err := mock.SPENDWINDOW()
			if err != nil {
				return nil, err
			}
			return abi.Methods["SPEND_WINDOW"].Outputs.Pack(result)
		},
		string(abi.Methods["TIMEOUT"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.TIMEOUT == nil {
				return nil, errors.New("TIMEOUT method not mocked")
			}
			result, err := mock.TIMEOUT()
			if err != nil {
				return nil, err
			}
			return abi.Methods["TIMEOUT"].Outputs.Pack(result)
		},
		string(abi.Methods["factory"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.Factory == nil {
				return nil, errors.New("factory method not mocked")
			}
			result, err := mock.Factory()
			if err != nil {
				return nil, err
			}
			return abi.Methods["factory"].Outputs.Pack(result)
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
		string(abi.Methods["payments"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.Payments == nil {
				return nil, errors.New("payments method not mocked")
			}
			inputs := abi.Methods["payments"].Inputs

			values, err := inputs.Unpack(payload)
			if err != nil {
				return nil, errors.New("Failed to unpack payload")
			}
			if len(values) != 1 {
				return nil, errors.New("expected 1 input value")
			}

			args := PaymentsInput{
				Arg0: values[0].([32]byte),
			}

			result, err := mock.Payments(args)
			if err != nil {
				return nil, err
			}
			return abi.Methods["payments"].Outputs.Pack(
				result.Payer,
				result.OpenedAt,
				result.MaxRisk,
				result.Status,
				result.Amount,
			)
		},
		string(abi.Methods["payoutTo"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.PayoutTo == nil {
				return nil, errors.New("payoutTo method not mocked")
			}
			result, err := mock.PayoutTo()
			if err != nil {
				return nil, err
			}
			return abi.Methods["payoutTo"].Outputs.Pack(result)
		},
		string(abi.Methods["policy"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.Policy == nil {
				return nil, errors.New("policy method not mocked")
			}
			result, err := mock.Policy()
			if err != nil {
				return nil, err
			}
			return abi.Methods["policy"].Outputs.Pack(
				result.LevelBelow,
				result.LevelAbove,
				result.Threshold,
				result.MaxRisk,
			)
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
		string(abi.Methods["spent"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.Spent == nil {
				return nil, errors.New("spent method not mocked")
			}
			inputs := abi.Methods["spent"].Inputs

			values, err := inputs.Unpack(payload)
			if err != nil {
				return nil, errors.New("Failed to unpack payload")
			}
			if len(values) != 1 {
				return nil, errors.New("expected 1 input value")
			}

			args := SpentInput{
				Arg0: values[0].([32]byte),
			}

			result, err := mock.Spent(args)
			if err != nil {
				return nil, err
			}
			return abi.Methods["spent"].Outputs.Pack(
				result.WindowStart,
				result.Amount,
			)
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
		string(abi.Methods["token"].ID[:4]): func(payload []byte) ([]byte, error) {
			if mock.Token == nil {
				return nil, errors.New("token method not mocked")
			}
			result, err := mock.Token()
			if err != nil {
				return nil, err
			}
			return abi.Methods["token"].Outputs.Pack(result)
		},
	}

	evmmock.AddContractMock(address, clientMock, funcMap, nil)
	return mock
}
