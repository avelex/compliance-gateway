// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/src/Test.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {Attestation, Entry, EntryKind} from "../src/libs/Compliance.sol";

contract AttestationRegistryTest is Test {
    AttestationRegistry internal registry;
    address internal forwarder = makeAddr("forwarder");
    address internal gate = makeAddr("gate");
    address internal wallet = makeAddr("wallet");

    function setUp() public {
        registry = new AttestationRegistry(forwarder);
    }

    function _attestEntry(bytes32 nullifier, uint8 level, uint64 expiry) internal view returns (Entry memory) {
        return Entry({
            kind: EntryKind.Attest,
            gate: gate,
            wallet: wallet,
            att: Attestation({nullifier: nullifier, level: level, expiry: expiry}),
            nullifier: bytes32(0)
        });
    }

    function test_OnReport_AttestsAndSetsHeartbeat() public {
        uint64 heartbeat = uint64(block.timestamp);
        bytes32 nullifier = keccak256("applicant-1");
        uint64 expiry = uint64(block.timestamp + 30 days);

        Entry[] memory batch = new Entry[](1);
        batch[0] = _attestEntry(nullifier, 2, expiry);
        bytes memory report = abi.encode(heartbeat, batch);

        vm.prank(forwarder);
        registry.onReport("", report);

        assertEq(registry.lastHeartbeat(), heartbeat);

        Attestation memory att = registry.attestationOf(gate, wallet);
        assertEq(att.nullifier, nullifier);
        assertEq(att.level, 2);
        assertEq(att.expiry, expiry);

        assertTrue(registry.isValid(gate, wallet, 2));
        assertFalse(registry.isValid(gate, wallet, 3));
    }

    function test_OnReport_RevertsForNonForwarder() public {
        bytes memory report = abi.encode(uint64(block.timestamp), new Entry[](0));

        vm.expectRevert(abi.encodeWithSignature("InvalidSender(address,address)", address(this), forwarder));
        registry.onReport("", report);
    }

    function test_OnReport_RevokeByNullifier() public {
        bytes32 nullifier = keccak256("applicant-2");
        uint64 expiry = uint64(block.timestamp + 30 days);

        Entry[] memory attestBatch = new Entry[](1);
        attestBatch[0] = _attestEntry(nullifier, 2, expiry);
        vm.prank(forwarder);
        registry.onReport("", abi.encode(uint64(block.timestamp), attestBatch));

        assertTrue(registry.isValid(gate, wallet, 2));

        Entry[] memory revokeBatch = new Entry[](1);
        revokeBatch[0] = Entry({
            kind: EntryKind.Revoke,
            gate: address(0),
            wallet: address(0),
            att: Attestation({nullifier: bytes32(0), level: 0, expiry: 0}),
            nullifier: nullifier
        });

        vm.prank(forwarder);
        registry.onReport("", abi.encode(uint64(block.timestamp), revokeBatch));

        assertTrue(registry.revokedNullifier(nullifier));
        assertFalse(registry.isValid(gate, wallet, 2));
    }

    function test_OnReport_HeartbeatMustBeMonotonicAndNotFuture() public {
        uint64 firstHeartbeat = uint64(block.timestamp);
        vm.prank(forwarder);
        registry.onReport("", abi.encode(firstHeartbeat, new Entry[](0)));
        assertEq(registry.lastHeartbeat(), firstHeartbeat);

        // Stale heartbeat (not greater than lastHeartbeat) is silently ignored, not reverted.
        vm.prank(forwarder);
        registry.onReport("", abi.encode(firstHeartbeat, new Entry[](0)));
        assertEq(registry.lastHeartbeat(), firstHeartbeat);

        // Future heartbeat is silently ignored too.
        vm.prank(forwarder);
        registry.onReport("", abi.encode(uint64(block.timestamp + 1 days), new Entry[](0)));
        assertEq(registry.lastHeartbeat(), firstHeartbeat);
    }

    function test_IsValid_FalseWhenMonitoringStale() public {
        bytes32 nullifier = keccak256("applicant-3");
        uint64 expiry = uint64(block.timestamp + 365 days);

        Entry[] memory batch = new Entry[](1);
        batch[0] = _attestEntry(nullifier, 1, expiry);
        vm.prank(forwarder);
        registry.onReport("", abi.encode(uint64(block.timestamp), batch));

        assertTrue(registry.isValid(gate, wallet, 1));

        vm.warp(block.timestamp + registry.MAX_STALE() + 1);
        assertFalse(registry.isValid(gate, wallet, 1));
    }
}
