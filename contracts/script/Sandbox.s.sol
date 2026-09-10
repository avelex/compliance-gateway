// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/src/Script.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {GatewayFactory} from "../src/GatewayFactory.sol";
import {IAttestationRegistry} from "../src/interfaces/IAttestationRegistry.sol";
import {MerchantConfig, Policy} from "../src/libs/Merchant.sol";

contract MockUSDC is ERC20 {
    constructor(address holder) ERC20("Mock USDC", "mUSDC") {
        _mint(holder, 1_000_000e6);
    }
}

/// @notice Deploys the full stack to a local anvil node for manual/cast-driven
/// sandbox testing. Not for testnet/mainnet — forwarder is an anvil test key,
/// not a real KeystoneForwarder.
contract SandboxScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("SANDBOX_DEPLOYER_KEY");
        address deployer = vm.addr(deployerKey);
        address forwarder = vm.envAddress("SANDBOX_FORWARDER");
        address merchant = vm.envAddress("SANDBOX_MERCHANT");
        address payoutTo = vm.envAddress("SANDBOX_PAYOUT_TO");
        address payer = vm.envAddress("SANDBOX_PAYER");

        vm.startBroadcast(deployerKey);

        MockUSDC token = new MockUSDC(deployer);

        AttestationRegistry registry = new AttestationRegistry(forwarder);
        GatewayFactory factory =
            new GatewayFactory(IAttestationRegistry(address(registry)), forwarder, address(0), bytes10(0));

        Policy memory policy = Policy({levelBelow: 1, levelAbove: 1, threshold: 10_000e6, maxRisk: 80});
        MerchantConfig memory merchConfig =
            MerchantConfig({merchant: merchant, payoutTo: payoutTo, token: IERC20(address(token)), policy: policy});
        address gate = factory.deploy(merchConfig);

        token.transfer(payer, 1_000e6);

        vm.stopBroadcast();

        console.log("token          ", address(token));
        console.log("registry       ", address(registry));
        console.log("factory        ", address(factory));
        console.log("gate           ", gate);
    }
}
