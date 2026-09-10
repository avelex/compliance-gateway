package chain

import (
	"github.com/ethereum/go-ethereum/accounts/abi"
	pb2 "github.com/smartcontractkit/chainlink-protos/cre/go/sdk"

	"attestor-workflow/contracts/evm/src/generated/attestation_registry"
	"attestor-workflow/contracts/evm/src/generated/merchant_gateway"
	"attestor-workflow/internal/domain"

	"github.com/smartcontractkit/cre-sdk-go/capabilities/blockchain/evm"
	"github.com/smartcontractkit/cre-sdk-go/cre"
)

type ChainReporter interface {
	ReportAttestations(runtime cre.Runtime, heartbeat uint64, batch []domain.Entry, gasConfig *evm.GasConfig) cre.Promise[*evm.WriteReportReply]
	ReportSettlement(runtime cre.Runtime, id [32]byte, ok bool, gasConfig *evm.GasConfig) cre.Promise[*evm.WriteReportReply]
}

var attestationComponents = []abi.ArgumentMarshaling{
	{Name: "nullifier", Type: "bytes32"},
	{Name: "level", Type: "uint8"},
	{Name: "expiry", Type: "uint64"},
}

var entryComponents = []abi.ArgumentMarshaling{
	{Name: "kind", Type: "uint8"},
	{Name: "gate", Type: "address"},
	{Name: "wallet", Type: "address"},
	{Name: "att", Type: "tuple", Components: attestationComponents},
	{Name: "nullifier", Type: "bytes32"},
}

func attestationReportArgs() (abi.Arguments, error) {
	heartbeatType, err := abi.NewType("uint64", "", nil)
	if err != nil {
		return nil, err
	}
	entriesType, err := abi.NewType("tuple[]", "", entryComponents)
	if err != nil {
		return nil, err
	}
	return abi.Arguments{{Type: heartbeatType}, {Type: entriesType}}, nil
}

func settlementReportArgs() (abi.Arguments, error) {
	idType, err := abi.NewType("bytes32", "", nil)
	if err != nil {
		return nil, err
	}
	okType, err := abi.NewType("bool", "", nil)
	if err != nil {
		return nil, err
	}
	return abi.Arguments{{Type: idType}, {Type: okType}}, nil
}

var _ ChainReporter = (*Writer)(nil)

type Writer struct {
	registry   *attestation_registry.AttestationRegistry
	merchantGW *merchant_gateway.MerchantGateway
}

func NewWriter(registry *attestation_registry.AttestationRegistry, gateway *merchant_gateway.MerchantGateway) *Writer {
	return &Writer{registry: registry, merchantGW: gateway}
}

func (w *Writer) ReportAttestations(runtime cre.Runtime, heartbeat uint64, batch []domain.Entry, gasConfig *evm.GasConfig) cre.Promise[*evm.WriteReportReply] {
	args, err := attestationReportArgs()
	if err != nil {
		return cre.PromiseFromResult[*evm.WriteReportReply](nil, err)
	}
	encoded, err := args.Pack(heartbeat, batch)
	if err != nil {
		return cre.PromiseFromResult[*evm.WriteReportReply](nil, err)
	}
	return w.generateAndWrite(runtime, encoded, gasConfig, w.registry.WriteReport)
}

func (w *Writer) ReportSettlement(runtime cre.Runtime, id [32]byte, ok bool, gasConfig *evm.GasConfig) cre.Promise[*evm.WriteReportReply] {
	args, err := settlementReportArgs()
	if err != nil {
		return cre.PromiseFromResult[*evm.WriteReportReply](nil, err)
	}
	encoded, err := args.Pack(id, ok)
	if err != nil {
		return cre.PromiseFromResult[*evm.WriteReportReply](nil, err)
	}
	return w.generateAndWrite(runtime, encoded, gasConfig, w.merchantGW.WriteReport)
}

func (w *Writer) generateAndWrite(
	runtime cre.Runtime,
	encoded []byte,
	gasConfig *evm.GasConfig,
	write func(cre.Runtime, *cre.Report, *evm.GasConfig) cre.Promise[*evm.WriteReportReply],
) cre.Promise[*evm.WriteReportReply] {
	promise := runtime.GenerateReport(&pb2.ReportRequest{
		EncodedPayload: encoded,
		EncoderName:    "evm",
		SigningAlgo:    "ecdsa",
		HashingAlgo:    "keccak256",
	})
	return cre.ThenPromise(promise, func(report *cre.Report) cre.Promise[*evm.WriteReportReply] {
		return write(runtime, report, gasConfig)
	})
}
