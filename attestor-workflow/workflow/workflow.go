package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/ethereum/go-ethereum/common"

	"attestor-workflow/contracts/evm/src/generated/attestation_registry"
	"attestor-workflow/contracts/evm/src/generated/gateway_factory"
	"attestor-workflow/contracts/evm/src/generated/merchant_gateway"
	"attestor-workflow/internal/chain"
	"attestor-workflow/internal/creteehttp"
	"attestor-workflow/internal/domain"
	"attestor-workflow/internal/provenance"
	"attestor-workflow/internal/queue"
	"attestor-workflow/internal/sumsubapi"
	"attestor-workflow/internal/verifier"

	"github.com/smartcontractkit/cre-sdk-go/capabilities/blockchain/evm"
	"github.com/smartcontractkit/cre-sdk-go/capabilities/blockchain/evm/bindings"
	creHttp "github.com/smartcontractkit/cre-sdk-go/capabilities/networking/http"
	"github.com/smartcontractkit/cre-sdk-go/capabilities/scheduler/cron"
	"github.com/smartcontractkit/cre-sdk-go/cre"
)

type Config struct {
	ChainName                string `json:"chainName"`
	RegistryAddress          string `json:"registryAddress"`
	FactoryAddress           string `json:"factoryAddress"`
	GasLimit                 uint64 `json:"gasLimit"`
	Schedule                 string `json:"schedule"`
	QueueBaseURL             string `json:"queueBaseUrl"`
	SumsubBaseURL            string `json:"sumsubBaseUrl"`
	SumsubAppTokenID         string `json:"sumsubAppTokenSecretId"`
	SumsubSecretID           string `json:"sumsubSecretKeySecretId"`
	SessionIdSecretID        string `json:"sessionIdSecretId"`
	RelayFetchTokenID        string `json:"relayFetchTokenSecretId"`
	EnclaveNullifierSecretID string `json:"enclaveNullifierSecretId"`
	WorldIDBaseURL           string `json:"worldIdBaseUrl"`
	WorldIDAppID             string `json:"worldIdAppId"`
	AttestationTTL           int64  `json:"attestationTtlSeconds"`
	RevocationSignerKey      string `json:"revocationSignerKey"`
}

func (c *Config) evmClient() (*evm.Client, error) {
	chainSelector, err := evm.ChainSelectorFromName(c.ChainName)
	if err != nil {
		return nil, err
	}
	return &evm.Client{ChainSelector: chainSelector}, nil
}

func (c *Config) gasConfig() *evm.GasConfig {
	return &evm.GasConfig{GasLimit: c.GasLimit}
}

func InitWorkflow(config *Config, _ *slog.Logger, _ cre.SecretsProvider) (cre.Workflow[*Config], error) {
	evmClient, err := config.evmClient()
	if err != nil {
		return nil, fmt.Errorf("evm client: %w", err)
	}

	registry, err := attestation_registry.NewAttestationRegistry(
		evmClient, common.HexToAddress(config.RegistryAddress), nil)
	if err != nil {
		return nil, fmt.Errorf("attestation registry binding: %w", err)
	}

	factory, err := gateway_factory.NewGatewayFactory(evmClient, common.HexToAddress(config.FactoryAddress), nil)
	if err != nil {
		return nil, fmt.Errorf("gateway factory binding: %w", err)
	}

	paymentOpenedTrigger, err := factory.LogTriggerPaymentOpenedLog(
		evmClient.ChainSelector, evm.ConfidenceLevel_CONFIDENCE_LEVEL_LATEST,
		[]gateway_factory.PaymentOpenedTopics{})

	if err != nil {
		return nil, fmt.Errorf("payment opened trigger: %w", err)
	}

	tees := cre.OneOfTees{cre.Nitro{Regions: []cre.NitroRegion{cre.NitroUsWest2}}}

	verifyOnCron := func(config *Config, runtime cre.TeeRuntime, _ *cron.Payload) (string, error) {
		return onVerificationCron(config, runtime, registry)
	}

	settleOnPayment := func(config *Config, runtime cre.TeeRuntime, payload *bindings.DecodedLog[gateway_factory.PaymentOpenedDecoded]) (string, error) {
		return onPaymentOpened(config, runtime, evmClient, payload)
	}

	revoke := func(config *Config, runtime cre.Runtime, payload *creHttp.Payload) (string, error) {
		return onRevocationWebhook(runtime, registry, config.gasConfig(), payload)
	}

	revocationTrigger := creHttp.Trigger(&creHttp.Config{
		AuthorizedKeys: []*creHttp.AuthorizedKey{
			{Type: creHttp.KeyType_KEY_TYPE_ECDSA_EVM, PublicKey: config.RevocationSignerKey},
		},
	})

	return cre.Workflow[*Config]{
		cre.HandlerInTee(paymentOpenedTrigger, settleOnPayment, tees),
		cre.HandlerInTee(
			cron.Trigger(
				&cron.Config{
					Schedule: config.Schedule,
				}),
			verifyOnCron, tees,
		),
		cre.Handler(revocationTrigger, revoke),
	}, nil
}

func onVerificationCron(
	config *Config,
	runtime cre.TeeRuntime,
	registry *attestation_registry.AttestationRegistry,
) (string, error) {
	ctx := context.Background()
	doer := creteehttp.New(runtime)
	donRuntime := runtime.UsingTheDons()

	fetchToken, err := runtime.GetSecret(&cre.SecretRequest{Id: config.RelayFetchTokenID}).Await()
	if err != nil {
		return "", fmt.Errorf("relay fetch token secret: %w", err)
	}
	sessionIdSecret, err := runtime.GetSecret(&cre.SecretRequest{Id: config.SessionIdSecretID}).Await()
	if err != nil {
		return "", fmt.Errorf("session id secret: %w", err)
	}
	enclaveNullifierSecret, err := runtime.GetSecret(&cre.SecretRequest{Id: config.EnclaveNullifierSecretID}).Await()
	if err != nil {
		return "", fmt.Errorf("enclave nullifier secret: %w", err)
	}

	q := queue.NewClient(config.QueueBaseURL, fetchToken.Value, doer)
	minute := time.Now().Unix() / 60
	pending, err := q.Pending(ctx, minute)
	if err != nil {
		return "", fmt.Errorf("pending queue: %w", err)
	}

	sumsubClient, err := newSumsubClient(runtime, config, doer)
	if err != nil {
		return "", fmt.Errorf("sumsub client: %w", err)
	}
	sumsubProvider := &verifier.SumsubProvider{
		Client:        sumsubClient,
		TTL:           attestationTTL(config),
		SessionSecret: sessionIdSecret.Value,
		EnclaveSecret: []byte(enclaveNullifierSecret.Value),
	}
	worldIDProvider := &verifier.WorldIDProvider{BaseURL: config.WorldIDBaseURL, AppID: config.WorldIDAppID, HTTPClient: doer, TTL: attestationTTL(config)}

	batch := make([]domain.Entry, 0, len(pending))
	for _, req := range pending {
		var provider verifier.VerificationProvider
		switch req.Level {
		case verifier.WorldIDLevel:
			provider = worldIDProvider
		case verifier.SumsubLevel:
			provider = sumsubProvider
		default:
			continue
		}

		existing, err := registry.AttestationOf(donRuntime, attestation_registry.AttestationOfInput{Gate: req.Gate, Wallet: req.Wallet}, nil).Await()
		if err != nil {
			runtime.Logger().Warn("attestationOf lookup failed", "gate", req.Gate, "wallet", req.Wallet, "err", err)
		} else if existing.Level != 0 && existing.Expiry > uint64(time.Now().Unix()) {
			continue
		}

		att, err := provider.Verify(ctx, req)
		if err != nil {
			runtime.Logger().Warn("verification failed", "gate", req.Gate, "wallet", req.Wallet, "err", err)
			continue
		}

		batch = append(batch, domain.Entry{
			Kind:      domain.Attest,
			Gate:      req.Gate,
			Wallet:    req.Wallet,
			Att:       att,
			Nullifier: att.Nullifier,
		})
	}

	writer := chain.NewWriter(registry, nil)
	heartbeat := uint64(time.Now().Unix())
	if _, err := writer.ReportAttestations(donRuntime, heartbeat, batch, config.gasConfig()).Await(); err != nil {
		return "", fmt.Errorf("report attestations: %w", err)
	}

	return fmt.Sprintf("attested %d, heartbeat %d", len(batch), heartbeat), nil
}

func onPaymentOpened(
	config *Config,
	runtime cre.TeeRuntime,
	evmClient *evm.Client,
	payload *bindings.DecodedLog[gateway_factory.PaymentOpenedDecoded],
) (string, error) {
	ctx := context.Background()
	doer := creteehttp.New(runtime)
	screener := &provenance.GoPlusScreener{BaseURL: provenance.GoPlusBaseURL, Client: doer}

	gate := payload.Data.Gate
	id := payload.Data.Id
	payer := payload.Data.Payer

	gateway, err := merchant_gateway.NewMerchantGateway(evmClient, gate, nil)
	if err != nil {
		return "", fmt.Errorf("merchant gateway binding: %w", err)
	}

	donRuntime := runtime.UsingTheDons()
	payment, err := gateway.Payments(donRuntime, merchant_gateway.PaymentsInput{Arg0: id}, nil).Await()
	if err != nil {
		return "", fmt.Errorf("read payment: %w", err)
	}

	score, err := screener.Score(ctx, payer)
	if err != nil {
		return "", fmt.Errorf("provenance score: %w", err)
	}
	ok := score <= payment.MaxRisk

	writer := chain.NewWriter(nil, gateway)
	if _, err := writer.ReportSettlement(donRuntime, id, ok, config.gasConfig()).Await(); err != nil {
		return "", fmt.Errorf("report settlement: %w", err)
	}

	return fmt.Sprintf("settled %x ok=%t score=%d maxRisk=%d", id, ok, score, payment.MaxRisk), nil
}

type revocationRequest struct {
	Nullifier string `json:"nullifier"`
}

func onRevocationWebhook(
	runtime cre.Runtime,
	registry *attestation_registry.AttestationRegistry,
	gasConfig *evm.GasConfig,
	payload *creHttp.Payload,
) (string, error) {
	var req revocationRequest
	if err := json.Unmarshal(payload.Input, &req); err != nil {
		return "", fmt.Errorf("decode revocation request: %w", err)
	}

	nullifier := [32]byte(common.HexToHash(req.Nullifier))

	writer := chain.NewWriter(registry, nil)
	heartbeat := uint64(time.Now().Unix())
	batch := []domain.Entry{{Kind: domain.Revoke, Nullifier: nullifier}}

	if _, err := writer.ReportAttestations(runtime, heartbeat, batch, gasConfig).Await(); err != nil {
		return "", fmt.Errorf("report revocation: %w", err)
	}

	return fmt.Sprintf("revoked %s", req.Nullifier), nil
}

func newSumsubClient(runtime cre.TeeRuntime, config *Config, doer *creteehttp.Doer) (*sumsubapi.Client, error) {
	appToken, err := runtime.GetSecret(&cre.SecretRequest{Id: config.SumsubAppTokenID}).Await()
	if err != nil {
		return nil, fmt.Errorf("sumsub app token secret: %w", err)
	}
	secretKey, err := runtime.GetSecret(&cre.SecretRequest{Id: config.SumsubSecretID}).Await()
	if err != nil {
		return nil, fmt.Errorf("sumsub secret key: %w", err)
	}

	return &sumsubapi.Client{
		BaseURL:    config.SumsubBaseURL,
		AppToken:   appToken.Value,
		SecretKey:  secretKey.Value,
		HTTPClient: doer,
	}, nil
}

func attestationTTL(config *Config) time.Duration {
	return time.Duration(config.AttestationTTL) * time.Second
}
