// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";

contract DeployAttestationRegistry is Script {
    function run(address _forwarder) external {
        vm.startBroadcast();
        new AttestationRegistry(_forwarder);
        vm.stopBroadcast();
    }
}
