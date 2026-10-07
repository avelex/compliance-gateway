// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ProcessorHub} from "../../src/processor/ProcessorHub.sol";
import {Decision} from "../../src/processor/libs/Decision.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

abstract contract HubBase is Test {
    uint8 internal constant MASK_AUTO = 0x03; // CREDIT | HOLD
    uint8 internal constant MASK_OFFICER = 0x0F;

    MockUSDC internal usdc;
    ProcessorHub internal hub;

    address internal owner = makeAddr("owner");
    address internal pool = makeAddr("pool");
    address internal executor = makeAddr("executor");
    address internal payer = makeAddr("payer");
    uint256 internal officerKey;
    uint256 internal autoKey;

    function setUp() public virtual {
        usdc = new MockUSDC();
        hub = new ProcessorHub(owner, pool);
        address officer;
        address auto_;
        (officer, officerKey) = makeAddrAndKey("officer");
        (auto_, autoKey) = makeAddrAndKey("auto");
        vm.startPrank(owner);
        hub.setSigner(officer, MASK_OFFICER);
        hub.setSigner(auto_, MASK_AUTO);
        hub.setExecutor(executor, true);
        vm.stopPrank();
    }

    function _deposit(address who, uint256 amount) internal {
        usdc.mint(hub.accountOf(who), amount);
    }

    function _decision(bytes32 id, uint8 kind, uint256 amount, uint64 nonce) internal view returns (Decision memory) {
        return Decision({
            paymentId: id,
            decision: kind,
            token: address(usdc),
            amount: amount,
            packHash: keccak256(abi.encode("pack", id, nonce)),
            nonce: nonce,
            deadline: uint64(block.timestamp + 1 hours)
        });
    }

    function _report(uint256 key, address who, Decision memory d) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, hub.decisionDigest(hub.accountOf(who), d));
        return abi.encode(who, d, abi.encodePacked(r, s, v));
    }

    function _deliver(uint256 key, address who, Decision memory d) internal {
        bytes memory report = _report(key, who, d);
        vm.prank(executor);
        hub.onReport("", report);
    }
}
