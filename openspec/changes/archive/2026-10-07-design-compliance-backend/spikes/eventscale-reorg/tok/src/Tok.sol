// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Emits a USDC-shaped Transfer on demand. Spike T2 only.
contract Tok {
    event Transfer(address indexed from, address indexed to, uint256 value);

    function t(address to, uint256 value) external {
        emit Transfer(msg.sender, to, value);
    }
}
