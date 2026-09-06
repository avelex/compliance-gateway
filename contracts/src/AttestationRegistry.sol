// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ReceiverTemplate} from "./chainlink/ReceiverTemplate.sol";
import {IAttestationRegistry} from "./interfaces/IAttestationRegistry.sol";
import {Attestation, Entry, EntryKind} from "./libs/Compliance.sol";

/// @notice Verdicts and monitoring liveness. The only writer is the DON, via the forwarder.
contract AttestationRegistry is ReceiverTemplate, IAttestationRegistry {
    /// @dev Monitoring is considered dead after this, and every attestation stops validating.
    uint64 public constant MAX_STALE = 48 hours;

    /// @dev Zero until the first heartbeat: a fresh registry is dead, not trusted-by-default.
    uint64 public lastHeartbeat;

    mapping(bytes32 => Attestation) private _att;
    mapping(bytes32 => bool) public revokedNullifier;

    event Attested(bytes32 indexed key, bytes32 indexed nullifier, uint8 level, uint64 expiry);
    event RevocationSet(bytes32 indexed nullifier, bool revoked);
    event Heartbeat(uint64 at);

    constructor(address forwarder_) ReceiverTemplate(msg.sender, forwarder_) {}

    function _processReport(bytes calldata report) internal override {
        (uint64 heartbeat, Entry[] memory batch) = abi.decode(report, (uint64, Entry[]));

        // A future heartbeat would underflow the staleness check in isValid, which pay() calls.
        if (heartbeat > lastHeartbeat && heartbeat <= block.timestamp) {
            lastHeartbeat = heartbeat;
            emit Heartbeat(heartbeat);
        }

        for (uint256 i; i < batch.length; ++i) {
            Entry memory e = batch[i];
            if (e.kind == EntryKind.Attest) {
                bytes32 key = keccak256(abi.encode(e.gate, e.wallet));
                _att[key] = e.att;
                emit Attested(key, e.att.nullifier, e.att.level, e.att.expiry);
            } else {
                bool r = e.kind == EntryKind.Revoke;
                revokedNullifier[e.nullifier] = r;
                emit RevocationSet(e.nullifier, r);
            }
        }
    }

    function attestationOf(address gate, address wallet) external view returns (Attestation memory) {
        return _att[keccak256(abi.encode(gate, wallet))];
    }

    function nullifierOf(address gate, address wallet) external view returns (bytes32) {
        return _att[keccak256(abi.encode(gate, wallet))].nullifier;
    }

    function isValid(address gate, address wallet, uint8 minLevel) external view returns (bool) {
        Attestation memory a = _att[keccak256(abi.encode(gate, wallet))];
        return a.level >= minLevel && a.level > 0 && !revokedNullifier[a.nullifier] && 
            // the verification itself has not aged out
            block.timestamp < a.expiry && block.timestamp - lastHeartbeat < MAX_STALE; // monitoring is alive; fail-closed
    }
}
