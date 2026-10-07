// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ProcessorHub} from "../../src/processor/ProcessorHub.sol";
import {Decision} from "../../src/processor/libs/Decision.sol";

/// Cross-implementation check against fixtures/decision-eip712.json, signed by `cast` (see gen.sh).
/// ECDSA signing is RFC 6979 deterministic in both cast and vm.sign, so an identical signature
/// over the hub's digest proves the digests are identical.
contract DecisionVectorTest is Test {
    uint256 internal constant ANVIL_KEY_0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    function test_HubDigestMatchesCast() public {
        string memory json = vm.readFile("test/processor/fixtures/decision-eip712.json");
        ProcessorHub hub = new ProcessorHub(address(this), address(this));
        address signer = vm.parseJsonAddress(json, ".signer");

        for (uint256 i = 0; i < 4; i++) {
            string memory c = string.concat(".cases[", vm.toString(i), "].typedData");
            vm.chainId(vm.parseJsonUint(json, string.concat(c, ".domain.chainId")));
            address account = vm.parseJsonAddress(json, string.concat(c, ".domain.verifyingContract"));
            string memory m = string.concat(c, ".message");
            Decision memory d = Decision({
                paymentId: vm.parseJsonBytes32(json, string.concat(m, ".paymentId")),
                decision: uint8(vm.parseJsonUint(json, string.concat(m, ".decision"))),
                token: vm.parseJsonAddress(json, string.concat(m, ".token")),
                amount: vm.parseJsonUint(json, string.concat(m, ".amount")),
                packHash: vm.parseJsonBytes32(json, string.concat(m, ".packHash")),
                nonce: uint64(vm.parseJsonUint(json, string.concat(m, ".nonce"))),
                deadline: uint64(vm.parseJsonUint(json, string.concat(m, ".deadline")))
            });
            bytes memory castSig = vm.parseJsonBytes(json, string.concat(".cases[", vm.toString(i), "].signature"));

            bytes32 digest = hub.decisionDigest(account, d);
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(ANVIL_KEY_0, digest);
            assertEq(abi.encodePacked(r, s, v), castSig, "digest differs from cast");
            assertEq(ECDSA.recover(digest, castSig), signer);
        }
    }
}
