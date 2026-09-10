// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/src/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MerchantGateway} from "../src/MerchantGateway.sol";
import {IGatewayFactory} from "../src/interfaces/IGatewayFactory.sol";
import {IAttestationRegistry} from "../src/interfaces/IAttestationRegistry.sol";
import {MerchantConfig, Policy, Status} from "../src/libs/Merchant.sol";
import {InfrastructureConfig} from "../src/libs/Compliance.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {
        _mint(msg.sender, 1_000_000e6);
    }
}

contract MockRegistry is IAttestationRegistry {
    function isValid(address, address, uint8) external pure returns (bool) {
        return true;
    }

    function nullifierOf(address, address) external pure returns (bytes32) {
        return bytes32(uint256(1));
    }
}

// The test contract itself plays the role of GatewayFactory: MerchantGateway's
// constructor sets `factory = IGatewayFactory(msg.sender)`, and pay() calls back
// into it, so this needs a real emitPaymentOpened() implementation to not revert.
contract MerchantGatewayTest is Test, IGatewayFactory {
    MerchantGateway internal gateway;
    MockToken internal token;
    address internal forwarder = makeAddr("forwarder");
    address internal merchant = makeAddr("merchant");
    address internal payoutTo = makeAddr("payoutTo");
    address internal payer = makeAddr("payer");

    function emitPaymentOpened(bytes32, address, uint256) external {}

    function setUp() public {
        token = new MockToken();

        Policy memory policy = Policy({levelBelow: 0, levelAbove: 0, threshold: 0, maxRisk: 80});
        MerchantConfig memory merchConfig =
            MerchantConfig({merchant: merchant, payoutTo: payoutTo, token: IERC20(address(token)), policy: policy});
        InfrastructureConfig memory infraConfig = InfrastructureConfig({
            registry: new MockRegistry(),
            forwarder: forwarder,
            workflowOwner: address(0),
            workflowName: bytes10(0)
        });

        gateway = new MerchantGateway(merchConfig, infraConfig);

        token.transfer(payer, 1000e6);
        vm.prank(payer);
        token.approve(address(gateway), type(uint256).max);
    }

    function _openPayment(uint256 amount) internal returns (bytes32 id) {
        vm.recordLogs();
        vm.prank(payer);
        id = gateway.pay(amount);
    }

    function test_OnReport_SettlesToMerchant() public {
        bytes32 id = _openPayment(100e6);

        bytes memory report = abi.encode(id, true);
        vm.prank(forwarder);
        gateway.onReport("", report);

        (,,, Status status,) = gateway.payments(id);
        assertEq(uint8(status), uint8(Status.Settled));
        assertEq(token.balanceOf(payoutTo), 100e6);
    }

    function test_OnReport_RefundsPayerOnFailure() public {
        bytes32 id = _openPayment(100e6);
        uint256 payerBalanceBefore = token.balanceOf(payer);

        bytes memory report = abi.encode(id, false);
        vm.prank(forwarder);
        gateway.onReport("", report);

        (,,, Status status,) = gateway.payments(id);
        assertEq(uint8(status), uint8(Status.Refunded));
        assertEq(token.balanceOf(payer), payerBalanceBefore + 100e6);
    }

    function test_OnReport_RevertsForNonForwarder() public {
        bytes32 id = _openPayment(100e6);
        bytes memory report = abi.encode(id, true);

        vm.expectRevert(abi.encodeWithSignature("InvalidSender(address,address)", address(this), forwarder));
        gateway.onReport("", report);
    }

    function test_OnReport_RevertsWhenAlreadySettled() public {
        bytes32 id = _openPayment(100e6);
        bytes memory report = abi.encode(id, true);

        vm.prank(forwarder);
        gateway.onReport("", report);

        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSignature("PaymentNotPending()"));
        gateway.onReport("", report);
    }
}
