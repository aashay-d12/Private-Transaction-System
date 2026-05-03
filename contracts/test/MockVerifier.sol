// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVerifier} from "../interfaces/IVerifier.sol";

contract MockVerifier is IVerifier {
    mapping(bytes32 => bool) public acceptedProofs;

    function acceptProof(bytes calldata proof, bytes32[] calldata publicInputs) external {
        acceptedProofs[_proofKey(proof, publicInputs)] = true;
    }

    function verifyProof(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool) {
        return acceptedProofs[_proofKey(proof, publicInputs)];
    }

    function _proofKey(bytes calldata proof, bytes32[] calldata publicInputs) private pure returns (bytes32) {
        return keccak256(abi.encode(proof, publicInputs));
    }
}
