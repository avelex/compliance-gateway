// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IReceiver} from "../../src/interfaces/IReceiver.sol";
import {ProcessorHub} from "../../src/processor/ProcessorHub.sol";
import {ProcessorHubFactory} from "../../src/processor/ProcessorHubFactory.sol";
import {DepositAccount} from "../../src/processor/DepositAccount.sol";
import {HubBase} from "./HubBase.sol";

contract ProcessorHubAdminTest is HubBase {
    address internal stranger = makeAddr("stranger");

    function test_RevertWhen_ConstructedWithZeroPool() public {
        vm.expectRevert(ProcessorHub.ZeroAddress.selector);
        new ProcessorHub(owner, address(0));
    }

    function test_SetSigner_EmitsAndStoresMask() public {
        vm.expectEmit(address(hub));
        emit ProcessorHub.SignerSet(stranger, 0x03);
        vm.prank(owner);
        hub.setSigner(stranger, 0x03);
        assertEq(hub.signerMask(stranger), 0x03);
    }

    function test_RevertWhen_NonOwnerAdministers() public {
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hub.setSigner(stranger, 0x0F);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hub.setExecutor(stranger, true);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hub.setPool(stranger);
        vm.stopPrank();
    }

    function test_SetPool() public {
        address pool2 = makeAddr("pool2");
        vm.expectEmit(address(hub));
        emit ProcessorHub.PoolSet(pool2);
        vm.prank(owner);
        hub.setPool(pool2);
        assertEq(hub.pool(), pool2);
    }

    function test_RevertWhen_PoolSetToZero() public {
        vm.prank(owner);
        vm.expectRevert(ProcessorHub.ZeroAddress.selector);
        hub.setPool(address(0));
    }

    function test_SetExecutor_RevokeStopsDelivery() public {
        vm.expectEmit(address(hub));
        emit ProcessorHub.ExecutorSet(executor, false);
        vm.prank(owner);
        hub.setExecutor(executor, false);
        assertFalse(hub.executors(executor));
    }

    function test_SupportsReceiverInterface() public view {
        assertTrue(hub.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(hub.supportsInterface(type(IERC165).interfaceId));
        assertFalse(hub.supportsInterface(0xffffffff));
    }
}

contract ProcessorHubAccountsTest is HubBase {
    function test_AccountOf_MatchesDeployedAddress() public {
        address predicted = hub.accountOf(payer);
        assertEq(predicted.code.length, 0);
        vm.expectEmit(address(hub));
        emit ProcessorHub.AccountDeployed(payer, predicted);
        address deployed = hub.deployAccount(payer);
        assertEq(deployed, predicted);
        assertEq(DepositAccount(deployed).payer(), payer);
        assertEq(DepositAccount(deployed).hub(), address(hub));
    }

    function test_FundsSentBeforeDeploymentAreVisible() public {
        _deposit(payer, 100e6);
        address account = hub.deployAccount(payer);
        assertEq(usdc.balanceOf(account), 100e6);
    }

    function test_DifferentPayersDifferentAddresses() public {
        assertTrue(hub.accountOf(payer) != hub.accountOf(makeAddr("other")));
    }

    function test_RepeatDeployIsIdempotent() public {
        address first = hub.deployAccount(payer);
        vm.recordLogs();
        address second = hub.deployAccount(payer);
        assertEq(first, second);
        assertEq(vm.getRecordedLogs().length, 0);
    }
}

contract ProcessorHubFactoryTest is HubBase {
    ProcessorHubFactory internal factory;

    function setUp() public override {
        super.setUp();
        factory = new ProcessorHubFactory();
    }

    function test_DeployRecordsAndEmits() public {
        address h = factory.deploy(owner, pool);
        assertTrue(factory.isHub(h));
        assertEq(ProcessorHub(h).owner(), owner);
        assertEq(ProcessorHub(h).pool(), pool);
        assertFalse(factory.isHub(address(hub)));
    }

    function test_DeployEmitsHubDeployed() public {
        address expected = vm.computeCreateAddress(address(factory), vm.getNonce(address(factory)));
        vm.expectEmit(address(factory));
        emit ProcessorHubFactory.HubDeployed(expected, owner);
        factory.deploy(owner, pool);
    }

    function test_RevertWhen_ZeroOwnerOrPool() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        factory.deploy(address(0), pool);
        vm.expectRevert(ProcessorHub.ZeroAddress.selector);
        factory.deploy(owner, address(0));
    }

    function test_FactoryHasNoAuthority() public {
        ProcessorHub h = ProcessorHub(factory.deploy(owner, pool));
        vm.startPrank(address(factory));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(factory)));
        h.setSigner(address(factory), 0x0F);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(factory)));
        h.setExecutor(address(factory), true);
        vm.stopPrank();
        assertFalse(h.executors(address(factory)));
    }
}
