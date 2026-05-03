// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHasher} from "../interfaces/IHasher.sol";

contract KeccakHasher is IHasher {
    function hashLeftRight(bytes32 left, bytes32 right) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(left, right));
    }
}
