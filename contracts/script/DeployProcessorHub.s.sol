// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {ProcessorHub} from "../src/processor/ProcessorHub.sol";
import {ProcessorHubFactory} from "../src/processor/ProcessorHubFactory.sol";

/// @notice Deploys a ProcessorHubFactory (unless HUB_FACTORY is given) and one hub.
///   HUB_OWNER, HUB_POOL            required
///   SIGNER, SIGNER_MASK            optional; mask bits CREDIT=1 HOLD=2 FREEZE=4 RETURN=8
///   EXECUTOR                       optional; CRE forwarder or deflow-workflow submitter
///   HUB_FACTORY                    optional; reuse an existing factory
/// The broadcaster owns the hub while configuring it, then hands it to HUB_OWNER.
contract DeployProcessorHub is Script {
    function run() external {
        address owner = vm.envAddress("HUB_OWNER");
        address pool = vm.envAddress("HUB_POOL");
        address signer = vm.envOr("SIGNER", address(0));
        uint256 mask = vm.envOr("SIGNER_MASK", uint256(0));
        address executor = vm.envOr("EXECUTOR", address(0));
        address factoryAddr = vm.envOr("HUB_FACTORY", address(0));

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        ProcessorHubFactory factory =
            factoryAddr == address(0) ? new ProcessorHubFactory() : ProcessorHubFactory(factoryAddr);
        ProcessorHub hub = ProcessorHub(factory.deploy(deployer, pool));
        if (signer != address(0)) hub.setSigner(signer, uint8(mask));
        if (executor != address(0)) hub.setExecutor(executor, true);
        if (owner != deployer) hub.transferOwnership(owner);
        vm.stopBroadcast();

        console.log("factory", address(factory));
        console.log("hub", address(hub));
    }
}
