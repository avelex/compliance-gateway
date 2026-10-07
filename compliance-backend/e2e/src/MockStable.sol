// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Test stablecoin with a USDC-style issuer blacklist. No constructor state, so tests can place its
///         runtime code at a fixed address with anvil_setCode (the address eventscale's dev config watches).
///         Unlike USDC, transfers are not blocked for listed addresses, so a test can produce a deposit
///         that the issuer check then reports as LISTED.
contract MockStable {
    event Transfer(address indexed from, address indexed to, uint256 value);

    mapping(address => uint256) public balanceOf;
    mapping(address => bool) public isBlacklisted;

    function decimals() external pure returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function blacklist(address who, bool listed) external {
        isBlacklisted[who] = listed;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
}

/// @notice A token without isBlacklisted, for the fail-closed issuer check.
contract PlainToken {
    event Transfer(address indexed from, address indexed to, uint256 value);

    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
}
