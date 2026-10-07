// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IReceiver} from "../interfaces/IReceiver.sol";
import {DepositAccount} from "./DepositAccount.sol";
import {
    Decision,
    Payment,
    Status,
    CREDIT,
    HOLD,
    FREEZE,
    RETURN,
    DECISION_TYPEHASH,
    DOMAIN_TYPEHASH
} from "./libs/Decision.sol";

/// @notice One per processor. Executes processor-signed decisions on per-payer deposit accounts.
///
/// Authority is the processor's EIP-712 signature, not the executor: the CRE forwarder and a
/// deflow-workflow submitter both only deliver. That is why this is not a ReceiverTemplate —
/// workflow identity is irrelevant here, and a zero forwarder there fails open.
contract ProcessorHub is IReceiver, Ownable {
    bytes32 private constant NAME_HASH = keccak256("Deflow Decision");
    bytes32 private constant VERSION_HASH = keccak256("1");

    address public pool;
    mapping(address => uint8) public signerMask; // bit (1 << (decision - 1)) permits that decision
    mapping(address => bool) public executors;
    mapping(bytes32 => Payment) public payments;
    mapping(address account => mapping(address token => uint256)) public reserved;

    event SignerSet(address indexed signer, uint8 mask);
    event ExecutorSet(address indexed executor, bool allowed);
    event PoolSet(address indexed pool);
    event AccountDeployed(address indexed payer, address account);
    event DecisionExecuted(
        bytes32 indexed paymentId,
        address indexed payer,
        address account,
        uint8 decision,
        Status status,
        bytes32 packHash,
        uint64 nonce,
        bytes32 lockCommitment
    );

    error ZeroAddress();
    error NotExecutor();
    error UnknownDecision();
    error Expired();
    error NotPermitted(address signer);
    error StaleNonce();
    error Terminal();
    error Mismatch();
    error InsufficientFree();
    error Frozen();

    constructor(address owner_, address pool_) Ownable(owner_) {
        _setPool(pool_);
    }

    // ---- administration -------------------------------------------------------------------

    function setSigner(address signer, uint8 mask) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        signerMask[signer] = mask;
        emit SignerSet(signer, mask);
    }

    function setExecutor(address executor, bool allowed) external onlyOwner {
        if (executor == address(0)) revert ZeroAddress();
        executors[executor] = allowed;
        emit ExecutorSet(executor, allowed);
    }

    function setPool(address pool_) external onlyOwner {
        _setPool(pool_);
    }

    function _setPool(address pool_) internal {
        if (pool_ == address(0)) revert ZeroAddress();
        pool = pool_;
        emit PoolSet(pool_);
    }

    // ---- deposit accounts -----------------------------------------------------------------

    function accountOf(address payer) public view returns (address) {
        return Create2.computeAddress(_salt(payer), _initCodeHash(payer));
    }

    function deployAccount(address payer) public returns (address account) {
        account = accountOf(payer);
        if (account.code.length > 0) return account;
        new DepositAccount{salt: _salt(payer)}(payer);
        emit AccountDeployed(payer, account);
    }

    function _salt(address payer) private pure returns (bytes32) {
        return bytes32(uint256(uint160(payer)));
    }

    function _initCodeHash(address payer) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(type(DepositAccount).creationCode, abi.encode(payer)));
    }

    // ---- decisions ------------------------------------------------------------------------

    /// @notice EIP-712 digest of `d` under the domain of a deposit account (`accountOf(payer)`).
    ///         Binding the domain to the account stops a signature for one payer working for another.
    function decisionDigest(address account, Decision memory d) public view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, account));
        bytes32 structHash = keccak256(
            abi.encode(DECISION_TYPEHASH, d.paymentId, d.decision, d.token, d.amount, d.packHash, d.nonce, d.deadline)
        );
        return MessageHashUtils.toTypedDataHash(domain, structHash);
    }

    /// @param report abi.encode(address payer, Decision decision, bytes signature). Metadata is ignored.
    function onReport(bytes calldata, bytes calldata report) external override {
        if (!executors[msg.sender]) revert NotExecutor();
        (address payer, Decision memory d, bytes memory sig) = abi.decode(report, (address, Decision, bytes));
        _execute(payer, d, sig);
    }

    function _execute(address payer, Decision memory d, bytes memory sig) internal {
        if (d.decision < CREDIT || d.decision > RETURN) revert UnknownDecision();
        if (block.timestamp > d.deadline) revert Expired();

        address signer = ECDSA.recover(decisionDigest(accountOf(payer), d), sig);
        if (signerMask[signer] & (1 << (d.decision - 1)) == 0) revert NotPermitted(signer);

        address account = deployAccount(payer);
        Payment storage p = payments[d.paymentId];

        if (p.status == Status.None) {
            // First decision fixes payer, token and amount; it may only claim what is not reserved.
            if (d.amount > IERC20(d.token).balanceOf(account) - reserved[account][d.token]) revert InsufficientFree();
            p.payer = payer;
            p.token = d.token;
            p.amount = d.amount;
        } else {
            if (p.status != Status.Held) revert Terminal();
            if (p.payer != payer || p.token != d.token || p.amount != d.amount) revert Mismatch();
        }
        if (d.nonce <= p.nonce) revert StaleNonce();

        bool held = p.status == Status.Held;
        // A freeze has no path back to the payer and cannot be downgraded to a plain hold.
        if (p.lockCommitment != 0 && (d.decision == RETURN || d.decision == HOLD)) revert Frozen();

        p.nonce = d.nonce;
        p.packHash = d.packHash;

        if (d.decision == HOLD || d.decision == FREEZE) {
            if (!held) reserved[account][d.token] += d.amount;
            p.status = Status.Held;
            if (d.decision == FREEZE) p.lockCommitment = keccak256(abi.encode(d.packHash, d.nonce));
            _emit(d, payer, account, p);
        } else {
            if (held) reserved[account][d.token] -= d.amount;
            p.status = d.decision == CREDIT ? Status.Credited : Status.Returned;
            _emit(d, payer, account, p);
            // ponytail: CEI only, no reentrancy guard; add one if hooked tokens are ever used.
            DepositAccount(account).release(IERC20(d.token), d.amount, d.decision == CREDIT);
        }
    }

    function _emit(Decision memory d, address payer, address account, Payment storage p) private {
        emit DecisionExecuted(d.paymentId, payer, account, d.decision, p.status, d.packHash, d.nonce, p.lockCommitment);
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
