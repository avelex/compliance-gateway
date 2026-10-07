// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ProcessorHub} from "./ProcessorHub.sol";

/// @notice Fixed address that indexers and executors watch to learn about new hubs.
///         Keeps no role in any hub it deploys.
contract ProcessorHubFactory {
    mapping(address => bool) public isHub;

    event HubDeployed(address indexed hub, address indexed owner);

    function deploy(address owner, address pool) external returns (address hub) {
        hub = address(new ProcessorHub(owner, pool));
        isHub[hub] = true;
        emit HubDeployed(hub, owner);
    }
}
