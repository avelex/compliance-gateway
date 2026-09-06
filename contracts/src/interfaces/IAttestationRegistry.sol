// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IAttestationRegistry {
    function isValid(address gate, address wallet, uint8 minLevel) external view returns (bool);
    function nullifierOf(address gate, address wallet) external view returns (bytes32);
}