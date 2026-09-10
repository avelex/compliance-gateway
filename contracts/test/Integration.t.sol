// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, Vm} from "forge-std/src/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {GatewayFactory} from "../src/GatewayFactory.sol";
import {MerchantGateway} from "../src/MerchantGateway.sol";
import {IAttestationRegistry} from "../src/interfaces/IAttestationRegistry.sol";
import {MerchantConfig, Policy, Status} from "../src/libs/Merchant.sol";
import {Attestation, Entry, EntryKind} from "../src/libs/Compliance.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {
        _mint(msg.sender, 1_000_000e6);
    }
}

/// @notice Full stack, wired the way it would be on a real chain: one shared
/// AttestationRegistry, one GatewayFactory, gates minted through the factory.
/// vm.prank(forwarder) stands in for KeystoneForwarder — the one piece a local
/// sandbox genuinely cannot run without a live DON — everything downstream of
/// "the forwarder delivered this report" is exercised for real.
contract IntegrationTest is Test {
    AttestationRegistry internal registry;
    GatewayFactory internal factory;
    MerchantGateway internal gateway;
    MockToken internal token;

    address internal forwarder = makeAddr("forwarder");
    address internal merchant = makeAddr("merchant");
    address internal payoutTo = makeAddr("payoutTo");
    address internal payer = makeAddr("payer");

    uint256 internal constant PAY_AMOUNT = 100e6;

    function setUp() public {
        registry = new AttestationRegistry(forwarder);
        factory = new GatewayFactory(IAttestationRegistry(address(registry)), forwarder, address(0), bytes10(0));

        token = new MockToken();

        Policy memory policy = Policy({levelBelow: 1, levelAbove: 1, threshold: 10_000e6, maxRisk: 80});
        MerchantConfig memory merchConfig =
            MerchantConfig({merchant: merchant, payoutTo: payoutTo, token: IERC20(address(token)), policy: policy});

        address gate = factory.deploy(merchConfig);
        gateway = MerchantGateway(gate);

        token.transfer(payer, 1000e6);
        vm.prank(payer);
        token.approve(gate, type(uint256).max);
    }

    function _attest(address gate, address wallet, uint8 level, uint64 expiry) internal {
        _attestAs(gate, wallet, keccak256(abi.encode(gate, wallet)), level, expiry);
    }

    /// @dev Lets two different (gate, wallet) keys share one nullifier — the
    /// on-chain shape of "same person, different wallet" (the enclave derives
    /// the nullifier from the document, not the wallet).
    function _attestAs(address gate, address wallet, bytes32 nullifier, uint8 level, uint64 expiry) internal {
        Entry[] memory batch = new Entry[](1);
        batch[0] = Entry({
            kind: EntryKind.Attest,
            gate: gate,
            wallet: wallet,
            att: Attestation({nullifier: nullifier, level: level, expiry: expiry}),
            nullifier: bytes32(0)
        });
        vm.prank(forwarder);
        registry.onReport("", abi.encode(uint64(block.timestamp), batch));
    }

    function test_Pay_RevertsWithoutAttestation() public {
        vm.prank(payer);
        vm.expectRevert(MerchantGateway.NotVerified.selector);
        gateway.pay(PAY_AMOUNT);
    }

    function test_FullFlow_AttestPayScreenSettle() public {
        _attest(address(gateway), payer, 1, uint64(block.timestamp + 30 days));

        vm.recordLogs();
        vm.prank(payer);
        bytes32 id = gateway.pay(PAY_AMOUNT);

        // The exact log attestor-workflow's LogTriggerPaymentOpenedLog watches:
        // GatewayFactory.PaymentOpened(gate, id, payer, amount) — the only emitter.
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(factory) && logs[i].topics[0] == GatewayFactory.PaymentOpened.selector) {
                assertEq(address(uint160(uint256(logs[i].topics[1]))), address(gateway));
                assertEq(logs[i].topics[2], id);
                found = true;
            }
        }
        assertTrue(found, "GatewayFactory.PaymentOpened not observed");

        assertEq(token.balanceOf(address(gateway)), PAY_AMOUNT);

        vm.prank(forwarder);
        gateway.onReport("", abi.encode(id, true));

        (,,, Status status,) = gateway.payments(id);
        assertEq(uint8(status), uint8(Status.Settled));
        assertEq(token.balanceOf(payoutTo), PAY_AMOUNT);
        assertEq(token.balanceOf(address(gateway)), 0);
    }

    function test_FullFlow_ScreenFailsRefundsPayer() public {
        _attest(address(gateway), payer, 1, uint64(block.timestamp + 30 days));

        vm.prank(payer);
        bytes32 id = gateway.pay(PAY_AMOUNT);
        uint256 payerBalanceBefore = token.balanceOf(payer);

        vm.prank(forwarder);
        gateway.onReport("", abi.encode(id, false));

        (,,, Status status,) = gateway.payments(id);
        assertEq(uint8(status), uint8(Status.Refunded));
        assertEq(token.balanceOf(payer), payerBalanceBefore + PAY_AMOUNT);
    }

    function test_Revocation_BlocksFuturePayments() public {
        _attest(address(gateway), payer, 1, uint64(block.timestamp + 30 days));

        vm.prank(payer);
        gateway.pay(PAY_AMOUNT / 2);

        bytes32 nullifier = registry.nullifierOf(address(gateway), payer);
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

        vm.prank(payer);
        vm.expectRevert(MerchantGateway.NotVerified.selector);
        gateway.pay(PAY_AMOUNT / 2);
    }

    function test_StaleMonitoring_BlocksPayments() public {
        _attest(address(gateway), payer, 1, uint64(block.timestamp + 365 days));

        vm.warp(block.timestamp + registry.MAX_STALE() + 1);

        vm.prank(payer);
        vm.expectRevert(MerchantGateway.NotVerified.selector);
        gateway.pay(PAY_AMOUNT);
    }

    function test_Reclaim_AfterTimeoutReturnsFundsWithoutForwarder() public {
        _attest(address(gateway), payer, 1, uint64(block.timestamp + 30 days));

        vm.prank(payer);
        bytes32 id = gateway.pay(PAY_AMOUNT);
        uint256 payerBalanceBefore = token.balanceOf(payer);

        vm.warp(block.timestamp + gateway.TIMEOUT() + 1);
        gateway.reclaim(id);

        (,,, Status status,) = gateway.payments(id);
        assertEq(uint8(status), uint8(Status.Refunded));
        assertEq(token.balanceOf(payer), payerBalanceBefore + PAY_AMOUNT);
    }

    function test_CumulativeThreshold_SplitAcrossWalletsStillCaps() public {
        // Same person, two wallets, same nullifier once both are attested to
        // the same gate — spend windows are keyed by nullifier, not wallet.
        // levelAbove > levelBelow: both wallets stay attested at level 1 only,
        // so once combined spend clears the threshold neither wallet qualifies
        // for the higher level and the cumulative cap actually bites.
        Policy memory capped = Policy({levelBelow: 1, levelAbove: 2, threshold: 150e6, maxRisk: 80});
        MerchantConfig memory merchConfig =
            MerchantConfig({merchant: merchant, payoutTo: payoutTo, token: IERC20(address(token)), policy: capped});
        address gate = factory.deploy(merchConfig);
        MerchantGateway cappedGateway = MerchantGateway(gate);

        vm.prank(payer);
        token.approve(gate, type(uint256).max);

        address payer2 = makeAddr("payer2");
        token.transfer(payer2, 1000e6);
        vm.prank(payer2);
        token.approve(gate, type(uint256).max);

        bytes32 sharedNullifier = keccak256("same person");
        _attestAs(gate, payer, sharedNullifier, 1, uint64(block.timestamp + 30 days));
        _attestAs(gate, payer2, sharedNullifier, 1, uint64(block.timestamp + 30 days));

        vm.prank(payer);
        cappedGateway.pay(100e6);

        vm.prank(payer2);
        vm.expectRevert(MerchantGateway.CumulativeThreshold.selector);
        cappedGateway.pay(100e6);
    }
}
