# Anonymous ZK Payment System

This repo is a BTP-oriented prototype for a Zcash-style private payment system. It models a shielded pool where public ledger entries are commitments, Merkle roots, nullifiers, and zk proofs instead of visible sender, receiver, and amount data.

## What Is Included

- A runnable Node.js simulation of deposits, shielded transfers, Merkle membership, and double-spend rejection.
- Solidity contracts for an on-chain shielded pool with pluggable hash and verifier interfaces.
- A Circom circuit that expresses the private-transfer constraints: note ownership, Merkle membership, output commitment correctness, nullifier derivation, and value conservation.
- Tests for the local model, including privacy shape and nullifier reuse prevention.

## Quick Start

```bash
npm install
npm test
npm run demo
```

The simulation uses a mock proof system so it can run without a trusted setup or generated verifier. The circuit and contract files show the production path:

```bash
npm run compile:circuit
npm run compile:contracts
```

## Architecture

1. A deposit creates a private note and publishes only its commitment.
2. Commitments are inserted into a Merkle tree representing the shielded pool.
3. A private transfer spends one note and creates two output notes: receiver amount and sender change.
4. The public transaction contains only:
   - old Merkle root
   - nullifier hash
   - output commitments
   - zk proof
5. The pool rejects reused nullifiers, which prevents double spending without revealing which note was spent.

## Important Prototype Boundary

The JavaScript proof system is intentionally a mock so the BTP flow is easy to run and test. For a real deployment, generate a Groth16 verifier with SnarkJS from `circuits/shielded_transfer.circom`, deploy that verifier, and replace the development hash contract with a Poseidon-compatible Solidity hasher.
