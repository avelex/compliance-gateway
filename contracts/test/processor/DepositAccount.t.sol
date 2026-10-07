// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DepositAccount} from "../../src/processor/DepositAccount.sol";
import {MockUSDC} from "./HubBase.sol";

// The test contract plays the hub: it deploys the account and answers pool().
contract DepositAccountTest is Test {
    MockUSDC internal usdc;
    DepositAccount internal account;
    address internal payer = makeAddr("payer");
    address public pool = makeAddr("pool");

    function setUp() public {
        usdc = new MockUSDC();
        account = new DepositAccount(payer);
        usdc.mint(address(account), 100e6);
    }

    function test_ReleaseToPool() public {
        account.release(IERC20(address(usdc)), 60e6, true);
        assertEq(usdc.balanceOf(pool), 60e6);
        assertEq(usdc.balanceOf(address(account)), 40e6);
    }

    function test_ReleaseToPayer() public {
        account.release(IERC20(address(usdc)), 100e6, false);
        assertEq(usdc.balanceOf(payer), 100e6);
    }

    function test_RevertWhen_OutsiderReleases() public {
        vm.prank(payer);
        vm.expectRevert(DepositAccount.NotHub.selector);
        account.release(IERC20(address(usdc)), 1, false);
    }
}
