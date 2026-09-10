// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {IAttestationRegistry} from "../src/interfaces/IAttestationRegistry.sol";
import {GatewayFactory} from "../src/GatewayFactory.sol";

contract DeployGatewayFactory is Script {
    function run(IAttestationRegistry _registry,address _forwarder) external {
        vm.startBroadcast();
        new GatewayFactory(_registry, _forwarder, address(0), bytes10(0));
        vm.stopBroadcast();
    }
}
