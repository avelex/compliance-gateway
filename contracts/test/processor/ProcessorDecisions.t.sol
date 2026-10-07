// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ProcessorHub} from "../../src/processor/ProcessorHub.sol";
import {DepositAccount} from "../../src/processor/DepositAccount.sol";
import {Decision, Status, CREDIT, HOLD, FREEZE, RETURN} from "../../src/processor/libs/Decision.sol";
import {HubBase} from "./HubBase.sol";

contract ProcessorDecisionsTest is HubBase {
    bytes32 internal constant ID = keccak256("payment-1");
    uint256 internal constant AMOUNT = 100e6;

    function setUp() public override {
        super.setUp();
        _deposit(payer, AMOUNT);
    }

    function _status(bytes32 id) internal view returns (Status status, bytes32 lock) {
        (,, status,,,, lock) = hub.payments(id);
    }

    function _expectRevertDeliver(uint256 key, address who, Decision memory d, bytes memory err) internal {
        bytes memory report = _report(key, who, d);
        vm.prank(executor);
        vm.expectRevert(err);
        hub.onReport("", report);
    }

    // ---- direct outcomes -----------------------------------------------------------------

    function test_DirectCredit_FundedBeforeDeployment() public {
        assertEq(hub.accountOf(payer).code.length, 0);
        _deliver(autoKey, payer, _decision(ID, CREDIT, AMOUNT, 1));
        (Status st,) = _status(ID);
        assertEq(uint8(st), uint8(Status.Credited));
        assertEq(usdc.balanceOf(pool), AMOUNT);
        assertGt(hub.accountOf(payer).code.length, 0);
    }

    function test_DirectReturn() public {
        _deliver(officerKey, payer, _decision(ID, RETURN, AMOUNT, 1));
        (Status st,) = _status(ID);
        assertEq(uint8(st), uint8(Status.Returned));
        assertEq(usdc.balanceOf(payer), AMOUNT);
    }

    function test_EmitsDecisionExecuted() public {
        Decision memory d = _decision(ID, HOLD, AMOUNT, 1);
        vm.expectEmit(address(hub));
        emit ProcessorHub.DecisionExecuted(
            ID, payer, hub.accountOf(payer), HOLD, Status.Held, d.packHash, 1, bytes32(0)
        );
        _deliver(autoKey, payer, d);
    }

    // ---- held payments -------------------------------------------------------------------

    function test_HoldThenCredit_ReleasesReservation() public {
        address account = hub.accountOf(payer);
        _deliver(autoKey, payer, _decision(ID, HOLD, AMOUNT, 1));
        assertEq(hub.reserved(account, address(usdc)), AMOUNT);
        _deliver(autoKey, payer, _decision(ID, CREDIT, AMOUNT, 2));
        assertEq(hub.reserved(account, address(usdc)), 0);
        assertEq(usdc.balanceOf(pool), AMOUNT);
    }

    function test_HoldThenReturn() public {
        _deliver(autoKey, payer, _decision(ID, HOLD, AMOUNT, 1));
        _deliver(officerKey, payer, _decision(ID, RETURN, AMOUNT, 2));
        (Status st,) = _status(ID);
        assertEq(uint8(st), uint8(Status.Returned));
        assertEq(usdc.balanceOf(payer), AMOUNT);
    }

    function test_HoldThenHold_UpdatesPackAndNonce() public {
        _deliver(autoKey, payer, _decision(ID, HOLD, AMOUNT, 1));
        Decision memory d = _decision(ID, HOLD, AMOUNT, 2);
        _deliver(autoKey, payer, d);
        (, uint64 nonce, Status st,,, bytes32 packHash,) = hub.payments(ID);
        assertEq(nonce, 2);
        assertEq(packHash, d.packHash);
        assertEq(uint8(st), uint8(Status.Held));
        assertEq(hub.reserved(hub.accountOf(payer), address(usdc)), AMOUNT);
    }

    // ---- freeze --------------------------------------------------------------------------

    function test_FreezeLooksLikeHold() public {
        Decision memory d = _decision(ID, FREEZE, AMOUNT, 1);
        _deliver(officerKey, payer, d);
        (Status st, bytes32 lock) = _status(ID);
        assertEq(uint8(st), uint8(Status.Held));
        assertEq(lock, keccak256(abi.encode(d.packHash, d.nonce)));
    }

    function test_RevertWhen_ReturnAfterFreeze() public {
        _deliver(officerKey, payer, _decision(ID, FREEZE, AMOUNT, 1));
        _expectRevertDeliver(
            officerKey, payer, _decision(ID, RETURN, AMOUNT, 2), abi.encodeWithSelector(ProcessorHub.Frozen.selector)
        );
        assertEq(usdc.balanceOf(hub.accountOf(payer)), AMOUNT);
    }

    function test_RevertWhen_HoldAfterFreeze() public {
        _deliver(officerKey, payer, _decision(ID, FREEZE, AMOUNT, 1));
        (, bytes32 lockBefore) = _status(ID);
        _expectRevertDeliver(
            officerKey, payer, _decision(ID, HOLD, AMOUNT, 2), abi.encodeWithSelector(ProcessorHub.Frozen.selector)
        );
        (, bytes32 lockAfter) = _status(ID);
        assertEq(lockAfter, lockBefore);
    }

    function test_ReFreezeReplacesCommitment() public {
        _deliver(officerKey, payer, _decision(ID, FREEZE, AMOUNT, 1));
        Decision memory d = _decision(ID, FREEZE, AMOUNT, 2);
        _deliver(officerKey, payer, d);
        (, bytes32 lock) = _status(ID);
        assertEq(lock, keccak256(abi.encode(d.packHash, uint64(2))));
        assertEq(hub.reserved(hub.accountOf(payer), address(usdc)), AMOUNT);
    }

    function test_CreditAfterFreeze() public {
        _deliver(officerKey, payer, _decision(ID, FREEZE, AMOUNT, 1));
        _deliver(officerKey, payer, _decision(ID, CREDIT, AMOUNT, 2));
        (Status st,) = _status(ID);
        assertEq(uint8(st), uint8(Status.Credited));
        assertEq(usdc.balanceOf(pool), AMOUNT);
    }

    // ---- rejections ----------------------------------------------------------------------

    function test_RevertWhen_Terminal() public {
        _deliver(autoKey, payer, _decision(ID, CREDIT, AMOUNT, 1));
        _expectRevertDeliver(
            officerKey, payer, _decision(ID, HOLD, AMOUNT, 2), abi.encodeWithSelector(ProcessorHub.Terminal.selector)
        );
    }

    function test_RevertWhen_Redelivered() public {
        Decision memory d = _decision(ID, HOLD, AMOUNT, 1);
        _deliver(autoKey, payer, d);
        _expectRevertDeliver(autoKey, payer, d, abi.encodeWithSelector(ProcessorHub.StaleNonce.selector));
        assertEq(usdc.balanceOf(hub.accountOf(payer)), AMOUNT);
    }

    function test_RevertWhen_Expired() public {
        Decision memory d = _decision(ID, CREDIT, AMOUNT, 1);
        vm.warp(d.deadline + 1);
        _expectRevertDeliver(autoKey, payer, d, abi.encodeWithSelector(ProcessorHub.Expired.selector));
    }

    function test_RevertWhen_NotExecutor() public {
        bytes memory report = _report(autoKey, payer, _decision(ID, CREDIT, AMOUNT, 1));
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(ProcessorHub.NotExecutor.selector);
        hub.onReport("", report);
    }

    function test_RevertWhen_RevokedExecutor() public {
        vm.prank(owner);
        hub.setExecutor(executor, false);
        bytes memory report = _report(autoKey, payer, _decision(ID, CREDIT, AMOUNT, 1));
        vm.prank(executor);
        vm.expectRevert(ProcessorHub.NotExecutor.selector);
        hub.onReport("", report);
    }

    function test_CreForwarderAndSubmitterSideBySide() public {
        address forwarder = makeAddr("creForwarder");
        vm.prank(owner);
        hub.setExecutor(forwarder, true);
        bytes memory report = _report(autoKey, payer, _decision(ID, HOLD, AMOUNT, 1));
        vm.prank(forwarder);
        hub.onReport(hex"1234", report); // CRE metadata is ignored
        _deliver(autoKey, payer, _decision(ID, CREDIT, AMOUNT, 2));
        assertEq(usdc.balanceOf(pool), AMOUNT);
    }

    function test_RevertWhen_SignerLacksPermission() public {
        Decision memory d = _decision(ID, FREEZE, AMOUNT, 1);
        address autoSigner = vm.addr(autoKey);
        _expectRevertDeliver(autoKey, payer, d, abi.encodeWithSelector(ProcessorHub.NotPermitted.selector, autoSigner));
    }

    function test_RevertWhen_SignerRevoked() public {
        vm.prank(owner);
        hub.setSigner(vm.addr(autoKey), 0);
        _expectRevertDeliver(
            autoKey,
            payer,
            _decision(ID, CREDIT, AMOUNT, 1),
            abi.encodeWithSelector(ProcessorHub.NotPermitted.selector, vm.addr(autoKey))
        );
    }

    function test_RevertWhen_SignatureReplayedOnOtherPayer() public {
        address other = makeAddr("other");
        _deposit(other, AMOUNT);
        Decision memory d = _decision(ID, CREDIT, AMOUNT, 1);
        (, bytes memory sig) = _signed(autoKey, payer, d);
        bytes32 otherDigest = hub.decisionDigest(hub.accountOf(other), d);
        address recovered = ECDSA.recover(otherDigest, sig);
        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(ProcessorHub.NotPermitted.selector, recovered));
        hub.onReport("", abi.encode(other, d, sig));
    }

    function test_RevertWhen_AmountChanges() public {
        _deliver(autoKey, payer, _decision(ID, HOLD, AMOUNT, 1));
        _deposit(payer, 50e6);
        _expectRevertDeliver(
            autoKey, payer, _decision(ID, CREDIT, 150e6, 2), abi.encodeWithSelector(ProcessorHub.Mismatch.selector)
        );
    }

    function test_RevertWhen_ExceedsFreeBalance() public {
        _deliver(officerKey, payer, _decision(ID, FREEZE, AMOUNT, 1));
        _deposit(payer, 50e6);
        bytes32 id2 = keccak256("payment-2");
        _expectRevertDeliver(
            autoKey,
            payer,
            _decision(id2, CREDIT, 120e6, 1),
            abi.encodeWithSelector(ProcessorHub.InsufficientFree.selector)
        );
        _deliver(autoKey, payer, _decision(id2, CREDIT, 50e6, 1));
        assertEq(usdc.balanceOf(pool), 50e6);
    }

    function test_RevertWhen_UnknownDecision() public {
        _expectRevertDeliver(
            officerKey,
            payer,
            _decision(ID, 5, AMOUNT, 1),
            abi.encodeWithSelector(ProcessorHub.UnknownDecision.selector)
        );
        _expectRevertDeliver(
            officerKey,
            payer,
            _decision(ID, 0, AMOUNT, 1),
            abi.encodeWithSelector(ProcessorHub.UnknownDecision.selector)
        );
    }

    function test_RevertWhen_ZeroNonce() public {
        _expectRevertDeliver(
            autoKey, payer, _decision(ID, HOLD, AMOUNT, 0), abi.encodeWithSelector(ProcessorHub.StaleNonce.selector)
        );
    }

    function test_NoDecisionNoMovement() public {
        vm.warp(block.timestamp + 365 days);
        // The only paths out are onReport (executor + processor signature) and release (hub only).
        DepositAccount account = DepositAccount(hub.deployAccount(payer));
        vm.prank(payer);
        vm.expectRevert(DepositAccount.NotHub.selector);
        account.release(IERC20(address(usdc)), AMOUNT, false);
        assertEq(usdc.balanceOf(address(account)), AMOUNT);
    }

    function _signed(uint256 key, address who, Decision memory d)
        internal
        view
        returns (Decision memory, bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, hub.decisionDigest(hub.accountOf(who), d));
        return (d, abi.encodePacked(r, s, v));
    }
}
