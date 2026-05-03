// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHasher} from "./interfaces/IHasher.sol";
import {IVerifier} from "./interfaces/IVerifier.sol";

contract ShieldedPool {
    uint32 public constant TREE_DEPTH = 20;
    uint32 public constant MAX_LEAVES = uint32(1) << TREE_DEPTH;

    IHasher public immutable hasher;
    IVerifier public verifier;
    address public owner;

    bytes32 public currentRoot;
    uint32 public nextLeafIndex;

    bytes32[TREE_DEPTH] public zeroes;
    bytes32[TREE_DEPTH] public filledSubtrees;

    mapping(bytes32 => bool) public knownRoots;
    mapping(bytes32 => bool) public commitments;
    mapping(bytes32 => bool) public nullifierHashes;

    event Deposit(bytes32 indexed commitment, uint32 leafIndex, bytes32 root, uint256 value);
    event PrivateTransfer(bytes32 indexed nullifierHash, bytes32[2] outputCommitments, bytes32 oldRoot, bytes32 newRoot);

    error EmptyCommitment();
    error EmptyNullifier();
    error DuplicateCommitment();
    error DuplicateNullifier();
    error InvalidRoot();
    error InvalidProof();
    error TreeFull();
    error Unauthorized();
    error ZeroDeposit();

    constructor(IHasher initialHasher, IVerifier initialVerifier) {
        hasher = initialHasher;
        verifier = initialVerifier;
        owner = msg.sender;

        bytes32 zero = bytes32(0);
        for (uint32 level = 0; level < TREE_DEPTH; level++) {
            zeroes[level] = zero;
            filledSubtrees[level] = zero;
            zero = hasher.hashLeftRight(zero, zero);
        }

        currentRoot = zero;
        knownRoots[zero] = true;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function setVerifier(IVerifier newVerifier) external onlyOwner {
        verifier = newVerifier;
    }

    function deposit(bytes32 commitment) external payable returns (uint32 leafIndex, bytes32 root) {
        if (msg.value == 0) revert ZeroDeposit();
        if (commitment == bytes32(0)) revert EmptyCommitment();
        if (commitments[commitment]) revert DuplicateCommitment();

        commitments[commitment] = true;
        (leafIndex, root) = _insert(commitment);

        emit Deposit(commitment, leafIndex, root, msg.value);
    }

    function privateTransfer(
        bytes calldata proof,
        bytes32 root,
        bytes32 nullifierHash,
        bytes32[2] calldata outputCommitments
    ) external returns (bytes32 newRoot) {
        if (!knownRoots[root]) revert InvalidRoot();
        if (nullifierHash == bytes32(0)) revert EmptyNullifier();
        if (nullifierHashes[nullifierHash]) revert DuplicateNullifier();
        if (outputCommitments[0] == bytes32(0) || outputCommitments[1] == bytes32(0)) revert EmptyCommitment();
        if (outputCommitments[0] == outputCommitments[1]) revert DuplicateCommitment();
        if (commitments[outputCommitments[0]] || commitments[outputCommitments[1]]) revert DuplicateCommitment();

        bytes32[] memory publicInputs = new bytes32[](4);
        publicInputs[0] = root;
        publicInputs[1] = nullifierHash;
        publicInputs[2] = outputCommitments[0];
        publicInputs[3] = outputCommitments[1];

        if (!verifier.verifyProof(proof, publicInputs)) revert InvalidProof();

        nullifierHashes[nullifierHash] = true;
        commitments[outputCommitments[0]] = true;
        commitments[outputCommitments[1]] = true;

        _insert(outputCommitments[0]);
        (, newRoot) = _insert(outputCommitments[1]);

        emit PrivateTransfer(nullifierHash, outputCommitments, root, newRoot);
    }

    function _insert(bytes32 leaf) internal returns (uint32 leafIndex, bytes32 root) {
        if (nextLeafIndex >= MAX_LEAVES) revert TreeFull();

        leafIndex = nextLeafIndex;
        uint32 cursor = nextLeafIndex;
        bytes32 current = leaf;

        for (uint32 level = 0; level < TREE_DEPTH; level++) {
            if (cursor % 2 == 0) {
                filledSubtrees[level] = current;
                current = hasher.hashLeftRight(current, zeroes[level]);
            } else {
                current = hasher.hashLeftRight(filledSubtrees[level], current);
            }

            cursor /= 2;
        }

        nextLeafIndex += 1;
        currentRoot = current;
        knownRoots[current] = true;

        return (leafIndex, current);
    }
}
