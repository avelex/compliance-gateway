// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice A processor-signed decision on one deposit. Signed as EIP-712 under the domain
///         {name: "Deflow Decision", version: "1", chainId, verifyingContract: <payer's deposit account>}.
/// @dev Field order is part of the typehash; never reorder.
struct Decision {
    bytes32 paymentId; // keccak256(abi.encode(uint256 chainId, bytes32 txHash, uint256 logIndex))
    uint8 decision; // CREDIT | HOLD | FREEZE | RETURN
    address token;
    uint256 amount; // token base units
    bytes32 packHash; // evidence_root of the pack version the decision was taken on
    uint64 nonce; // per paymentId, strictly increasing
    uint64 deadline; // unix; stale decisions cannot be delivered
}

uint8 constant CREDIT = 1;
uint8 constant HOLD = 2;
uint8 constant FREEZE = 3;
uint8 constant RETURN = 4;

/// @dev None is reported as PENDING: a deposit has no record until its first decision.
///      FREEZE is Held plus a lock commitment, so a freeze and a review look the same on chain.
enum Status {
    None,
    Held,
    Credited,
    Returned
}

struct Payment {
    address payer;
    uint64 nonce;
    Status status;
    address token;
    uint256 amount;
    bytes32 packHash;
    bytes32 lockCommitment; // non-zero = frozen
}

bytes32 constant DECISION_TYPEHASH = keccak256(
    "Decision(bytes32 paymentId,uint8 decision,address token,uint256 amount,bytes32 packHash,uint64 nonce,uint64 deadline)"
);

bytes32 constant DOMAIN_TYPEHASH =
    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
