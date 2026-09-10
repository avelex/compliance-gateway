//go:build !wasip1

package main

import (
	"context"
	"encoding/json"
	"math/big"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/smartcontractkit/chainlink-protos/cre/go/values/pb"
	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/cre-sdk-go/capabilities/blockchain/evm"
	"github.com/smartcontractkit/cre-sdk-go/capabilities/blockchain/evm/bindings"
	evmmock "github.com/smartcontractkit/cre-sdk-go/capabilities/blockchain/evm/mock"
	crehttp "github.com/smartcontractkit/cre-sdk-go/capabilities/networking/http"
	httpmock "github.com/smartcontractkit/cre-sdk-go/capabilities/networking/http/mock"
	"github.com/smartcontractkit/cre-sdk-go/cre"
	"github.com/smartcontractkit/cre-sdk-go/cre/testutils"

	"attestor-workflow/contracts/evm/src/generated/attestation_registry"
	"attestor-workflow/contracts/evm/src/generated/gateway_factory"
	"attestor-workflow/contracts/evm/src/generated/merchant_gateway"
)

// stubPaymentsRead makes evmMock.CallContract answer the `payments(bytes32)`
// getter directly, encoded by hand. merchant_gateway.NewMerchantGatewayMock
// can't be used here: internally it overwrites evmMock.WriteReport with a
// hardcoded nil callback for the same contract address, which deadlocks the
// settlement write this test also needs to observe.
func stubPaymentsRead(t *testing.T, evmMock *evmmock.ClientCapability, maxRisk uint8) {
	t.Helper()
	gatewayABI, err := abi.JSON(strings.NewReader(merchant_gateway.MerchantGatewayMetaData.ABI))
	require.NoError(t, err)

	evmMock.CallContract = func(_ context.Context, _ *evm.CallContractRequest) (*evm.CallContractReply, error) {
		packed, err := gatewayABI.Methods["payments"].Outputs.Pack(
			common.HexToAddress("0x0000000000000000000000000000000000000007"),
			uint64(0), maxRisk, uint8(1), big.NewInt(1000),
		)
		if err != nil {
			return nil, err
		}
		return &evm.CallContractReply{Data: packed}, nil
	}
}

func testConfig() *Config {
	return &Config{
		ChainName:                "ethereum-testnet-sepolia-base-1",
		RegistryAddress:          "0x0000000000000000000000000000000000000001",
		FactoryAddress:           "0x0000000000000000000000000000000000000002",
		GasLimit:                 1000000,
		Schedule:                 "0 */1 * * * *",
		QueueBaseURL:             "https://relay.test",
		SumsubBaseURL:            "https://api.sumsub.test",
		SumsubAppTokenID:         "SUMSUB_APP_TOKEN",
		SumsubSecretID:           "SUMSUB_SECRET_KEY",
		SessionIdSecretID:        "SESSION_ID_SECRET",
		RelayFetchTokenID:        "RELAY_FETCH_TOKEN",
		EnclaveNullifierSecretID: "ENCLAVE_NULLIFIER_SECRET",
		WorldIDBaseURL:           "https://worldid.test",
		WorldIDAppID:             "app_test",
		AttestationTTL:           3600,
		RevocationSignerKey:      "0x0000000000000000000000000000000000000003",
	}
}

func testSecrets() testutils.Secrets {
	return testutils.Secrets{
		cre.DefaultSecretNamespace: {
			"SUMSUB_APP_TOKEN":         "app-token",
			"SUMSUB_SECRET_KEY":        "secret-key",
			"SESSION_ID_SECRET":        "0000000000000000000000000000000000000000000000000000000000000001",
			"RELAY_FETCH_TOKEN":        "test-fetch-token",
			"ENCLAVE_NULLIFIER_SECRET": "enclave-secret",
		},
	}
}

func newTestEVMMock(t *testing.T, config *Config) *evmmock.ClientCapability {
	t.Helper()
	chainSelector, err := evm.ChainSelectorFromName(config.ChainName)
	require.NoError(t, err)
	evmMock, err := evmmock.NewClientCapability(chainSelector, t)
	require.NoError(t, err)
	return evmMock
}

func TestInitWorkflow(t *testing.T) {
	config := testConfig()
	newTestEVMMock(t, config)

	workflow, err := InitWorkflow(config, nil, nil)
	require.NoError(t, err)
	require.Len(t, workflow, 3)
}

func TestOnVerificationCron(t *testing.T) {
	config := testConfig()
	evmMock := newTestEVMMock(t, config)

	httpMock, err := httpmock.NewClientCapability(t)
	require.NoError(t, err)
	httpMock.SendRequest = func(_ context.Context, req *crehttp.Request) (*crehttp.Response, error) {
		switch {
		case strings.HasPrefix(req.Url, config.QueueBaseURL+"/api/relay/queue"):
			require.Equal(t, []string{"Bearer test-fetch-token"}, req.MultiHeaders["Authorization"].GetValues())
			body, _ := json.Marshal(map[string]any{
				"minute": 1,
				"items": []map[string]any{
					{"gate": "0x0000000000000000000000000000000000000004", "wallet": "0x0000000000000000000000000000000000000005", "level": 2},
				},
			})
			return &crehttp.Response{StatusCode: 200, Body: body}, nil
		default:
			body, _ := json.Marshal(map[string]any{
				"id": "applicant-1",
				"review": map[string]any{
					"reviewStatus": "completed",
					"reviewResult": map[string]any{"reviewAnswer": "GREEN"},
				},
				"info": map[string]any{
					"idDocs": []map[string]any{
						{"country": "USA", "idDocType": "PASSPORT", "number": "X123"},
					},
				},
			})
			return &crehttp.Response{StatusCode: 200, Body: body}, nil
		}
	}

	var wroteReport bool
	evmMock.WriteReport = func(_ context.Context, _ *evm.WriteReportRequest) (*evm.WriteReportReply, error) {
		wroteReport = true
		return &evm.WriteReportReply{TxHash: common.HexToHash("0x1").Bytes()}, nil
	}

	evmClient, err := config.evmClient()
	require.NoError(t, err)
	registry, err := attestation_registry.NewAttestationRegistry(evmClient, common.HexToAddress(config.RegistryAddress), nil)
	require.NoError(t, err)

	runtime := testutils.NewTeeRuntime(t, testSecrets())
	result, err := onVerificationCron(config, runtime, registry)
	require.NoError(t, err)
	require.Contains(t, result, "attested 1")
	require.True(t, wroteReport)
}

func paymentOpenedPayload(gate common.Address) *bindings.DecodedLog[gateway_factory.PaymentOpenedDecoded] {
	return &bindings.DecodedLog[gateway_factory.PaymentOpenedDecoded]{
		Log: &evm.Log{BlockNumber: pb.NewBigIntFromInt(big.NewInt(1))},
		Data: gateway_factory.PaymentOpenedDecoded{
			Gate:   gate,
			Id:     [32]byte{7},
			Payer:  common.HexToAddress("0x0000000000000000000000000000000000000007"),
			Amount: big.NewInt(1000),
		},
	}
}

func TestOnPaymentOpened_SettlesWhenScoreUnderMaxRisk(t *testing.T) {
	config := testConfig()
	evmMock := newTestEVMMock(t, config)

	httpMock, err := httpmock.NewClientCapability(t)
	require.NoError(t, err)
	httpMock.SendRequest = func(_ context.Context, _ *crehttp.Request) (*crehttp.Response, error) {
		body, _ := json.Marshal(map[string]any{"code": 1, "result": map[string]any{"mixer": "1"}}) // score 80
		return &crehttp.Response{StatusCode: 200, Body: body}, nil
	}

	var wroteReport bool
	evmMock.WriteReport = func(_ context.Context, _ *evm.WriteReportRequest) (*evm.WriteReportReply, error) {
		wroteReport = true
		return &evm.WriteReportReply{TxHash: common.HexToHash("0x1").Bytes()}, nil
	}

	evmClient, err := config.evmClient()
	require.NoError(t, err)

	gate := common.HexToAddress("0x0000000000000000000000000000000000000006")
	stubPaymentsRead(t, evmMock, 90)

	runtime := testutils.NewTeeRuntime(t, testSecrets())
	result, err := onPaymentOpened(config, runtime, evmClient, paymentOpenedPayload(gate))
	require.NoError(t, err)
	require.Contains(t, result, "ok=true")
	require.True(t, wroteReport)
}

func TestOnPaymentOpened_RefundsWhenScoreExceedsMaxRisk(t *testing.T) {
	config := testConfig()
	evmMock := newTestEVMMock(t, config)

	httpMock, err := httpmock.NewClientCapability(t)
	require.NoError(t, err)
	httpMock.SendRequest = func(_ context.Context, _ *crehttp.Request) (*crehttp.Response, error) {
		body, _ := json.Marshal(map[string]any{"code": 1, "result": map[string]any{"sanctioned": "1"}}) // score 100
		return &crehttp.Response{StatusCode: 200, Body: body}, nil
	}

	var wroteReport bool
	evmMock.WriteReport = func(_ context.Context, _ *evm.WriteReportRequest) (*evm.WriteReportReply, error) {
		wroteReport = true
		return &evm.WriteReportReply{TxHash: common.HexToHash("0x1").Bytes()}, nil
	}

	evmClient, err := config.evmClient()
	require.NoError(t, err)

	gate := common.HexToAddress("0x0000000000000000000000000000000000000006")
	stubPaymentsRead(t, evmMock, 90)

	runtime := testutils.NewTeeRuntime(t, testSecrets())
	result, err := onPaymentOpened(config, runtime, evmClient, paymentOpenedPayload(gate))
	require.NoError(t, err)
	require.Contains(t, result, "ok=false")
	require.True(t, wroteReport)
}

func TestOnRevocationWebhook(t *testing.T) {
	config := testConfig()
	evmMock := newTestEVMMock(t, config)

	var wroteReport bool
	evmMock.WriteReport = func(_ context.Context, _ *evm.WriteReportRequest) (*evm.WriteReportReply, error) {
		wroteReport = true
		return &evm.WriteReportReply{TxHash: common.HexToHash("0x1").Bytes()}, nil
	}

	evmClient, err := config.evmClient()
	require.NoError(t, err)
	registry, err := attestation_registry.NewAttestationRegistry(evmClient, common.HexToAddress(config.RegistryAddress), nil)
	require.NoError(t, err)

	body, _ := json.Marshal(revocationRequest{Nullifier: "0x00000000000000000000000000000000000000000000000000000000000008"})
	runtime := testutils.NewRuntime(t, testutils.Secrets{})
	result, err := onRevocationWebhook(runtime, registry, config.gasConfig(), &crehttp.Payload{Input: body})
	require.NoError(t, err)
	require.Contains(t, result, "revoked")
	require.True(t, wroteReport)
}
