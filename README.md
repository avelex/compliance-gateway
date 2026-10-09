# Deflow

A proof for every deposit and every withdrawal.

Deflow is an evidence layer for stablecoin deposits. It gives regulated crypto businesses (processors, exchanges, off-ramps and custodians) a signed proof of how each deposit was checked and decided.

Every stablecoin deposit you receive has to be explained sooner or later: to a counterparty, a bank or a regulator. Deflow runs the compliance сhecks you choose, applies rules approved by your MLRO, and records a decision signed by your compliance officer or made automatically under your rules.

Each deposit gets a Payment Passport that anyone can verify, ready before the next party asks.

Deflow holds no funds and signs no transactions. With contracts, deposits also wait on-chain until your decision arrives.

## Problem

| Today | With Deflow |
|---|---|
| An RFI answer is assembled by hand from five systems | The Payment Passport is ready when the request arrives |
| A KYT score says "risky", not why the deposit was accepted | The checks, the rules and the person who decided are on record |
| Payer data arrives after the deposit | Travel Rule data is collected before the deposit |
| A withdrawal is explained after the fact | A Settlement Manifest comes with every withdrawal |

## Why Deflow

- **A decision, not a score.** KYT tools return a risk score. Deflow records which checks ran, under which rules and list versions, and who decided.
- **One pack, not five systems.** The RFI answer is assembled when the decision is made, not by hand afterwards.
- **Your keys, your funds.** Deflow never holds funds or signs transactions. With contracts, the contract carries out only your signed decision.

## What Deflow does not claim

- **That funds are clean.** It records which checks ran, under which rules, who decided, and what happened to the money.
- **To hold funds or sign transactions.** You sign. Deflow never takes custody.
- **To be a KYT provider.** It runs the checks you choose, with the providers you choose.
- **To decide.** Your officer or your rules decide. Deflow recommends.

## How it works

```
deposit --> checks ----------> your rules -------> decision ---------------> Payment Passport
            KYT, sanctions,    approved by         signed by your officer    anyone can
            split payments     your MLRO           or made automatically     verify it
                                                      |
                                                      | with contracts
                                                      v
                               the deposit waits in a smart contract you own;
                               the contract carries out only your signed decision:
                               credit to your pool | hold | freeze | return to payer
```

- **Who decides.** Routine credits and holds are made automatically under your rules. Everything else goes to an officer, who signs the decision personally.
- **Quiet freezes.** On-chain, a freeze looks like any other check in progress, so nobody outside learns about it. A frozen deposit can never be sent back to the payer.

## Configurations

- **Without contracts.** Funds move as they do today. Deflow watches deposits to your addresses, runs the checks, applies your rules, records the decisions and issues a Payment Passport for each deposit.
- **With contracts.** Adds a hold before credit. Each payer gets a personal deposit address, a smart contract that you own. The money waits there until your signed decision, and it can only go to your pool or back to the payer. Deflow only delivers your decision on-chain; it cannot forge one.

## Evidence pack

| Proof | Scope | Contents |
|---|---|---|
| Payment Passport | per deposit | Checks and their sources, rule and list versions, the officer's decision, signed by you |
| Settlement Manifest | per withdrawal | Which checked deposits make up the amount you withdraw |
| Audit Export | per period | Rule versions, calibrations and decision statistics, so the logic can be reproduced |

Templates, two example Payment Passports and a script that verifies them are in [`docs/evidence-pack/`](./docs/evidence-pack/).