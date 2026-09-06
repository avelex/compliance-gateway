// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

struct MerchantConfig {
    address merchant;
    address payoutTo;
    IERC20 token;
    Policy policy;
}

/// @notice Merchant-chosen requirements.
struct Policy {
    uint8 levelBelow; // required level when amount <  threshold
    uint8 levelAbove; // required level when amount >= threshold
    uint256 threshold; // in token units
    uint8 maxRisk; // provenance risk-score ceiling, 0..100
}

/// @dev None must be the zero value: otherwise an unknown id is indistinguishable from a pending one.
enum Status {
    None,
    Pending,
    Settled,
    Refunded
}

struct Payment {
    address payer;
    uint64 openedAt;
    uint8 maxRisk; // policy snapshot at pay()
    Status status;
    uint256 amount;
}

struct Spend {
    uint64 windowStart;
    uint256 amount;
}