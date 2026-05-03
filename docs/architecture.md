# Architecture

## Core Data Types

- Note: private wallet-side data containing amount, owner key, serial number, and secret.
- Commitment: public hash of a note. This is what enters the shielded pool.
- Merkle root: public summary of all commitments currently accepted by the pool.
- Merkle path: private witness proving a commitment exists in the tree.
- Nullifier: public one-time hash derived from the note serial number to prevent double spends.
- Proof: zk-SNARK proof that the transaction constraints are satisfied.

## Deposit Flow

1. Wallet creates a random serial number and secret.
2. Wallet computes `commitment = Hash(amount, serial, secret, ownerPublicKey)`.
3. Contract stores only the commitment in the Merkle tree.
4. Wallet keeps the full note privately.

## Private Transfer Flow

1. Wallet selects an unspent input note.
2. Wallet creates a receiver note and a change note.
3. Circuit checks:
   - input note commitment is in the Merkle tree
   - input note belongs to the spender
   - nullifier matches the input serial number
   - input amount equals receiver amount plus change amount
   - output commitments match the new private notes
4. Contract verifies the proof against public inputs.
5. Contract marks the nullifier as spent and inserts output commitments.

## Production Path

The production implementation should use Poseidon consistently across:

- `circuits/shielded_transfer.circom`
- wallet proof generation code
- Solidity hash contract

The included Solidity `KeccakHasher` is a development fallback for contract compilation and structure. It is not circuit-compatible with the included Poseidon circuit.
