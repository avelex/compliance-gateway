# Deflow

The non-custodial compliance gateway for crypto checkouts. 

Enforce KYC/AML checks in real time, before funds ever hit your wallet.

## Purpose

Let any merchant – regulated institution or SaaS, accept stablecoin payments safely and legally. You get clean money and zero data liability, while your customers retain absolute privacy.

## Problem

Accept crypto long enough and a sanctioned address **will** pay you. You find out from your bank, your CEX, your processor or your regulator — after the money is already sitting in your account. Damage is already done, but crypto payments are irreversible.

Today, merchants are forced into three broken compromises:

1. **Hand custody to a centralized PSP.** They take a cut, hold your funds, and keep your customers' passports in their database. Their breach is your headline.
2. **Build a DIY stack.** Sumsub and Chainalysis score risk, but cannot move tokens. If funds hit your wallet before the API answers, your address is already burned. Connecting them to smart contracts forces you to build custom escrow and maintain a backend signer.
3. **Screen nothing and hope.** Free address oracles only flag addresses that are themselves on the OFAC list. Funds that passed through Tornado Cash, a cross-chain bridge exploit, or a mixer two hops ago pass straight through as "clean".

The customer's side is no better: the same passport photo scattered across a dozen merchant
dashboards, or an on-chain "verified" badge that permanently links every wallet they will ever own.

---

**Deflow** addresses this problem by providing the non-custodial payment gateway that runs KYC and AML inside a confidential enclave. Screening works out of the box from your very first payment. No sensitive documents ever reach you, us, or the blockchain. And the money is never ours to hold, at any point, by design.

## Solution

Deflow bridges the gap between regulatory requirements and Web3 privacy. We separate fund flow from compliance screening: money moves strictly between payer and merchant contracts, while checks run in an isolated enclave.

### Features

- **Non-custodial**: Deflow never takes custody of funds. Payments go into the merchant’s dedicated smart contract (`MerchantGateway`) during a short screening window. The contract has only two exits: forward to the merchant on approval, or refund to the payer if flagged or timed out. Funds cannot be frozen.

- **Zero Data Liability**: Personal documents and paid AML intelligence never touch the merchant's servers, Deflow's backend, or the blockchain. Verification executes inside a Chainlink CRE enclave (TEE). The blockchain only ever receives an opaque, single-use `nullifier`, a verified tier, and an expiry timestamp.

- **Compliance**: Deflow runs automated sanctions and fund provenance (KYT) checks out of the box for every payments in real time. Merchants toggle identity checks (Sumsub / World ID) only when transaction thresholds or local jurisdictions require it.


### Value Proposition

- **For Merchants:** Payment gateway of your own in one click, no-code, no documents in your database, no custodian holding your money. Funds can only ever go to you or back to the payer.

- **For Customers:** Absolute privacy. Your passport is verified once, never stored on-chain, and merchants cannot cross-reference your wallets or purchase history. If a payment fails screening, the refund is automatic.

- **For Compliance Teams:** Real-time enforcement, automated audit logs, per-person (anti-Sybil) velocity limits across multiple wallets, and instant revocation by nullifier.


## Architecture

![Architecture](./docs/ComplianceGateway.drawio.svg)

### How it Works

**Verification** — once per wallet, and only if the merchant asks for it:

0. Customer opens the merchant's checkout and connects an ordinary wallet.
1. Checkout drops a request `{gateway, wallet}` into the Relayer queue. Documents go from the Sumsub widget straight to Sumsub — they never pass through our backend.
2. Once a minute the enclave pulls a snapshot of that queue itself.
3. Inside the enclave: Sumsub lookup — documents, sanctions, PEP, adverse media.
4. For level 1 it is World ID Selfie Check instead — proof bound to the wallet address.
5. The enclave derives the `nullifier` from the document and the merchant's gateway address, and reports `{nullifier, level, expiry}` through DON consensus.
6. Chainlink's `KeystoneForwarder` checks the DON signatures and writes grants, revocations and the heartbeat into `AttestationRegistry` in one batch.
7. Checkout sees the result as an on-chain event.

**Payment**

8. Customer execute `pay()`. The funds are held in a pending window, not forwarded yet.
9. The gateway reads the registry and enforces its own policy: required level, threshold, and a 24-hour running total tracked **per person**, so splitting a payment across wallets does not help.
10. The gateway has `GatewayFactory` emit `PaymentOpened` — one fixed address, so gateways deployed later still trigger the workflow.
11. The event wakes the workflow.
12. The enclave screens where the money came from, against the risk ceiling the merchant set.
13. A yes/no — never the score — goes through DON consensus.
14. `settle(id, ok)` releases the payment to the merchant.
15. On a "no", or via `reclaim()` after 15 minutes that anyone can call, the money goes back to the payer. It cannot get stuck.

**Afterwards Monitoring**

16. If monitoring flags someone later, the webhook revokes them **by nullifier** — every wallet that person used at that merchant dies at once.
- An hourly heartbeat proves the monitoring is alive. After 48 hours of silence every attestation
  stops working: a broken system must not look like a clean one.


### Stack

| Layer | Tech |
|---|---|
| Confidential compute | Chainlink CRE Confidential Workflow (TEE), Go |
| Secrets | Chainlink Vault DON |
| On-chain | Solidity, Base Sepolia, USDC and EURC|
| Frontend | Next.js (checkout + merchant dashboard) |
| Merchant custody | Privy Organization Wallets, policy engine, m-of-n key quorums |

### Components

| Component | Owner | Role |
|---|---|---|
| `attestor-workflow` | us | CRE confidential workflow: verification, nullifier derivation, provenance screening, revocation, heartbeat |
| `AttestationRegistry.sol` | us | Attestation registry, written only by the CRE workflow |
| `GatewayFactory.sol` | us | Deploys merchant gateways |
| `MerchantGateway.sol` | merchant | Policy, clearing window, `settle` by the CRE workflow, `reclaim` by payer|
| `relay` | us | Queue of verification requests and webhooks + Sumsub WebSDK token minting. A dumb pipe: no enclave key, no read scope on Sumsub, signs nothing on-chain |
| `checkout` / `dashboard` | us | Payer flow, merchant onboarding, policy, attestation and payment lists |

### External Providers

| Provider | Used for | Notes |
|---|---|---|
| Chainlink | CRE Confidential Workflow, enclave secrets | running inside the TEE |
| Privy | merchant organization wallet, policy engine, key quorums | `setPolicy` also works with a plain owner signature; quorum is an add-on |
| Sumsub | KYC documents, AML on the person | sandbox; two app tokens — create-only for the relayer, read-only for the enclave |
| GoPlus | fund provenance (KYT) | billed per payment |

## Roadmap

- [ ] Wallet rebind by signature — bind a new address to an existing attestation without a repeat
  Sumsub session.
- [ ] Sumsub Reusable KYC across businesses.
- [ ] Multi-token gateways (per-token decimals, fee-on-transfer accounting, reentrancy).
- [ ] Whitelist payment tokens in `GatewayFactory` — `deploy()` currently takes any ERC20 from calldata; only USDC/EURC are offered in the UI.
- [ ] Production Sumsub keys; BYOK AML aggregators above ~50k checks/month.
- [ ] Fiat off-ramp
- [ ] Cross-chain payment router.

