// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IGatewayFactory} from "./interfaces/IGatewayFactory.sol";
import {IAttestationRegistry} from "./interfaces/IAttestationRegistry.sol";
import {MerchantConfig} from "./libs/Merchant.sol";
import {InfrastructureConfig} from "./libs/Compliance.sol";
import {MerchantGateway} from "./MerchantGateway.sol";

/// @notice Deploys gates and is the sole emitter of PaymentOpened.
///
/// The CRE log trigger takes a fixed list of addresses, and gates are born at addresses the
/// workflow cannot know at deploy time. One fixed emitter removes the reconfiguration per merchant;
/// the gate address rides in the first field so the workflow knows where to send the verdict back.
contract GatewayFactory is IGatewayFactory {
    IAttestationRegistry public registry;
    //ISanctionsOracle public immutable sanctions;
    address public immutable forwarder;
    address public immutable workflowOwner;
    bytes10 public immutable workflowName;

    mapping(address => bool) private _isGate;

    event GatewayDeployed(address indexed gate);
    event PaymentOpened(address indexed gate, bytes32 indexed id, address payer, uint256 amount);

    constructor(
        IAttestationRegistry registry_,
        //ISanctionsOracle sanctions_,
        address forwarder_,
        address workflowOwner_,
        bytes10 workflowName_
    ) {
        registry = registry_;
        //sanctions = sanctions_;
        forwarder = forwarder_;
        workflowOwner = workflowOwner_;
        workflowName = workflowName_;
    }

    function deploy(MerchantConfig calldata merchConfig) external returns (address gate) {
        InfrastructureConfig memory ic = InfrastructureConfig(registry, forwarder, workflowOwner, workflowName);
        gate = address(new MerchantGateway(merchConfig, ic));
        _isGate[gate] = true;
        emit GatewayDeployed(gate);
    }

    /// @dev Without the gate check anyone could forge the event and make the workflow settle
    ///      somebody else's payment.
    function emitPaymentOpened(bytes32 id, address payer, uint256 amount) external {
        require(_isGate[msg.sender], "not a gate");
        emit PaymentOpened(msg.sender, id, payer, amount);
    }
}
