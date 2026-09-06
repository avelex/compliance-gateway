// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IGatewayFactory} from "./interfaces/IGatewayFactory.sol";
import {IAttestationRegistry} from "./interfaces/IAttestationRegistry.sol";
import {ReceiverTemplate} from "./chainlink/ReceiverTemplate.sol";
import {MerchantConfig, Policy, Payment, Spend, Status} from "./libs/Merchant.sol";
import {InfrastructureConfig} from "./libs/Compliance.sol";

// TODO: add reentrancy lock
contract MerchantGateway is ReceiverTemplate {
    using SafeERC20 for IERC20;

    address public payoutTo;
    IERC20 public immutable token;

    IGatewayFactory public immutable factory;
    IAttestationRegistry public immutable registry;
    //ISanctionsOracle public immutable sanctions;

    uint64 public constant TIMEOUT = 15 minutes;
    uint64 public constant SPEND_WINDOW = 24 hours;
    uint256 public constant MAX_THRESHOLD = 10_000e6;
    uint8 public constant MAX_RISK = 80;

    Policy public policy;
    mapping(bytes32 => Payment) public payments;
    mapping(bytes32 => Spend) public spent; // keyed by nullifier, not wallet

    uint256 private _nonce;

    event PolicyChanged(uint8 levelBelow, uint8 levelAbove, uint256 threshold, uint8 maxRisk);
    event PaymentOpened(bytes32 indexed id, address indexed payer, uint256 amount);
    event PaymentSettled(bytes32 indexed id, bool ok);

    error Sanctioned();
    error NotVerified();
    error CumulativeThreshold();
    error PaymentNotPending();
    error ReclaimTooEarly();

    constructor(MerchantConfig memory merchConfig, InfrastructureConfig memory infraConfig)
        ReceiverTemplate(merchConfig.merchant, infraConfig.forwarder)
    {
        require(merchConfig.merchant != address(0));
        require(merchConfig.payoutTo != address(0));
        _validatePolicy(merchConfig.policy);

        payoutTo = merchConfig.payoutTo;
        policy = merchConfig.policy;
        token = merchConfig.token;
        factory = IGatewayFactory(msg.sender);
        registry = infraConfig.registry;
        //sanctions = sanctions_;
        emit PolicyChanged(policy.levelBelow, policy.levelAbove, policy.threshold, policy.maxRisk);
    }

    function pay(uint256 amount) external returns (bytes32 id) {
        // require(!sanctions.isSanctioned(msg.sender), "sanctioned address");
        require(amount > 0);

        Policy memory p = policy;
        uint8 reqLevel = amount >= p.threshold ? p.levelAbove : p.levelBelow;

        if (reqLevel > 0) {
            if (!registry.isValid(address(this), msg.sender, reqLevel)) {
                revert NotVerified();
            }

            bytes32 n = registry.nullifierOf(address(this), msg.sender);

            Spend storage s = spent[n];
            if (block.timestamp - s.windowStart >= SPEND_WINDOW) {
                s.windowStart = uint64(block.timestamp);
                s.amount = 0;
            }

            s.amount += amount;

            if (s.amount >= p.threshold && !registry.isValid(address(this), msg.sender, p.levelAbove)) {
                revert CumulativeThreshold();
            }
        }

        id = keccak256(abi.encode(msg.sender, amount, block.number, _nonce++));
        payments[id] = Payment(msg.sender, uint64(block.timestamp), p.maxRisk, Status.Pending, amount);
        token.safeTransferFrom(msg.sender, address(this), amount);

        // trigger workflow
        emit PaymentOpened(id, msg.sender, amount);
        factory.emitPaymentOpened(id, msg.sender, amount);
    }

    function _processReport(bytes calldata report) internal override {
        (bytes32 id, bool ok) = abi.decode(report, (bytes32, bool));
        Payment storage p = payments[id];

        if (p.status != Status.Pending) {
            revert PaymentNotPending();
        }

        p.status = ok ? Status.Settled : Status.Refunded;
        token.safeTransfer(ok ? payoutTo : p.payer, p.amount);
        emit PaymentSettled(id, ok);
    }

    function reclaim(bytes32 id) external {
        Payment storage p = payments[id];
        
        if (p.status != Status.Pending) {
            revert PaymentNotPending();
        }

        if (block.timestamp < p.openedAt + TIMEOUT) {
            revert ReclaimTooEarly();
        }

        p.status = Status.Refunded;
        token.safeTransfer(p.payer, p.amount);
    }

    function setPolicy(Policy calldata p) external onlyOwner {
        _validatePolicy(p);
        policy = p;
        emit PolicyChanged(policy.levelBelow, policy.levelAbove, policy.threshold, policy.maxRisk);
    }

    function _validatePolicy(Policy memory p) internal pure {
        require(p.levelBelow <= 2 && p.levelAbove <= 2, "bad level");
        require(p.levelAbove == 0 || p.levelBelow >= 1, "threshold without identity");
        require(p.threshold <= MAX_THRESHOLD, "threshold too high");
        require(p.maxRisk <= MAX_RISK, "risk cap too high");
    }
}
