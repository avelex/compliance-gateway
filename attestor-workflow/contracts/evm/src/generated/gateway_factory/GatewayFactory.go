// Code generated — DO NOT EDIT.

package gateway_factory

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"reflect"
	"strings"

	ethereum "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/event"
	"github.com/ethereum/go-ethereum/rpc"
	"google.golang.org/protobuf/types/known/emptypb"

	pb2 "github.com/smartcontractkit/chainlink-protos/cre/go/sdk"
	"github.com/smartcontractkit/chainlink-protos/cre/go/values/pb"
	"github.com/smartcontractkit/cre-sdk-go/capabilities/blockchain/evm"
	"github.com/smartcontractkit/cre-sdk-go/capabilities/blockchain/evm/bindings"
	"github.com/smartcontractkit/cre-sdk-go/cre"
)

var (
	_ = bytes.Equal
	_ = errors.New
	_ = fmt.Sprintf
	_ = big.NewInt
	_ = strings.NewReader
	_ = ethereum.NotFound
	_ = bind.Bind
	_ = common.Big1
	_ = types.BloomLookup
	_ = event.NewSubscription
	_ = abi.ConvertType
	_ = emptypb.Empty{}
	_ = pb.NewBigIntFromInt
	_ = pb2.AggregationType_AGGREGATION_TYPE_COMMON_PREFIX
	_ = bindings.FilterOptions{}
	_ = evm.FilterLogTriggerRequest{}
	_ = cre.ResponseBufferTooSmall
	_ = rpc.API{}
	_ = json.Unmarshal
	_ = reflect.Bool
)

var GatewayFactoryMetaData = &bind.MetaData{
	ABI: "[{\"type\":\"constructor\",\"inputs\":[{\"name\":\"registry_\",\"type\":\"address\",\"internalType\":\"contractIAttestationRegistry\"},{\"name\":\"forwarder_\",\"type\":\"address\",\"internalType\":\"address\"},{\"name\":\"workflowOwner_\",\"type\":\"address\",\"internalType\":\"address\"},{\"name\":\"workflowName_\",\"type\":\"bytes10\",\"internalType\":\"bytes10\"}],\"stateMutability\":\"nonpayable\"},{\"type\":\"function\",\"name\":\"deploy\",\"inputs\":[{\"name\":\"merchConfig\",\"type\":\"tuple\",\"internalType\":\"structMerchantConfig\",\"components\":[{\"name\":\"merchant\",\"type\":\"address\",\"internalType\":\"address\"},{\"name\":\"payoutTo\",\"type\":\"address\",\"internalType\":\"address\"},{\"name\":\"token\",\"type\":\"address\",\"internalType\":\"contractIERC20\"},{\"name\":\"policy\",\"type\":\"tuple\",\"internalType\":\"structPolicy\",\"components\":[{\"name\":\"levelBelow\",\"type\":\"uint8\",\"internalType\":\"uint8\"},{\"name\":\"levelAbove\",\"type\":\"uint8\",\"internalType\":\"uint8\"},{\"name\":\"threshold\",\"type\":\"uint256\",\"internalType\":\"uint256\"},{\"name\":\"maxRisk\",\"type\":\"uint8\",\"internalType\":\"uint8\"}]}]}],\"outputs\":[{\"name\":\"gate\",\"type\":\"address\",\"internalType\":\"address\"}],\"stateMutability\":\"nonpayable\"},{\"type\":\"function\",\"name\":\"emitPaymentOpened\",\"inputs\":[{\"name\":\"id\",\"type\":\"bytes32\",\"internalType\":\"bytes32\"},{\"name\":\"payer\",\"type\":\"address\",\"internalType\":\"address\"},{\"name\":\"amount\",\"type\":\"uint256\",\"internalType\":\"uint256\"}],\"outputs\":[],\"stateMutability\":\"nonpayable\"},{\"type\":\"function\",\"name\":\"forwarder\",\"inputs\":[],\"outputs\":[{\"name\":\"\",\"type\":\"address\",\"internalType\":\"address\"}],\"stateMutability\":\"view\"},{\"type\":\"function\",\"name\":\"registry\",\"inputs\":[],\"outputs\":[{\"name\":\"\",\"type\":\"address\",\"internalType\":\"contractIAttestationRegistry\"}],\"stateMutability\":\"view\"},{\"type\":\"function\",\"name\":\"workflowName\",\"inputs\":[],\"outputs\":[{\"name\":\"\",\"type\":\"bytes10\",\"internalType\":\"bytes10\"}],\"stateMutability\":\"view\"},{\"type\":\"function\",\"name\":\"workflowOwner\",\"inputs\":[],\"outputs\":[{\"name\":\"\",\"type\":\"address\",\"internalType\":\"address\"}],\"stateMutability\":\"view\"},{\"type\":\"event\",\"name\":\"GatewayDeployed\",\"inputs\":[{\"name\":\"gate\",\"type\":\"address\",\"indexed\":true,\"internalType\":\"address\"}],\"anonymous\":false},{\"type\":\"event\",\"name\":\"PaymentOpened\",\"inputs\":[{\"name\":\"gate\",\"type\":\"address\",\"indexed\":true,\"internalType\":\"address\"},{\"name\":\"id\",\"type\":\"bytes32\",\"indexed\":true,\"internalType\":\"bytes32\"},{\"name\":\"payer\",\"type\":\"address\",\"indexed\":false,\"internalType\":\"address\"},{\"name\":\"amount\",\"type\":\"uint256\",\"indexed\":false,\"internalType\":\"uint256\"}],\"anonymous\":false}]",
}

// Structs
type MerchantConfig struct {
	Merchant common.Address
	PayoutTo common.Address
	Token    common.Address
	Policy   Policy
}

type Policy struct {
	LevelBelow uint8
	LevelAbove uint8
	Threshold  *big.Int
	MaxRisk    uint8
}

// Contract Method Inputs
type DeployInput struct {
	MerchConfig MerchantConfig
}

type EmitPaymentOpenedInput struct {
	Id     [32]byte
	Payer  common.Address
	Amount *big.Int
}

// Contract Method Outputs

// Errors

// Events
// The <Event>Topics struct should be used as a filter (for log triggers).
// Note: It is only possible to filter on indexed fields.
// Indexed (string and bytes) fields will be of type common.Hash.
// They need to he (crypto.Keccak256) hashed and passed in.
// Indexed (tuple/slice/array) fields can be passed in as is, the Encode<Event>Topics function will handle the hashing.
//
// The <Event>Decoded struct will be the result of calling decode (Adapt) on the log trigger result.
// Indexed dynamic type fields will be of type common.Hash.

type GatewayDeployedTopics struct {
	Gate common.Address
}

type GatewayDeployedDecoded struct {
	Gate common.Address
}

type PaymentOpenedTopics struct {
	Gate common.Address
	Id   [32]byte
}

type PaymentOpenedDecoded struct {
	Gate   common.Address
	Id     [32]byte
	Payer  common.Address
	Amount *big.Int
}

// Main Binding Type for GatewayFactory
type GatewayFactory struct {
	Address common.Address
	Options *bindings.ContractInitOptions
	ABI     *abi.ABI
	client  *evm.Client
	Codec   GatewayFactoryCodec
}

type GatewayFactoryCodec interface {
	EncodeDeployMethodCall(in DeployInput) ([]byte, error)
	DecodeDeployMethodOutput(data []byte) (common.Address, error)
	EncodeEmitPaymentOpenedMethodCall(in EmitPaymentOpenedInput) ([]byte, error)
	EncodeForwarderMethodCall() ([]byte, error)
	DecodeForwarderMethodOutput(data []byte) (common.Address, error)
	EncodeRegistryMethodCall() ([]byte, error)
	DecodeRegistryMethodOutput(data []byte) (common.Address, error)
	EncodeWorkflowNameMethodCall() ([]byte, error)
	DecodeWorkflowNameMethodOutput(data []byte) ([10]byte, error)
	EncodeWorkflowOwnerMethodCall() ([]byte, error)
	DecodeWorkflowOwnerMethodOutput(data []byte) (common.Address, error)
	EncodeMerchantConfigStruct(in MerchantConfig) ([]byte, error)
	EncodePolicyStruct(in Policy) ([]byte, error)
	GatewayDeployedLogHash() []byte
	EncodeGatewayDeployedTopics(evt abi.Event, values []GatewayDeployedTopics) ([]*evm.TopicValues, error)
	DecodeGatewayDeployed(log *evm.Log) (*GatewayDeployedDecoded, error)
	PaymentOpenedLogHash() []byte
	EncodePaymentOpenedTopics(evt abi.Event, values []PaymentOpenedTopics) ([]*evm.TopicValues, error)
	DecodePaymentOpened(log *evm.Log) (*PaymentOpenedDecoded, error)
}

func NewGatewayFactory(
	client *evm.Client,
	address common.Address,
	options *bindings.ContractInitOptions,
) (*GatewayFactory, error) {
	parsed, err := abi.JSON(strings.NewReader(GatewayFactoryMetaData.ABI))
	if err != nil {
		return nil, err
	}
	codec, err := NewCodec()
	if err != nil {
		return nil, err
	}
	return &GatewayFactory{
		Address: address,
		Options: options,
		ABI:     &parsed,
		client:  client,
		Codec:   codec,
	}, nil
}

type Codec struct {
	abi *abi.ABI
}

func NewCodec() (GatewayFactoryCodec, error) {
	parsed, err := abi.JSON(strings.NewReader(GatewayFactoryMetaData.ABI))
	if err != nil {
		return nil, err
	}
	return &Codec{abi: &parsed}, nil
}

func (c *Codec) EncodeDeployMethodCall(in DeployInput) ([]byte, error) {
	return c.abi.Pack("deploy", in.MerchConfig)
}

func (c *Codec) DecodeDeployMethodOutput(data []byte) (common.Address, error) {
	vals, err := c.abi.Methods["deploy"].Outputs.Unpack(data)
	if err != nil {
		return *new(common.Address), err
	}
	jsonData, err := json.Marshal(vals[0])
	if err != nil {
		return *new(common.Address), fmt.Errorf("failed to marshal ABI result: %w", err)
	}

	var result common.Address
	if err := json.Unmarshal(jsonData, &result); err != nil {
		return *new(common.Address), fmt.Errorf("failed to unmarshal to common.Address: %w", err)
	}

	return result, nil
}

func (c *Codec) EncodeEmitPaymentOpenedMethodCall(in EmitPaymentOpenedInput) ([]byte, error) {
	return c.abi.Pack("emitPaymentOpened", in.Id, in.Payer, in.Amount)
}

func (c *Codec) EncodeForwarderMethodCall() ([]byte, error) {
	return c.abi.Pack("forwarder")
}

func (c *Codec) DecodeForwarderMethodOutput(data []byte) (common.Address, error) {
	vals, err := c.abi.Methods["forwarder"].Outputs.Unpack(data)
	if err != nil {
		return *new(common.Address), err
	}
	jsonData, err := json.Marshal(vals[0])
	if err != nil {
		return *new(common.Address), fmt.Errorf("failed to marshal ABI result: %w", err)
	}

	var result common.Address
	if err := json.Unmarshal(jsonData, &result); err != nil {
		return *new(common.Address), fmt.Errorf("failed to unmarshal to common.Address: %w", err)
	}

	return result, nil
}

func (c *Codec) EncodeRegistryMethodCall() ([]byte, error) {
	return c.abi.Pack("registry")
}

func (c *Codec) DecodeRegistryMethodOutput(data []byte) (common.Address, error) {
	vals, err := c.abi.Methods["registry"].Outputs.Unpack(data)
	if err != nil {
		return *new(common.Address), err
	}
	jsonData, err := json.Marshal(vals[0])
	if err != nil {
		return *new(common.Address), fmt.Errorf("failed to marshal ABI result: %w", err)
	}

	var result common.Address
	if err := json.Unmarshal(jsonData, &result); err != nil {
		return *new(common.Address), fmt.Errorf("failed to unmarshal to common.Address: %w", err)
	}

	return result, nil
}

func (c *Codec) EncodeWorkflowNameMethodCall() ([]byte, error) {
	return c.abi.Pack("workflowName")
}

func (c *Codec) DecodeWorkflowNameMethodOutput(data []byte) ([10]byte, error) {
	vals, err := c.abi.Methods["workflowName"].Outputs.Unpack(data)
	if err != nil {
		return *new([10]byte), err
	}
	jsonData, err := json.Marshal(vals[0])
	if err != nil {
		return *new([10]byte), fmt.Errorf("failed to marshal ABI result: %w", err)
	}

	var result [10]byte
	if err := json.Unmarshal(jsonData, &result); err != nil {
		return *new([10]byte), fmt.Errorf("failed to unmarshal to [10]byte: %w", err)
	}

	return result, nil
}

func (c *Codec) EncodeWorkflowOwnerMethodCall() ([]byte, error) {
	return c.abi.Pack("workflowOwner")
}

func (c *Codec) DecodeWorkflowOwnerMethodOutput(data []byte) (common.Address, error) {
	vals, err := c.abi.Methods["workflowOwner"].Outputs.Unpack(data)
	if err != nil {
		return *new(common.Address), err
	}
	jsonData, err := json.Marshal(vals[0])
	if err != nil {
		return *new(common.Address), fmt.Errorf("failed to marshal ABI result: %w", err)
	}

	var result common.Address
	if err := json.Unmarshal(jsonData, &result); err != nil {
		return *new(common.Address), fmt.Errorf("failed to unmarshal to common.Address: %w", err)
	}

	return result, nil
}

func (c *Codec) EncodeMerchantConfigStruct(in MerchantConfig) ([]byte, error) {
	tupleType, err := abi.NewType(
		"tuple", "",
		[]abi.ArgumentMarshaling{
			{Name: "merchant", Type: "address"},
			{Name: "payoutTo", Type: "address"},
			{Name: "token", Type: "address"},
			{Name: "policy", Type: "(uint8,uint8,uint256,uint8)"},
		},
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create tuple type for MerchantConfig: %w", err)
	}
	args := abi.Arguments{
		{Name: "merchantConfig", Type: tupleType},
	}

	return args.Pack(in)
}
func (c *Codec) EncodePolicyStruct(in Policy) ([]byte, error) {
	tupleType, err := abi.NewType(
		"tuple", "",
		[]abi.ArgumentMarshaling{
			{Name: "levelBelow", Type: "uint8"},
			{Name: "levelAbove", Type: "uint8"},
			{Name: "threshold", Type: "uint256"},
			{Name: "maxRisk", Type: "uint8"},
		},
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create tuple type for Policy: %w", err)
	}
	args := abi.Arguments{
		{Name: "policy", Type: tupleType},
	}

	return args.Pack(in)
}

func (c *Codec) GatewayDeployedLogHash() []byte {
	return c.abi.Events["GatewayDeployed"].ID.Bytes()
}

func (c *Codec) EncodeGatewayDeployedTopics(
	evt abi.Event,
	values []GatewayDeployedTopics,
) ([]*evm.TopicValues, error) {
	var gateRule []interface{}
	for _, v := range values {
		if reflect.ValueOf(v.Gate).IsZero() {
			gateRule = append(gateRule, common.Hash{})
			continue
		}
		fieldVal, err := bindings.PrepareTopicArg(evt.Inputs[0], v.Gate)
		if err != nil {
			return nil, err
		}
		gateRule = append(gateRule, fieldVal)
	}

	rawTopics, err := abi.MakeTopics(
		gateRule,
	)
	if err != nil {
		return nil, err
	}

	return bindings.PrepareTopics(rawTopics, evt.ID.Bytes()), nil
}

// DecodeGatewayDeployed decodes a log into a GatewayDeployed struct.
func (c *Codec) DecodeGatewayDeployed(log *evm.Log) (*GatewayDeployedDecoded, error) {
	event := new(GatewayDeployedDecoded)
	if err := c.abi.UnpackIntoInterface(event, "GatewayDeployed", log.Data); err != nil {
		return nil, err
	}
	var indexed abi.Arguments
	for _, arg := range c.abi.Events["GatewayDeployed"].Inputs {
		if arg.Indexed {
			if arg.Type.T == abi.TupleTy {
				// abigen throws on tuple, so converting to bytes to
				// receive back the common.Hash as is instead of error
				arg.Type.T = abi.BytesTy
			}
			indexed = append(indexed, arg)
		}
	}
	// Convert [][]byte → []common.Hash
	topics := make([]common.Hash, len(log.Topics))
	for i, t := range log.Topics {
		topics[i] = common.BytesToHash(t)
	}

	if err := abi.ParseTopics(event, indexed, topics[1:]); err != nil {
		return nil, err
	}
	return event, nil
}

func (c *Codec) PaymentOpenedLogHash() []byte {
	return c.abi.Events["PaymentOpened"].ID.Bytes()
}

func (c *Codec) EncodePaymentOpenedTopics(
	evt abi.Event,
	values []PaymentOpenedTopics,
) ([]*evm.TopicValues, error) {
	var gateRule []interface{}
	for _, v := range values {
		if reflect.ValueOf(v.Gate).IsZero() {
			gateRule = append(gateRule, common.Hash{})
			continue
		}
		fieldVal, err := bindings.PrepareTopicArg(evt.Inputs[0], v.Gate)
		if err != nil {
			return nil, err
		}
		gateRule = append(gateRule, fieldVal)
	}
	var idRule []interface{}
	for _, v := range values {
		if reflect.ValueOf(v.Id).IsZero() {
			idRule = append(idRule, common.Hash{})
			continue
		}
		fieldVal, err := bindings.PrepareTopicArg(evt.Inputs[1], v.Id)
		if err != nil {
			return nil, err
		}
		idRule = append(idRule, fieldVal)
	}

	rawTopics, err := abi.MakeTopics(
		gateRule,
		idRule,
	)
	if err != nil {
		return nil, err
	}

	return bindings.PrepareTopics(rawTopics, evt.ID.Bytes()), nil
}

// DecodePaymentOpened decodes a log into a PaymentOpened struct.
func (c *Codec) DecodePaymentOpened(log *evm.Log) (*PaymentOpenedDecoded, error) {
	event := new(PaymentOpenedDecoded)
	if err := c.abi.UnpackIntoInterface(event, "PaymentOpened", log.Data); err != nil {
		return nil, err
	}
	var indexed abi.Arguments
	for _, arg := range c.abi.Events["PaymentOpened"].Inputs {
		if arg.Indexed {
			if arg.Type.T == abi.TupleTy {
				// abigen throws on tuple, so converting to bytes to
				// receive back the common.Hash as is instead of error
				arg.Type.T = abi.BytesTy
			}
			indexed = append(indexed, arg)
		}
	}
	// Convert [][]byte → []common.Hash
	topics := make([]common.Hash, len(log.Topics))
	for i, t := range log.Topics {
		topics[i] = common.BytesToHash(t)
	}

	if err := abi.ParseTopics(event, indexed, topics[1:]); err != nil {
		return nil, err
	}
	return event, nil
}

func (c GatewayFactory) Forwarder(
	runtime cre.Runtime,
	blockNumber *big.Int,
) cre.Promise[common.Address] {
	calldata, err := c.Codec.EncodeForwarderMethodCall()
	if err != nil {
		return cre.PromiseFromResult[common.Address](*new(common.Address), err)
	}

	bn := bindings.FinalizedBlockNumber
	if blockNumber != nil {
		bn = pb.NewBigIntFromInt(blockNumber)
	}

	promise := cre.ThenPromise(cre.PromiseFromResult(bn, nil), func(bn *pb.BigInt) cre.Promise[*evm.CallContractReply] {
		return c.client.CallContract(runtime, &evm.CallContractRequest{
			Call:        &evm.CallMsg{To: c.Address.Bytes(), Data: calldata},
			BlockNumber: bn,
		})
	})
	return cre.Then(promise, func(response *evm.CallContractReply) (common.Address, error) {
		return c.Codec.DecodeForwarderMethodOutput(response.Data)
	})

}

func (c GatewayFactory) Registry(
	runtime cre.Runtime,
	blockNumber *big.Int,
) cre.Promise[common.Address] {
	calldata, err := c.Codec.EncodeRegistryMethodCall()
	if err != nil {
		return cre.PromiseFromResult[common.Address](*new(common.Address), err)
	}

	bn := bindings.FinalizedBlockNumber
	if blockNumber != nil {
		bn = pb.NewBigIntFromInt(blockNumber)
	}

	promise := cre.ThenPromise(cre.PromiseFromResult(bn, nil), func(bn *pb.BigInt) cre.Promise[*evm.CallContractReply] {
		return c.client.CallContract(runtime, &evm.CallContractRequest{
			Call:        &evm.CallMsg{To: c.Address.Bytes(), Data: calldata},
			BlockNumber: bn,
		})
	})
	return cre.Then(promise, func(response *evm.CallContractReply) (common.Address, error) {
		return c.Codec.DecodeRegistryMethodOutput(response.Data)
	})

}

func (c GatewayFactory) WorkflowName(
	runtime cre.Runtime,
	blockNumber *big.Int,
) cre.Promise[[10]byte] {
	calldata, err := c.Codec.EncodeWorkflowNameMethodCall()
	if err != nil {
		return cre.PromiseFromResult[[10]byte](*new([10]byte), err)
	}

	bn := bindings.FinalizedBlockNumber
	if blockNumber != nil {
		bn = pb.NewBigIntFromInt(blockNumber)
	}

	promise := cre.ThenPromise(cre.PromiseFromResult(bn, nil), func(bn *pb.BigInt) cre.Promise[*evm.CallContractReply] {
		return c.client.CallContract(runtime, &evm.CallContractRequest{
			Call:        &evm.CallMsg{To: c.Address.Bytes(), Data: calldata},
			BlockNumber: bn,
		})
	})
	return cre.Then(promise, func(response *evm.CallContractReply) ([10]byte, error) {
		return c.Codec.DecodeWorkflowNameMethodOutput(response.Data)
	})

}

func (c GatewayFactory) WorkflowOwner(
	runtime cre.Runtime,
	blockNumber *big.Int,
) cre.Promise[common.Address] {
	calldata, err := c.Codec.EncodeWorkflowOwnerMethodCall()
	if err != nil {
		return cre.PromiseFromResult[common.Address](*new(common.Address), err)
	}

	bn := bindings.FinalizedBlockNumber
	if blockNumber != nil {
		bn = pb.NewBigIntFromInt(blockNumber)
	}

	promise := cre.ThenPromise(cre.PromiseFromResult(bn, nil), func(bn *pb.BigInt) cre.Promise[*evm.CallContractReply] {
		return c.client.CallContract(runtime, &evm.CallContractRequest{
			Call:        &evm.CallMsg{To: c.Address.Bytes(), Data: calldata},
			BlockNumber: bn,
		})
	})
	return cre.Then(promise, func(response *evm.CallContractReply) (common.Address, error) {
		return c.Codec.DecodeWorkflowOwnerMethodOutput(response.Data)
	})

}

func (c GatewayFactory) WriteReportFromMerchantConfig(
	runtime cre.Runtime,
	input MerchantConfig,
	gasConfig *evm.GasConfig,
) cre.Promise[*evm.WriteReportReply] {
	encoded, err := c.Codec.EncodeMerchantConfigStruct(input)
	if err != nil {
		return cre.PromiseFromResult[*evm.WriteReportReply](nil, err)
	}
	promise := runtime.GenerateReport(&pb2.ReportRequest{
		EncodedPayload: encoded,
		EncoderName:    "evm",
		SigningAlgo:    "ecdsa",
		HashingAlgo:    "keccak256",
	})

	return cre.ThenPromise(promise, func(report *cre.Report) cre.Promise[*evm.WriteReportReply] {
		return c.client.WriteReport(runtime, &evm.WriteCreReportRequest{
			Receiver:  c.Address.Bytes(),
			Report:    report,
			GasConfig: gasConfig,
		})
	})
}

func (c GatewayFactory) WriteReportFromPolicy(
	runtime cre.Runtime,
	input Policy,
	gasConfig *evm.GasConfig,
) cre.Promise[*evm.WriteReportReply] {
	encoded, err := c.Codec.EncodePolicyStruct(input)
	if err != nil {
		return cre.PromiseFromResult[*evm.WriteReportReply](nil, err)
	}
	promise := runtime.GenerateReport(&pb2.ReportRequest{
		EncodedPayload: encoded,
		EncoderName:    "evm",
		SigningAlgo:    "ecdsa",
		HashingAlgo:    "keccak256",
	})

	return cre.ThenPromise(promise, func(report *cre.Report) cre.Promise[*evm.WriteReportReply] {
		return c.client.WriteReport(runtime, &evm.WriteCreReportRequest{
			Receiver:  c.Address.Bytes(),
			Report:    report,
			GasConfig: gasConfig,
		})
	})
}

func (c GatewayFactory) WriteReport(
	runtime cre.Runtime,
	report *cre.Report,
	gasConfig *evm.GasConfig,
) cre.Promise[*evm.WriteReportReply] {
	return c.client.WriteReport(runtime, &evm.WriteCreReportRequest{
		Receiver:  c.Address.Bytes(),
		Report:    report,
		GasConfig: gasConfig,
	})
}

func (c *GatewayFactory) UnpackError(data []byte) (any, error) {
	switch common.Bytes2Hex(data[:4]) {
	default:
		return nil, errors.New("unknown error selector")
	}
}

// GatewayDeployedTrigger wraps the raw log trigger and provides decoded GatewayDeployedDecoded data
type GatewayDeployedTrigger struct {
	cre.Trigger[*evm.Log, *evm.Log]                 // Embed the raw trigger
	contract                        *GatewayFactory // Keep reference for decoding
}

// Adapt method that decodes the log into GatewayDeployed data
func (t *GatewayDeployedTrigger) Adapt(l *evm.Log) (*bindings.DecodedLog[GatewayDeployedDecoded], error) {
	// Decode the log using the contract's codec
	decoded, err := t.contract.Codec.DecodeGatewayDeployed(l)
	if err != nil {
		return nil, fmt.Errorf("failed to decode GatewayDeployed log: %w", err)
	}

	return &bindings.DecodedLog[GatewayDeployedDecoded]{
		Log:  l,        // Original log
		Data: *decoded, // Decoded data
	}, nil
}

func (c *GatewayFactory) LogTriggerGatewayDeployedLog(chainSelector uint64, confidence evm.ConfidenceLevel, filters []GatewayDeployedTopics) (cre.Trigger[*evm.Log, *bindings.DecodedLog[GatewayDeployedDecoded]], error) {
	event := c.ABI.Events["GatewayDeployed"]
	topics, err := c.Codec.EncodeGatewayDeployedTopics(event, filters)
	if err != nil {
		return nil, fmt.Errorf("failed to encode topics for GatewayDeployed: %w", err)
	}

	rawTrigger := evm.LogTrigger(chainSelector, &evm.FilterLogTriggerRequest{
		Addresses:  [][]byte{c.Address.Bytes()},
		Topics:     topics,
		Confidence: confidence,
	})

	return &GatewayDeployedTrigger{
		Trigger:  rawTrigger,
		contract: c,
	}, nil
}

func (c *GatewayFactory) FilterLogsGatewayDeployed(runtime cre.Runtime, options *bindings.FilterOptions) (cre.Promise[*evm.FilterLogsReply], error) {
	if options == nil {
		return nil, errors.New("FilterLogs options are required.")
	}
	return c.client.FilterLogs(runtime, &evm.FilterLogsRequest{
		FilterQuery: &evm.FilterQuery{
			Addresses: [][]byte{c.Address.Bytes()},
			Topics: []*evm.Topics{
				{Topic: [][]byte{c.Codec.GatewayDeployedLogHash()}},
			},
			BlockHash: options.BlockHash,
			FromBlock: pb.NewBigIntFromInt(options.FromBlock),
			ToBlock:   pb.NewBigIntFromInt(options.ToBlock),
		},
	}), nil
}

// PaymentOpenedTrigger wraps the raw log trigger and provides decoded PaymentOpenedDecoded data
type PaymentOpenedTrigger struct {
	cre.Trigger[*evm.Log, *evm.Log]                 // Embed the raw trigger
	contract                        *GatewayFactory // Keep reference for decoding
}

// Adapt method that decodes the log into PaymentOpened data
func (t *PaymentOpenedTrigger) Adapt(l *evm.Log) (*bindings.DecodedLog[PaymentOpenedDecoded], error) {
	// Decode the log using the contract's codec
	decoded, err := t.contract.Codec.DecodePaymentOpened(l)
	if err != nil {
		return nil, fmt.Errorf("failed to decode PaymentOpened log: %w", err)
	}

	return &bindings.DecodedLog[PaymentOpenedDecoded]{
		Log:  l,        // Original log
		Data: *decoded, // Decoded data
	}, nil
}

func (c *GatewayFactory) LogTriggerPaymentOpenedLog(chainSelector uint64, confidence evm.ConfidenceLevel, filters []PaymentOpenedTopics) (cre.Trigger[*evm.Log, *bindings.DecodedLog[PaymentOpenedDecoded]], error) {
	event := c.ABI.Events["PaymentOpened"]
	topics, err := c.Codec.EncodePaymentOpenedTopics(event, filters)
	if err != nil {
		return nil, fmt.Errorf("failed to encode topics for PaymentOpened: %w", err)
	}

	rawTrigger := evm.LogTrigger(chainSelector, &evm.FilterLogTriggerRequest{
		Addresses:  [][]byte{c.Address.Bytes()},
		Topics:     topics,
		Confidence: confidence,
	})

	return &PaymentOpenedTrigger{
		Trigger:  rawTrigger,
		contract: c,
	}, nil
}

func (c *GatewayFactory) FilterLogsPaymentOpened(runtime cre.Runtime, options *bindings.FilterOptions) (cre.Promise[*evm.FilterLogsReply], error) {
	if options == nil {
		return nil, errors.New("FilterLogs options are required.")
	}
	return c.client.FilterLogs(runtime, &evm.FilterLogsRequest{
		FilterQuery: &evm.FilterQuery{
			Addresses: [][]byte{c.Address.Bytes()},
			Topics: []*evm.Topics{
				{Topic: [][]byte{c.Codec.PaymentOpenedLogHash()}},
			},
			BlockHash: options.BlockHash,
			FromBlock: pb.NewBigIntFromInt(options.FromBlock),
			ToBlock:   pb.NewBigIntFromInt(options.ToBlock),
		},
	}), nil
}
