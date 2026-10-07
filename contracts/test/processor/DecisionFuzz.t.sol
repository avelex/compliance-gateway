// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Decision, Status} from "../../src/processor/libs/Decision.sol";
import {HubBase} from "./HubBase.sol";

/// Random sequences of officer-signed decisions over two payments in one account.
/// Whatever is accepted, funds stay conserved, leave only to the pool or the payer, and a payment
/// that was ever frozen never ends RETURNED.
contract DecisionFuzzTest is HubBase {
    uint256 internal constant A = 100e6;
    uint256 internal constant B = 40e6;
    bytes32[2] internal ids = [keccak256("a"), keccak256("b")];

    function testFuzz_FundsOnlyToPoolOrPayer_FreezeNeverReturns(uint8[12] calldata steps) public {
        address account = hub.accountOf(payer);
        _deposit(payer, A + B);
        bool[2] memory everFrozen;
        uint64[2] memory nonce;

        for (uint256 i = 0; i < steps.length; i++) {
            uint256 which = steps[i] & 1;
            uint8 kind = uint8((steps[i] >> 1) % 4) + 1;
            nonce[which]++;
            Decision memory d = _decision(ids[which], kind, which == 0 ? A : B, nonce[which]);
            bytes memory report = _report(officerKey, payer, d);
            vm.prank(executor);
            try hub.onReport("", report) {} catch {}

            for (uint256 j = 0; j < 2; j++) {
                (,, Status st,,,, bytes32 lock) = hub.payments(ids[j]);
                if (lock != 0) everFrozen[j] = true;
                if (everFrozen[j]) assertTrue(st != Status.Returned, "frozen payment returned");
            }
            assertEq(usdc.balanceOf(account) + usdc.balanceOf(pool) + usdc.balanceOf(payer), A + B, "funds escaped");
            assertLe(hub.reserved(account, address(usdc)), usdc.balanceOf(account), "reserved exceeds balance");
        }
    }
}
