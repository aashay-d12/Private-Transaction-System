// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IHasher {
    function hashLeftRight(bytes32 left, bytes32 right) external pure returns (bytes32);
}
