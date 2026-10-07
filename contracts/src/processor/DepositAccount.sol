// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPoolSource {
    function pool() external view returns (address);
}

/// @notice One payer's deposit address. Funded by plain ERC-20 transfers.
///
/// There is no destination parameter on purpose: whatever the hub does, funds here can only reach
/// the processor's pool or go back to the payer this account was created for.
contract DepositAccount {
    using SafeERC20 for IERC20;

    address public immutable hub;
    address public immutable payer;

    error NotHub();

    constructor(address payer_) {
        hub = msg.sender;
        payer = payer_;
    }

    function release(IERC20 token, uint256 amount, bool toPool) external {
        if (msg.sender != hub) revert NotHub();
        token.safeTransfer(toPool ? IPoolSource(hub).pool() : payer, amount);
    }
}
