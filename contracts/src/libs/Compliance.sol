// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IGatewayFactory} from "../interfaces/IGatewayFactory.sol";
import {IAttestationRegistry} from "../interfaces/IAttestationRegistry.sol";

struct InfrastructureConfig {
    IAttestationRegistry registry;
    address forwarder;
    address workflowOwner;
    bytes10 workflowName;
}

/// @notice Verdict written by the enclave. Never carries anything from which a person is derivable.
struct Attestation {
    bytes32 nullifier; // HMAC from the enclave; opaque to the merchant
    uint8 level; // 1 = World ID Selfie Check, 2 = full KYC + AML
    uint64 expiry; // unix, issuance + verification TTL
}

enum EntryKind {
    Attest,
    Revoke,
    Unrevoke
}

/// @notice One line of a DON report. ABI shared with the workflow.
struct Entry {
    EntryKind kind;
    address gate; 
    address wallet;
    Attestation att; 
    bytes32 nullifier;
}