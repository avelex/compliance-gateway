// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IGatewayFactory {
    function emitPaymentOpened(bytes32 id, address payer, uint256 amount) external;
}
